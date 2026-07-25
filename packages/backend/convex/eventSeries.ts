import { occurrenceStartAt } from "@arbor/format";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireArborInternalContext, requireAuth } from "./lib/auth";
import { normalizeEventStatus } from "./lib/eventStatus";
import { RENTAL_EVENT_TYPES } from "./eventPullLists";
import {
  blocksToTemplates,
  buildEventPatchFromSeriesTemplate,
  computeOccurrenceStarts,
  EVENT_TIMEZONE,
  materializeOccurrence,
  propagateInvoiceIdToSeriesOccurrences,
  replaceEmptyShiftsFromTemplates,
  replaceScheduleBlocksFromTemplates,
  resolveDefaultCrewHourlyRateUsd,
  shiftsToTemplates,
  shouldApplySeriesUpdate,
  type SeriesEditScope,
} from "./lib/eventSeriesGeneration";
import { syncEventCrewCostUsd } from "./lib/crewCost";
import { syncEventStatusForLinkedInvoice } from "./lib/eventStatus";
import { computeSeriesCostSummary, effectiveCrewUsd } from "./lib/eventSeriesCosts";
import { resolveVenueLink } from "./lib/venues";
import { resolveHostLink } from "./lib/hostOrgs";

const eventTypeValue = v.union(
  v.literal("Crewed Event"),
  v.literal("Rental with Crew"),
  v.literal("Dry Hire"),
  v.literal("Dry Rental"),
  v.literal("Services Only"),
);

const eventTeamValue = v.union(
  v.literal("Design"),
  v.literal("Marketing"),
  v.literal("Lighting"),
  v.literal("Sound"),
  v.literal("Operations"),
);

const rentalFulfillmentModeValue = v.union(v.literal("delivery"), v.literal("will_call"));

const blockTemplateValue = v.object({
  blockType: v.union(
    v.literal("setup"),
    v.literal("show"),
    v.literal("strike"),
    v.literal("custom"),
  ),
  label: v.string(),
  dayIndex: v.number(),
  offsetMs: v.number(),
  durationMs: v.number(),
  notes: v.optional(v.string()),
});

const shiftTemplateValue = v.object({
  role: v.string(),
  blockTemplateIndex: v.number(),
  offsetMs: v.number(),
  durationMs: v.number(),
  estimatedHourlyRateUsd: v.optional(v.number()),
  notes: v.optional(v.string()),
});

const seriesEditScopeValue = v.union(v.literal("this"), v.literal("future"), v.literal("all"));

function trimOptional(value: string | undefined) {
  const out = value?.trim();
  return out ? out : undefined;
}

function resolveRentalFulfillmentMode(
  eventType: string | undefined,
  rentalFulfillmentMode: "delivery" | "will_call" | undefined,
) {
  if (!eventType || !RENTAL_EVENT_TYPES.has(eventType)) return undefined;
  return rentalFulfillmentMode;
}

async function listOccurrencesForSeries(ctx: QueryCtx | MutationCtx, seriesId: Id<"eventSeries">) {
  const rows = await ctx.db
    .query("events")
    .withIndex("by_seriesId_and_occurrenceIndex", (q) => q.eq("seriesId", seriesId))
    .take(200);
  return rows.sort((a, b) => (a.occurrenceIndex ?? 0) - (b.occurrenceIndex ?? 0));
}

async function computeShiftStats(ctx: QueryCtx | MutationCtx, eventId: Id<"events">) {
  const shifts = await ctx.db
    .query("eventCrewShifts")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(500);
  const totalShifts = shifts.length;
  const assignedShifts = shifts.filter((shift) => Boolean(shift.userId?.trim())).length;
  return {
    totalShifts,
    assignedShifts,
    isCrewConfirmed: totalShifts > 0 && assignedShifts === totalShifts,
  };
}

export const list = query({
  args: {
    status: v.optional(v.union(v.literal("active"), v.literal("paused"), v.literal("ended"))),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const rows = await ctx.db
      .query("eventSeries")
      .withIndex("by_createdAt")
      .order("desc")
      .take(200);
    const filtered = args.status ? rows.filter((row) => row.status === args.status) : rows;
    return filtered.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const get = query({
  args: { id: v.id("eventSeries") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const series = await ctx.db.get(args.id);
    if (!series) return null;
    const occurrences = await listOccurrencesForSeries(ctx, args.id);
    const occurrencesWithStats = await Promise.all(
      occurrences.map(async (event) => {
        const shiftStats = await computeShiftStats(ctx, event._id);
        const crewUsd = event.crewCostUsd ?? 0;
        const bandsUsd = event.bandsCostUsd ?? 0;
        const externalUsd = event.externalRentalsCostUsd ?? 0;
        const otherUsd = event.otherCostUsd ?? 0;
        const budgetCrewUsd = effectiveCrewUsd(event, series);
        return {
          ...event,
          status: normalizeEventStatus(event.status),
          ...shiftStats,
          costSummary: {
            crewUsd,
            budgetCrewUsd,
            bandsUsd,
            externalRentalsUsd: externalUsd,
            otherUsd,
            totalUsd: budgetCrewUsd + bandsUsd + externalUsd + otherUsd,
            actualTotalUsd: crewUsd + bandsUsd + externalUsd + otherUsd,
          },
        };
      }),
    );
    const totalOccurrences = series.occurrenceCount ?? occurrences.length;
    const costSummary = computeSeriesCostSummary(series, occurrences);
    return {
      series,
      occurrences: occurrencesWithStats,
      totalOccurrences,
      costSummary,
    };
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    startAt: v.number(),
    endAt: v.number(),
    intervalWeeks: v.number(),
    occurrenceCount: v.optional(v.number()),
    seriesEndAt: v.optional(v.number()),
    requiresShowWindow: v.optional(v.boolean()),
    venueId: v.optional(v.id("venues")),
    venueName: v.optional(v.string()),
    eventType: v.optional(eventTypeValue),
    teamsInterested: v.optional(v.array(eventTeamValue)),
    category: v.optional(v.string()),
    hostGroupId: v.optional(v.id("invoiceGroups")),
    host: v.optional(v.string()),
    expectedTurnout: v.optional(v.number()),
    budgetUsd: v.optional(v.number()),
    occurrenceBandsCostUsd: v.optional(v.number()),
    occurrenceExternalRentalsCostUsd: v.optional(v.number()),
    occurrenceOtherCostUsd: v.optional(v.number()),
    occurrenceBudgetCrewCostUsd: v.optional(v.number()),
    budgetCrewHourlyRateUsd: v.optional(v.number()),
    seriesBandsCostUsd: v.optional(v.number()),
    seriesExternalRentalsCostUsd: v.optional(v.number()),
    seriesOtherCostUsd: v.optional(v.number()),
    dayOfLeadUserId: v.optional(v.string()),
    eventManagerUserId: v.optional(v.string()),
    rentalFulfillmentMode: v.optional(rentalFulfillmentModeValue),
    notes: v.optional(v.string()),
    blockTemplates: v.optional(v.array(blockTemplateValue)),
    shiftTemplates: v.optional(v.array(shiftTemplateValue)),
    invoiceId: v.optional(v.id("invoices")),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    if (args.endAt <= args.startAt) throw new Error("Event end time must be after start time.");
    const occurrenceStarts = computeOccurrenceStarts({
      anchorStartAt: args.startAt,
      intervalWeeks: args.intervalWeeks,
      occurrenceCount: args.occurrenceCount,
      seriesEndAt: args.seriesEndAt,
    });
    const now = Date.now();
    const venueLink = await resolveVenueLink(ctx, args.venueId);
    const hostLink = await resolveHostLink(ctx, args.hostGroupId);
    const seriesId = await ctx.db.insert("eventSeries", {
      title: args.title.trim(),
      status: "active",
      anchorStartAt: args.startAt,
      anchorEndAt: args.endAt,
      intervalWeeks: args.intervalWeeks,
      occurrenceCount: args.occurrenceCount,
      seriesEndAt: args.seriesEndAt,
      timezone: EVENT_TIMEZONE,
      requiresShowWindow: args.requiresShowWindow ?? true,
      venueId: venueLink.venueId,
      venueName: venueLink.venueName,
      eventType: args.eventType,
      teamsInterested: args.teamsInterested && args.teamsInterested.length > 0 ? args.teamsInterested : undefined,
      category: trimOptional(args.category),
      hostGroupId: hostLink.hostGroupId,
      host: hostLink.host,
      expectedTurnout: args.expectedTurnout,
      budgetUsd: args.budgetUsd,
      occurrenceBandsCostUsd: args.occurrenceBandsCostUsd,
      occurrenceExternalRentalsCostUsd: args.occurrenceExternalRentalsCostUsd,
      occurrenceOtherCostUsd: args.occurrenceOtherCostUsd,
      occurrenceBudgetCrewCostUsd: args.occurrenceBudgetCrewCostUsd,
      seriesBandsCostUsd: args.seriesBandsCostUsd,
      seriesExternalRentalsCostUsd: args.seriesExternalRentalsCostUsd,
      seriesOtherCostUsd: args.seriesOtherCostUsd,
      dayOfLeadUserId: trimOptional(args.dayOfLeadUserId),
      eventManagerUserId: trimOptional(args.eventManagerUserId),
      rentalFulfillmentMode: resolveRentalFulfillmentMode(args.eventType, args.rentalFulfillmentMode),
      notes: trimOptional(args.notes),
      blockTemplates: args.blockTemplates,
      shiftTemplates: args.shiftTemplates,
      budgetCrewHourlyRateUsd: args.budgetCrewHourlyRateUsd,
      invoiceId: args.invoiceId,
      createdAt: now,
      updatedAt: now,
    });
    const series = await ctx.db.get(seriesId);
    if (!series) throw new Error("Failed to create event series.");
    const eventIds: Id<"events">[] = [];
    for (let index = 0; index < occurrenceStarts.length; index += 1) {
      const eventId = await materializeOccurrence(ctx, series, index, occurrenceStarts[index]!, now);
      eventIds.push(eventId);
    }
    return { seriesId, firstEventId: eventIds[0]!, eventIds };
  },
});

export const linkInvoice = mutation({
  args: {
    id: v.id("eventSeries"),
    invoiceId: v.id("invoices"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const series = await ctx.db.get(args.id);
    if (!series) throw new Error("Event series not found.");
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) throw new Error("Invoice not found.");
    const now = Date.now();
    await ctx.db.patch(args.id, { invoiceId: args.invoiceId, updatedAt: now });

    const occurrences = await listOccurrencesForSeries(ctx, args.id);
    for (const occurrence of occurrences) {
      if (occurrence.seriesDetached || occurrence.status === "cancelled") continue;
      await ctx.db.patch(occurrence._id, { invoiceId: args.invoiceId, updatedAt: now });
      await syncEventStatusForLinkedInvoice(ctx, occurrence._id, args.invoiceId, occurrence.status);
    }
    return args.id;
  },
});

export const unlinkInvoice = mutation({
  args: { id: v.id("eventSeries") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const series = await ctx.db.get(args.id);
    if (!series) throw new Error("Event series not found.");
    const now = Date.now();
    await ctx.db.patch(args.id, { invoiceId: undefined, updatedAt: now });

    const occurrences = await listOccurrencesForSeries(ctx, args.id);
    for (const occurrence of occurrences) {
      if (occurrence.seriesDetached || occurrence.status === "cancelled") continue;
      await ctx.db.patch(occurrence._id, { invoiceId: undefined, updatedAt: now });
    }
    return args.id;
  },
});

export const updateTemplate = mutation({
  args: {
    id: v.id("eventSeries"),
    scope: seriesEditScopeValue,
    fromOccurrenceIndex: v.optional(v.number()),
    title: v.optional(v.string()),
    anchorStartAt: v.optional(v.number()),
    anchorEndAt: v.optional(v.number()),
    requiresShowWindow: v.optional(v.boolean()),
    venueId: v.optional(v.union(v.id("venues"), v.null())),
    venueName: v.optional(v.string()),
    eventType: v.optional(eventTypeValue),
    teamsInterested: v.optional(v.array(eventTeamValue)),
    category: v.optional(v.string()),
    hostGroupId: v.optional(v.union(v.id("invoiceGroups"), v.null())),
    host: v.optional(v.string()),
    expectedTurnout: v.optional(v.number()),
    budgetUsd: v.optional(v.number()),
    dayOfLeadUserId: v.optional(v.string()),
    eventManagerUserId: v.optional(v.string()),
    rentalFulfillmentMode: v.optional(rentalFulfillmentModeValue),
    notes: v.optional(v.string()),
    blockTemplates: v.optional(v.array(blockTemplateValue)),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const series = await ctx.db.get(args.id);
    if (!series) throw new Error("Event series not found.");
    const now = Date.now();
    const nextAnchorStartAt = args.anchorStartAt ?? series.anchorStartAt;
    const nextAnchorEndAt = args.anchorEndAt ?? series.anchorEndAt;
    if (nextAnchorEndAt <= nextAnchorStartAt) {
      throw new Error("Event end time must be after start time.");
    }
    const nextEventType = args.eventType ?? series.eventType;
    const nextRentalFulfillmentMode =
      args.rentalFulfillmentMode !== undefined
        ? resolveRentalFulfillmentMode(nextEventType, args.rentalFulfillmentMode)
        : resolveRentalFulfillmentMode(nextEventType, series.rentalFulfillmentMode);
    const venueLink =
      args.venueId !== undefined
        ? await resolveVenueLink(ctx, args.venueId)
        : { venueId: series.venueId, venueName: series.venueName, venueAddress: undefined };
    const hostLink =
      args.hostGroupId !== undefined
        ? await resolveHostLink(ctx, args.hostGroupId)
        : { hostGroupId: series.hostGroupId, host: series.host };

    await ctx.db.patch(args.id, {
      title: args.title?.trim() ?? series.title,
      anchorStartAt: nextAnchorStartAt,
      anchorEndAt: nextAnchorEndAt,
      requiresShowWindow: args.requiresShowWindow ?? series.requiresShowWindow,
      venueId: venueLink.venueId,
      venueName: venueLink.venueName,
      eventType: nextEventType,
      teamsInterested: args.teamsInterested ?? series.teamsInterested,
      category: args.category?.trim() ?? series.category,
      hostGroupId: hostLink.hostGroupId,
      host: hostLink.host,
      expectedTurnout: args.expectedTurnout ?? series.expectedTurnout,
      budgetUsd: args.budgetUsd ?? series.budgetUsd,
      dayOfLeadUserId: args.dayOfLeadUserId?.trim() ?? series.dayOfLeadUserId,
      eventManagerUserId: args.eventManagerUserId?.trim() ?? series.eventManagerUserId,
      rentalFulfillmentMode: nextRentalFulfillmentMode,
      notes: args.notes?.trim() ?? series.notes,
      blockTemplates: args.blockTemplates ?? series.blockTemplates,
      updatedAt: now,
    });

    const updatedSeries = await ctx.db.get(args.id);
    if (!updatedSeries) throw new Error("Event series not found.");

    const referenceIndex = args.fromOccurrenceIndex ?? 0;
    const scope = args.scope as SeriesEditScope;
    const occurrences = await listOccurrencesForSeries(ctx, args.id);

    for (const occurrence of occurrences) {
      if (scope === "this") {
        if (occurrence.occurrenceIndex !== referenceIndex) continue;
      } else if (!shouldApplySeriesUpdate(occurrence, scope, referenceIndex, now)) {
        continue;
      }

      const occurrenceIndex = occurrence.occurrenceIndex ?? 0;
      const startAt =
        scope === "this"
          ? occurrence.startAt
          : occurrenceStartAt(
              updatedSeries.anchorStartAt,
              occurrenceIndex,
              updatedSeries.intervalWeeks,
            );
      const patch = buildEventPatchFromSeriesTemplate(updatedSeries, startAt);
      await ctx.db.patch(occurrence._id, { ...patch, updatedAt: now });
    }

    return args.id;
  },
});

export const regenerateFutureBlocks = mutation({
  args: {
    id: v.id("eventSeries"),
    scope: seriesEditScopeValue,
    fromOccurrenceIndex: v.number(),
    blockTemplates: v.optional(v.array(blockTemplateValue)),
  },
  returns: v.object({ updatedCount: v.number() }),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const series = await ctx.db.get(args.id);
    if (!series) throw new Error("Event series not found.");
    const templates = args.blockTemplates ?? series.blockTemplates ?? undefined;
    if (!templates || templates.length === 0) {
      throw new Error("No schedule block templates to apply.");
    }
    const now = Date.now();
    if (args.blockTemplates) {
      await ctx.db.patch(args.id, { blockTemplates: args.blockTemplates, updatedAt: now });
    }
    const occurrences = await listOccurrencesForSeries(ctx, args.id);
    const scope = args.scope as SeriesEditScope;
    let updatedCount = 0;

    for (const occurrence of occurrences) {
      if (scope === "this") {
        if (occurrence.occurrenceIndex !== args.fromOccurrenceIndex) continue;
      } else if (!shouldApplySeriesUpdate(occurrence, scope, args.fromOccurrenceIndex, now)) {
        continue;
      }
      if (occurrence.seriesDetached || occurrence.status === "cancelled") continue;
      await replaceScheduleBlocksFromTemplates(ctx, occurrence._id, occurrence.startAt, templates, now);
      updatedCount += 1;
    }
    return { updatedCount };
  },
});

export const importScheduleFromOccurrence = mutation({
  args: {
    id: v.id("eventSeries"),
    eventId: v.id("events"),
  },
  returns: v.object({ templateCount: v.number() }),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const series = await ctx.db.get(args.id);
    if (!series) throw new Error("Event series not found.");
    const event = await ctx.db.get(args.eventId);
    if (!event || event.seriesId !== args.id) {
      throw new Error("Event is not part of this series.");
    }
    const blocks = await ctx.db
      .query("eventScheduleBlocks")
      .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", args.eventId))
      .take(500);
    if (blocks.length === 0) {
      throw new Error("Selected occurrence has no schedule blocks to import.");
    }
    const templates = blocksToTemplates(
      blocks.map((block) => ({
        blockType: block.blockType,
        label: block.label,
        dayIndex: block.dayIndex,
        startsAt: block.startsAt,
        endsAt: block.endsAt,
        notes: block.notes,
      })),
      event.startAt,
    );
    await ctx.db.patch(args.id, { blockTemplates: templates, updatedAt: Date.now() });
    return { templateCount: templates.length };
  },
});

export const regenerateFutureShifts = mutation({
  args: {
    id: v.id("eventSeries"),
    scope: seriesEditScopeValue,
    fromOccurrenceIndex: v.number(),
    shiftTemplates: v.optional(v.array(shiftTemplateValue)),
  },
  returns: v.object({ updatedCount: v.number() }),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const series = await ctx.db.get(args.id);
    if (!series) throw new Error("Event series not found.");
    const templates =
      args.shiftTemplates && args.shiftTemplates.length > 0
        ? args.shiftTemplates
        : (series.shiftTemplates ?? undefined);
    if (!templates || templates.length === 0) {
      throw new Error("No crew shift templates to apply.");
    }
    const blockTemplates = series.blockTemplates ?? undefined;
    if (!blockTemplates || blockTemplates.length === 0) {
      throw new Error("Apply schedule block templates before crew shift templates.");
    }
    const now = Date.now();
    const defaultRate = await resolveDefaultCrewHourlyRateUsd(ctx);
    if (args.shiftTemplates && args.shiftTemplates.length > 0) {
      await ctx.db.patch(args.id, {
        shiftTemplates: args.shiftTemplates,
        updatedAt: now,
      });
    }
    const occurrences = await listOccurrencesForSeries(ctx, args.id);
    const scope = args.scope as SeriesEditScope;
    let updatedCount = 0;

    for (const occurrence of occurrences) {
      if (scope === "this") {
        if (occurrence.occurrenceIndex !== args.fromOccurrenceIndex) continue;
      } else if (!shouldApplySeriesUpdate(occurrence, scope, args.fromOccurrenceIndex, now)) {
        continue;
      }
      if (occurrence.seriesDetached || occurrence.status === "cancelled") continue;
      await replaceScheduleBlocksFromTemplates(
        ctx,
        occurrence._id,
        occurrence.startAt,
        blockTemplates,
        now,
      );
      await replaceEmptyShiftsFromTemplates(
        ctx,
        occurrence._id,
        occurrence.startAt,
        templates,
        blockTemplates,
        defaultRate,
        now,
      );
      await syncEventCrewCostUsd(ctx, occurrence._id, now);
      updatedCount += 1;
    }
    return { updatedCount };
  },
});

export const importShiftsFromOccurrence = mutation({
  args: {
    id: v.id("eventSeries"),
    eventId: v.id("events"),
  },
  returns: v.object({ templateCount: v.number() }),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const series = await ctx.db.get(args.id);
    if (!series) throw new Error("Event series not found.");
    const event = await ctx.db.get(args.eventId);
    if (!event || event.seriesId !== args.id) {
      throw new Error("Event is not part of this series.");
    }
    const blockTemplates = series.blockTemplates ?? undefined;
    if (!blockTemplates || blockTemplates.length === 0) {
      throw new Error("Import schedule block templates before importing crew shifts.");
    }
    const blocks = await ctx.db
      .query("eventScheduleBlocks")
      .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", args.eventId))
      .take(500);
    const shifts = await ctx.db
      .query("eventCrewShifts")
      .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", args.eventId))
      .take(500);
    const templates = shiftsToTemplates(
      shifts.map((shift) => ({
        role: shift.role,
        scheduleBlockId: shift.scheduleBlockId,
        userId: shift.userId,
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
        estimatedHourlyRateUsd: shift.estimatedHourlyRateUsd,
        notes: shift.notes,
      })),
      blocks.map((block) => ({ _id: block._id, startsAt: block.startsAt })),
      blockTemplates,
      event.startAt,
    );
    if (templates.length === 0) {
      throw new Error("Selected occurrence has no empty crew shifts to import.");
    }
    await ctx.db.patch(args.id, { shiftTemplates: templates, updatedAt: Date.now() });
    return { templateCount: templates.length };
  },
});

export const addOccurrences = mutation({
  args: {
    id: v.id("eventSeries"),
    additionalCount: v.optional(v.number()),
    newSeriesEndAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const series = await ctx.db.get(args.id);
    if (!series) throw new Error("Event series not found.");
    const existing = await listOccurrencesForSeries(ctx, args.id);
    const lastIndex = existing.length > 0 ? (existing[existing.length - 1]!.occurrenceIndex ?? 0) : -1;

    let newStarts: number[] = [];
    if (args.additionalCount !== undefined) {
      newStarts = Array.from({ length: args.additionalCount }, (_, offset) =>
        occurrenceStartAt(series.anchorStartAt, lastIndex + 1 + offset, series.intervalWeeks),
      );
    } else if (args.newSeriesEndAt !== undefined) {
      newStarts = computeOccurrenceStarts({
        anchorStartAt: occurrenceStartAt(
          series.anchorStartAt,
          lastIndex + 1,
          series.intervalWeeks,
        ),
        intervalWeeks: series.intervalWeeks,
        seriesEndAt: args.newSeriesEndAt,
      });
    } else {
      throw new Error("Provide additionalCount or newSeriesEndAt.");
    }

    const now = Date.now();
    const eventIds: Id<"events">[] = [];
    for (let offset = 0; offset < newStarts.length; offset += 1) {
      const occurrenceIndex = lastIndex + 1 + offset;
      const eventId = await materializeOccurrence(ctx, series, occurrenceIndex, newStarts[offset]!, now);
      eventIds.push(eventId);
    }

    const nextOccurrenceCount = (series.occurrenceCount ?? existing.length) + newStarts.length;
    await ctx.db.patch(args.id, {
      occurrenceCount: series.occurrenceCount !== undefined ? nextOccurrenceCount : series.occurrenceCount,
      seriesEndAt: args.newSeriesEndAt ?? series.seriesEndAt,
      updatedAt: now,
    });

    return { eventIds };
  },
});

export const cancelFuture = mutation({
  args: {
    id: v.id("eventSeries"),
    fromOccurrenceIndex: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const series = await ctx.db.get(args.id);
    if (!series) throw new Error("Event series not found.");
    const now = Date.now();
    const occurrences = await listOccurrencesForSeries(ctx, args.id);
    let cancelledCount = 0;
    for (const occurrence of occurrences) {
      if ((occurrence.occurrenceIndex ?? 0) < args.fromOccurrenceIndex) continue;
      if (occurrence.status === "cancelled") continue;
      await ctx.db.patch(occurrence._id, {
        status: "cancelled",
        updatedAt: now,
      });
      cancelledCount += 1;
    }
    return { cancelledCount };
  },
});

export const detachOccurrence = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    if (!event.seriesId) throw new Error("Event is not part of a series.");
    await ctx.db.patch(args.eventId, {
      seriesDetached: true,
      updatedAt: Date.now(),
    });
  },
});

export const reattachOccurrence = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    if (!event.seriesId) throw new Error("Event is not part of a series.");
    if (!event.seriesDetached) throw new Error("Event is already attached to the series.");

    const series = await ctx.db.get(event.seriesId);
    if (!series) throw new Error("Event series not found.");

    const now = Date.now();
    const occurrenceIndex = event.occurrenceIndex ?? 0;
    const startAt = occurrenceStartAt(
      series.anchorStartAt,
      occurrenceIndex,
      series.intervalWeeks,
    );
    const patch = buildEventPatchFromSeriesTemplate(series, startAt);
    await ctx.db.patch(args.eventId, {
      ...patch,
      seriesDetached: false,
      invoiceId: series.invoiceId,
      updatedAt: now,
    });

    const blockTemplates = series.blockTemplates ?? undefined;
    if (blockTemplates && blockTemplates.length > 0) {
      await replaceScheduleBlocksFromTemplates(ctx, args.eventId, startAt, blockTemplates, now);
    }

    const shiftTemplates = series.shiftTemplates ?? undefined;
    if (shiftTemplates && shiftTemplates.length > 0) {
      await replaceEmptyShiftsFromTemplates(
        ctx,
        args.eventId,
        startAt,
        shiftTemplates,
        blockTemplates,
        await resolveDefaultCrewHourlyRateUsd(ctx),
        now,
      );
      await syncEventCrewCostUsd(ctx, args.eventId, now);
    } else {
      await ctx.db.patch(args.eventId, {
        crewCostUsd: series.occurrenceBudgetCrewCostUsd,
        updatedAt: now,
      });
    }

    if (series.invoiceId) {
      const refreshed = await ctx.db.get(args.eventId);
      if (refreshed) {
        await syncEventStatusForLinkedInvoice(
          ctx,
          args.eventId,
          series.invoiceId,
          refreshed.status,
        );
      }
    }

    return args.eventId;
  },
});

export const endSeries = mutation({
  args: { id: v.id("eventSeries") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const series = await ctx.db.get(args.id);
    if (!series) throw new Error("Event series not found.");
    await ctx.db.patch(args.id, { status: "ended", updatedAt: Date.now() });
  },
});

export const updateSeriesCosts = mutation({
  args: {
    id: v.id("eventSeries"),
    budgetUsd: v.optional(v.number()),
    occurrenceBandsCostUsd: v.optional(v.number()),
    occurrenceExternalRentalsCostUsd: v.optional(v.number()),
    occurrenceOtherCostUsd: v.optional(v.number()),
    occurrenceBudgetCrewCostUsd: v.optional(v.number()),
    budgetCrewHourlyRateUsd: v.optional(v.number()),
    seriesBandsCostUsd: v.optional(v.number()),
    seriesExternalRentalsCostUsd: v.optional(v.number()),
    seriesOtherCostUsd: v.optional(v.number()),
    propagateOccurrenceCosts: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const series = await ctx.db.get(args.id);
    if (!series) throw new Error("Event series not found.");
    const now = Date.now();
    await ctx.db.patch(args.id, {
      budgetUsd: args.budgetUsd ?? series.budgetUsd,
      occurrenceBandsCostUsd:
        args.occurrenceBandsCostUsd !== undefined
          ? args.occurrenceBandsCostUsd
          : series.occurrenceBandsCostUsd,
      occurrenceExternalRentalsCostUsd:
        args.occurrenceExternalRentalsCostUsd !== undefined
          ? args.occurrenceExternalRentalsCostUsd
          : series.occurrenceExternalRentalsCostUsd,
      occurrenceOtherCostUsd:
        args.occurrenceOtherCostUsd !== undefined
          ? args.occurrenceOtherCostUsd
          : series.occurrenceOtherCostUsd,
      occurrenceBudgetCrewCostUsd:
        args.occurrenceBudgetCrewCostUsd !== undefined
          ? args.occurrenceBudgetCrewCostUsd
          : series.occurrenceBudgetCrewCostUsd,
      budgetCrewHourlyRateUsd:
        args.budgetCrewHourlyRateUsd !== undefined
          ? args.budgetCrewHourlyRateUsd
          : series.budgetCrewHourlyRateUsd,
      seriesBandsCostUsd:
        args.seriesBandsCostUsd !== undefined ? args.seriesBandsCostUsd : series.seriesBandsCostUsd,
      seriesExternalRentalsCostUsd:
        args.seriesExternalRentalsCostUsd !== undefined
          ? args.seriesExternalRentalsCostUsd
          : series.seriesExternalRentalsCostUsd,
      seriesOtherCostUsd:
        args.seriesOtherCostUsd !== undefined ? args.seriesOtherCostUsd : series.seriesOtherCostUsd,
      updatedAt: now,
    });

    if (args.propagateOccurrenceCosts ?? true) {
      const updatedSeries = await ctx.db.get(args.id);
      if (!updatedSeries) throw new Error("Event series not found.");
      const occurrences = await listOccurrencesForSeries(ctx, args.id);
      for (const occurrence of occurrences) {
        if (occurrence.seriesDetached || occurrence.status === "cancelled") continue;
        const patch = buildEventPatchFromSeriesTemplate(updatedSeries, occurrence.startAt);
        const shiftStats = await computeShiftStats(ctx, occurrence._id);
        const crewPatch =
          shiftStats.totalShifts === 0 && updatedSeries.occurrenceBudgetCrewCostUsd !== undefined
            ? { crewCostUsd: updatedSeries.occurrenceBudgetCrewCostUsd }
            : {};
        await ctx.db.patch(occurrence._id, {
          bandsCostUsd: patch.bandsCostUsd,
          externalRentalsCostUsd: patch.externalRentalsCostUsd,
          otherCostUsd: patch.otherCostUsd,
          budgetUsd: patch.budgetUsd,
          ...crewPatch,
          updatedAt: now,
        });
      }
    }
    return args.id;
  },
});

export const previewOccurrenceDates = query({
  args: {
    startAt: v.number(),
    intervalWeeks: v.number(),
    occurrenceCount: v.optional(v.number()),
    seriesEndAt: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    await requireAuth(_ctx);
    await requireArborInternalContext(_ctx);
    try {
      const starts = computeOccurrenceStarts({
        anchorStartAt: args.startAt,
        intervalWeeks: args.intervalWeeks,
        occurrenceCount: args.occurrenceCount,
        seriesEndAt: args.seriesEndAt,
      });
      return {
        starts,
        count: starts.length,
      };
    } catch (error) {
      return {
        starts: [] as number[],
        count: 0,
        error: error instanceof Error ? error.message : "Invalid recurrence settings.",
      };
    }
  },
});
