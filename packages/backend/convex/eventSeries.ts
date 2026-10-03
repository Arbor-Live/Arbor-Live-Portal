import { occurrenceStartAt, pacificDateKey } from "@arbor/format";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireArborInternalContext, requireAuth } from "./lib/auth";
import { loadBackupUserIds } from "./lib/crewBackups";
import { computeShiftStats as computeCrewShiftStats, isTraineeShift } from "./lib/crewShiftKinds";
import { normalizeEventStatus } from "./lib/eventStatus";
import { RENTAL_EVENT_TYPES } from "./eventPullLists";
import {
  applyPositionTemplates,
  buildEventPatchFromSeriesTemplate,
  computeOccurrenceStarts,
  EVENT_TIMEZONE,
  groupDayStartAt,
  materializeOccurrence,
  withSharedDayFields,
  propagateInvoiceIdToSeriesOccurrences,
  replaceEmptyShiftsFromTemplates,
  replaceScheduleBlocksFromTemplates,
  resolveDefaultCrewHourlyRateUsd,
  shiftsToTemplates,
} from "./lib/eventSeriesGeneration";
import {
  assertValidPositionTemplates,
  eventSeriesPositionTemplateValue,
} from "./lib/eventSeriesPositions";
import {
  applyGroupTemplates,
  applyGroupTemplatesToDay,
  assertValidReferenceIndex,
  captureDayTemplates,
  copyPullListBetweenDays,
  copyUnlinkedShiftsBetweenDays,
  listGroupDays,
  planDaySetup,
  selectDaysInScope,
} from "./lib/eventGroupTemplates";
import { isMultiDayGroup } from "./lib/eventGroupKind";
import { syncMultiDayGroupForInvoice } from "./lib/eventGroups";
import { requireEventEditAccess } from "./lib/eventAccess";
import { syncEventCrewCostUsd } from "./lib/crewCost";
import {
  detachInvoiceFromAdditionalLinks,
  replaceAdditionalInvoiceLinks,
  splitPrimaryAndAdditional,
} from "./lib/eventInvoiceLinks";
import { syncEventStatusForLinkedInvoice } from "./lib/eventStatus";
import { computeSeriesCostSummary, effectiveCrewUsd } from "./lib/eventSeriesCosts";
import { resolveVenueLink } from "./lib/venues";
import {
  resolveAdditionalHostGroupIds,
  resolveEventPrimaryHostLink,
  syncLinkedEventsPrimaryHostFromInvoice,
} from "./lib/hostOrgs";
import { eventTeamValue } from "./lib/eventTeams";
import { isActBlock } from "./lib/runOfShow";
import { scheduleBlockTypeValue } from "./lib/scheduleBlockTypes";

const eventTypeValue = v.union(
  v.literal("Crewed Event"),
  v.literal("Rental with Crew"),
  v.literal("Dry Hire"),
  v.literal("Dry Rental"),
  v.literal("Services Only"),
);

const rentalFulfillmentModeValue = v.union(v.literal("delivery"), v.literal("will_call"));

const blockTemplateValue = v.object({
  blockType: scheduleBlockTypeValue,
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
  hours: v.optional(v.number()),
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
  const stats = computeCrewShiftStats(shifts, await loadBackupUserIds(ctx, eventId));
  return {
    totalShifts: stats.totalShifts,
    assignedShifts: stats.filledShifts,
    backupShifts: stats.backupShifts,
    isCrewConfirmed: stats.isCrewConfirmed,
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
    const invoice = series.invoiceId ? await ctx.db.get(series.invoiceId) : null;
    return {
      series,
      occurrences: occurrencesWithStats,
      totalOccurrences,
      costSummary,
      invoiceNumber: invoice?.invoiceNumber,
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
    additionalHostGroupIds: v.optional(v.array(v.id("invoiceGroups"))),
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
    operationsLeadUserId: v.optional(v.string()),
    rentalFulfillmentMode: v.optional(rentalFulfillmentModeValue),
    notes: v.optional(v.string()),
    blockTemplates: v.optional(v.array(blockTemplateValue)),
    shiftTemplates: v.optional(v.array(shiftTemplateValue)),
    positionTemplates: v.optional(v.array(eventSeriesPositionTemplateValue)),
    invoiceId: v.optional(v.id("invoices")),
    additionalInvoiceIds: v.optional(v.array(v.id("invoices"))),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    if (args.endAt <= args.startAt) throw new Error("Event end time must be after start time.");
    assertValidPositionTemplates(args.positionTemplates ?? []);
    const occurrenceStarts = computeOccurrenceStarts({
      anchorStartAt: args.startAt,
      intervalWeeks: args.intervalWeeks,
      occurrenceCount: args.occurrenceCount,
      seriesEndAt: args.seriesEndAt,
    });
    const now = Date.now();
    const venueLink = await resolveVenueLink(ctx, args.venueId);
    const invoiceSplit =
      args.additionalInvoiceIds !== undefined
        ? splitPrimaryAndAdditional(args.invoiceId, args.additionalInvoiceIds)
        : { primary: args.invoiceId, additional: [] as Id<"invoices">[] };
    const hostLink = await resolveEventPrimaryHostLink(ctx, {
      invoiceId: invoiceSplit.primary,
      hostGroupId: args.hostGroupId,
    });
    const additionalHostGroupIds = await resolveAdditionalHostGroupIds(
      ctx,
      hostLink.hostGroupId,
      args.additionalHostGroupIds,
    );
    const seriesId = await ctx.db.insert("eventSeries", {
      kind: "recurring",
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
      additionalHostGroupIds,
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
      operationsLeadUserId: trimOptional(args.operationsLeadUserId),
      rentalFulfillmentMode: resolveRentalFulfillmentMode(args.eventType, args.rentalFulfillmentMode),
      notes: trimOptional(args.notes),
      blockTemplates: args.blockTemplates,
      shiftTemplates: args.shiftTemplates,
      positionTemplates: args.positionTemplates,
      budgetCrewHourlyRateUsd: args.budgetCrewHourlyRateUsd,
      invoiceId: invoiceSplit.primary,
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
    const firstEventId = eventIds[0];
    if (firstEventId && invoiceSplit.additional.length > 0) {
      await replaceAdditionalInvoiceLinks(ctx, firstEventId, invoiceSplit.additional);
    }
    return { seriesId, firstEventId: firstEventId!, eventIds };
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
    if (isMultiDayGroup(series)) {
      throw new Error("A multi-day booking is billed through its days' invoice.");
    }
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) throw new Error("Invoice not found.");
    const now = Date.now();
    await ctx.db.patch(args.id, { invoiceId: args.invoiceId, updatedAt: now });

    const occurrences = await listOccurrencesForSeries(ctx, args.id);
    for (const occurrence of occurrences) {
      if (occurrence.seriesDetached || occurrence.status === "cancelled") continue;
      await ctx.db.patch(occurrence._id, { invoiceId: args.invoiceId, updatedAt: now });
      await detachInvoiceFromAdditionalLinks(ctx, occurrence._id, args.invoiceId);
      await syncEventStatusForLinkedInvoice(ctx, occurrence._id, args.invoiceId, occurrence.status);
    }
    await syncLinkedEventsPrimaryHostFromInvoice(ctx, args.invoiceId);
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
    if (isMultiDayGroup(series)) {
      throw new Error("A multi-day booking is billed through its days' invoice.");
    }
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

const groupApplyScopeValue = v.union(v.literal("future"), v.literal("all"));

/** Pull-list rows copied per day; matches the pull list's own read cap. */
const MAX_PULL_LIST_ROWS = 500;

async function requireGroup(ctx: MutationCtx, id: Id<"eventSeries">) {
  const series = await ctx.db.get(id);
  if (!series) throw new Error("Event series not found.");
  return series;
}

async function requireGroupDay(ctx: MutationCtx, id: Id<"eventSeries">, eventId: Id<"events">) {
  const event = await ctx.db.get(eventId);
  if (!event || event.seriesId !== id) {
    throw new Error("Event is not part of this series.");
  }
  return event;
}

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
    const series = await requireGroup(ctx, args.id);
    assertValidReferenceIndex(args.fromOccurrenceIndex);
    const templates = args.blockTemplates ?? series.blockTemplates ?? undefined;
    if (!templates || templates.length === 0) {
      throw new Error("No schedule block templates to apply.");
    }
    const now = Date.now();
    if (args.blockTemplates) {
      await ctx.db.patch(args.id, { blockTemplates: args.blockTemplates, updatedAt: now });
    }
    const updatedCount = await applyGroupTemplates(ctx, await requireGroup(ctx, args.id), {
      scope: args.scope,
      referenceIndex: args.fromOccurrenceIndex,
      parts: { schedule: true },
      now,
    });
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
    await requireGroup(ctx, args.id);
    const event = await requireGroupDay(ctx, args.id, args.eventId);
    const now = Date.now();
    const { blockTemplates = [] } = await captureDayTemplates(ctx, event, { schedule: true }, now);
    if (blockTemplates.length === 0) {
      throw new Error("Selected occurrence has no schedule blocks to import.");
    }
    await ctx.db.patch(args.id, { blockTemplates, updatedAt: now });
    return { templateCount: blockTemplates.length };
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
    const series = await requireGroup(ctx, args.id);
    assertValidReferenceIndex(args.fromOccurrenceIndex);
    const templates =
      args.shiftTemplates && args.shiftTemplates.length > 0
        ? args.shiftTemplates
        : (series.shiftTemplates ?? undefined);
    if (!templates || templates.length === 0) {
      throw new Error("No crew shift templates to apply.");
    }
    if (!series.blockTemplates || series.blockTemplates.length === 0) {
      throw new Error("Apply schedule block templates before crew shift templates.");
    }
    const now = Date.now();
    if (args.shiftTemplates && args.shiftTemplates.length > 0) {
      await ctx.db.patch(args.id, { shiftTemplates: args.shiftTemplates, updatedAt: now });
    }
    // Crew slots hang off Run of Show sections, so the sections are re-laid first.
    const updatedCount = await applyGroupTemplates(ctx, await requireGroup(ctx, args.id), {
      scope: args.scope,
      referenceIndex: args.fromOccurrenceIndex,
      parts: { schedule: true, crew: true },
      now,
    });
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
    const series = await requireGroup(ctx, args.id);
    const event = await requireGroupDay(ctx, args.id, args.eventId);
    const blockTemplates = series.blockTemplates ?? undefined;
    if (!blockTemplates || blockTemplates.length === 0) {
      throw new Error("Import schedule block templates before importing crew shifts.");
    }
    // An act's soundcheck/set blocks belong to one occurrence's lineup, not the series.
    const blocks = (
      await ctx.db
        .query("eventScheduleBlocks")
        .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", args.eventId))
        .take(500)
    ).filter((block) => !isActBlock(block));
    const shifts = await ctx.db
      .query("eventCrewShifts")
      .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", args.eventId))
      .take(500);
    const templates = shiftsToTemplates(shifts, blocks, blockTemplates, event.startAt);
    if (templates.length === 0) {
      throw new Error("Selected occurrence has no empty crew shifts to import.");
    }
    await ctx.db.patch(args.id, { shiftTemplates: templates, updatedAt: Date.now() });
    return { templateCount: templates.length };
  },
});

export const regenerateFuturePositions = mutation({
  args: {
    id: v.id("eventSeries"),
    scope: seriesEditScopeValue,
    fromOccurrenceIndex: v.number(),
    positionTemplates: v.optional(v.array(eventSeriesPositionTemplateValue)),
  },
  returns: v.object({ updatedCount: v.number() }),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const series = await requireGroup(ctx, args.id);
    assertValidReferenceIndex(args.fromOccurrenceIndex);
    const templates = args.positionTemplates ?? series.positionTemplates ?? [];
    assertValidPositionTemplates(templates);
    const now = Date.now();
    if (args.positionTemplates !== undefined) {
      await ctx.db.patch(args.id, { positionTemplates: args.positionTemplates, updatedAt: now });
    }
    const updatedCount = await applyGroupTemplates(ctx, await requireGroup(ctx, args.id), {
      scope: args.scope,
      referenceIndex: args.fromOccurrenceIndex,
      parts: { positions: true },
      now,
    });
    return { updatedCount };
  },
});

export const importPositionsFromOccurrence = mutation({
  args: {
    id: v.id("eventSeries"),
    eventId: v.id("events"),
  },
  returns: v.object({ templateCount: v.number() }),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    await requireGroup(ctx, args.id);
    const event = await requireGroupDay(ctx, args.id, args.eventId);
    const now = Date.now();
    const { positionTemplates = [] } = await captureDayTemplates(
      ctx,
      event,
      { positions: true },
      now,
    );
    if (positionTemplates.length === 0) {
      throw new Error("Selected occurrence has no positions to import.");
    }
    // Same rules as create/regenerate; throwing rolls back the key stamps.
    assertValidPositionTemplates(positionTemplates);
    await ctx.db.patch(args.id, { positionTemplates, updatedAt: now });
    return { templateCount: positionTemplates.length };
  },
});

/**
 * Apply selected setup from a multi-day booking's source day; omitted part
 * flags default to true, and parts with no source content are skipped.
 * Saves sections, crew slots (including staffed slots copied as open), and
 * positions as group templates; copies pull lists with pull/checkout progress
 * reset. Detached, cancelled, source, and already-ended days are excluded;
 * `future` also excludes days before the source index or with starts before now.
 * Returns the target count and ids. Legacy invoice days may be grouped first.
 *
 * Requires Arbor internal context and edit access to the source and targets.
 * Throws for missing records, recurring groups, no eligible targets, or no
 * selected content. Capture/copy limits and position validation/application
 * errors propagate. Replaces "copy this day's setup".
 */
export const applyDaySetup = mutation({
  args: {
    eventId: v.id("events"),
    scope: groupApplyScopeValue,
    schedule: v.optional(v.boolean()),
    positions: v.optional(v.boolean()),
    pullList: v.optional(v.boolean()),
  },
  returns: v.object({ updatedCount: v.number(), eventIds: v.array(v.id("events")) }),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    await requireEventEditAccess(ctx, args.eventId);
    const now = Date.now();
    let source = await ctx.db.get(args.eventId);
    if (!source) throw new Error("Event not found.");
    if (!source.seriesId && source.invoiceId) {
      // Days booked before groups existed: group them on first use.
      await syncMultiDayGroupForInvoice(ctx, source.invoiceId, now);
      source = await ctx.db.get(args.eventId);
    }
    if (!source?.seriesId) throw new Error("This event has no other days to apply its setup to.");
    const sourceDay = source;
    const groupId = sourceDay.seriesId!;
    if (!isMultiDayGroup(await requireGroup(ctx, groupId))) {
      // A series already has its templates; copying one occurrence over them
      // would rewrite the series. Edit the templates on the series page.
      throw new Error("Apply a series' setup from its templates on the series page.");
    }
    // Days that already happened keep their record (pull progress, crew).
    const targets = selectDaysInScope(
      await listGroupDays(ctx, groupId),
      args.scope,
      sourceDay.occurrenceIndex ?? 0,
      now,
    ).filter((day) => day._id !== sourceDay._id && day.endAt >= now);
    if (targets.length === 0) {
      throw new Error(
        args.scope === "future"
          ? "There are no later upcoming days to apply this day's setup to."
          : "There are no other upcoming days to apply this day's setup to.",
      );
    }
    for (const target of targets) {
      await requireEventEditAccess(ctx, target._id);
    }

    const wanted = {
      schedule: args.schedule !== false,
      crew: args.schedule !== false,
      positions: args.positions !== false,
    };
    const captured = await captureDayTemplates(ctx, sourceDay, wanted, now);
    const sourcePullList =
      args.pullList !== false
        ? await ctx.db
            .query("eventPullListItems")
            .withIndex("by_eventId", (q) => q.eq("eventId", sourceDay._id))
            .take(MAX_PULL_LIST_ROWS + 1)
        : [];
    if (sourcePullList.length > MAX_PULL_LIST_ROWS) {
      throw new Error(
        `This day's pull list is too long to copy (max ${MAX_PULL_LIST_ROWS} rows, got more).`,
      );
    }
    const hasUnlinkedShifts = wanted.crew
      ? (
          await ctx.db
            .query("eventCrewShifts")
            .withIndex("by_eventId", (q) => q.eq("eventId", sourceDay._id))
            .take(500)
        ).some((shift) => !shift.scheduleBlockId && !isTraineeShift(shift))
      : false;
    const { parts, copyUnlinkedShifts, copyPullList, nothingToApply } = planDaySetup({
      wantSchedule: wanted.schedule,
      wantPositions: wanted.positions,
      wantPullList: args.pullList !== false,
      captured,
      hasUnlinkedShifts,
      pullListRows: sourcePullList.length,
    });
    if (nothingToApply) {
      throw new Error(
        "This day has nothing to apply yet: no Run of Show, crew, positions or pull list.",
      );
    }
    assertValidPositionTemplates(captured.positionTemplates ?? []);
    await ctx.db.patch(groupId, {
      ...(parts.schedule
        ? { blockTemplates: captured.blockTemplates, shiftTemplates: captured.shiftTemplates }
        : {}),
      ...(parts.positions ? { positionTemplates: captured.positionTemplates } : {}),
      updatedAt: now,
    });
    const group = await requireGroup(ctx, groupId);
    const defaultHourlyRateUsd = parts.crew ? await resolveDefaultCrewHourlyRateUsd(ctx) : undefined;
    for (const target of targets) {
      await applyGroupTemplatesToDay(ctx, group, target, parts, { now, defaultHourlyRateUsd });
      if (copyUnlinkedShifts) {
        await copyUnlinkedShiftsBetweenDays(ctx, sourceDay, target, now);
      }
      if (parts.crew || copyUnlinkedShifts) {
        await syncEventCrewCostUsd(ctx, target._id, now);
      }
      if (copyPullList) {
        await copyPullListBetweenDays(ctx, sourcePullList, target._id, now);
      }
      await ctx.db.patch(target._id, { updatedAt: now });
    }
    return { updatedCount: targets.length, eventIds: targets.map((day) => day._id) };
  },
});

/**
 * Add a day at `startAt` (Unix milliseconds), returning its event id. Uses group
 * templates and the first non-cancelled member's shared fields and visibility
 * (falling back to the first member), clears inherited budget and costs, then
 * recalculates templated crew cost and synchronizes invoice group membership.
 * Requires Arbor internal context. Throws for a missing group or invoice, a
 * recurring group, or an existing member on the same Pacific date; template
 * application errors propagate.
 */
export const addDay = mutation({
  args: {
    id: v.id("eventSeries"),
    startAt: v.number(),
  },
  returns: v.id("events"),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const group = await requireGroup(ctx, args.id);
    if (!isMultiDayGroup(group)) {
      throw new Error("Add occurrences to a recurring series from its rule instead.");
    }
    const invoice = group.invoiceId ? await ctx.db.get(group.invoiceId) : null;
    if (!invoice) {
      throw new Error("A booking's days share its invoice; link one before adding a day.");
    }
    const days = await listGroupDays(ctx, args.id);
    // Adding a day creates an invoice-backed event: the caller needs edit
    // access to the booking, shown by being able to edit one of its days.
    const modelDay = days.find((day) => day.status !== "cancelled") ?? days[0];
    if (!modelDay) throw new Error("This booking has no days to add to.");
    await requireEventEditAccess(ctx, modelDay._id);
    if (days.some((day) => pacificDateKey(day.startAt) === pacificDateKey(args.startAt))) {
      throw new Error("This booking already has a day on that date.");
    }
    const now = Date.now();
    const eventId = await materializeOccurrence(ctx, group, days.length, args.startAt, now);
    // A new day looks like the booking's live days today (venue, host, people,
    // visibility), not the group's snapshot from when it formed. Budget and
    // costs are per day: the group's budget is the whole booking's. Its status
    // follows the invoice, as on every linked day.
    const model = modelDay;
    const created = await ctx.db.get(eventId);
    if (created) {
      const next = withSharedDayFields(
        { ...created, visibility: model?.visibility ?? created.visibility },
        model ?? created,
      );
      delete next.budgetUsd;
      delete next.bandsCostUsd;
      delete next.externalRentalsCostUsd;
      delete next.otherCostUsd;
      delete next.crewCostUsd;
      await ctx.db.replace(eventId, next);
      if ((group.shiftTemplates?.length ?? 0) > 0) await syncEventCrewCostUsd(ctx, eventId, now);
    }
    await syncMultiDayGroupForInvoice(ctx, invoice._id, now);
    return eventId;
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
    const intervalWeeks = series.intervalWeeks;
    if (isMultiDayGroup(series) || intervalWeeks === undefined) {
      throw new Error("Add a dated day to a multi-day booking instead.");
    }
    const existing = await listOccurrencesForSeries(ctx, args.id);
    const lastIndex = existing.length > 0 ? (existing[existing.length - 1]!.occurrenceIndex ?? 0) : -1;

    let newStarts: number[] = [];
    if (args.additionalCount !== undefined) {
      newStarts = Array.from({ length: args.additionalCount }, (_, offset) =>
        occurrenceStartAt(series.anchorStartAt, lastIndex + 1 + offset, intervalWeeks),
      );
    } else if (args.newSeriesEndAt !== undefined) {
      newStarts = computeOccurrenceStarts({
        anchorStartAt: occurrenceStartAt(
          series.anchorStartAt,
          lastIndex + 1,
          intervalWeeks,
        ),
        intervalWeeks,
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
    if (isMultiDayGroup(series)) {
      // A booking's days are invoice-backed and led by different people: the
      // caller must be able to edit every day they cancel (as applyDaySetup does).
      for (const occurrence of occurrences) {
        if ((occurrence.occurrenceIndex ?? 0) < args.fromOccurrenceIndex) continue;
        if (occurrence.status === "cancelled") continue;
        await requireEventEditAccess(ctx, occurrence._id);
      }
    }
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
    if (isMultiDayGroup(series) && series.invoiceId) {
      await syncMultiDayGroupForInvoice(ctx, series.invoiceId, now);
    }
    return { cancelledCount };
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
    const startAt = groupDayStartAt(series, event);
    const patch = buildEventPatchFromSeriesTemplate(series, startAt);
    await ctx.db.patch(args.eventId, {
      ...patch,
      seriesDetached: false,
      // A multi-day day's invoice is what makes it a member; leave it be.
      ...(isMultiDayGroup(series) ? {} : { invoiceId: series.invoiceId }),
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
    } else if (!isMultiDayGroup(series)) {
      // A multi-day day keeps its own crew cost; only a series has a template budget.
      await ctx.db.patch(args.eventId, {
        crewCostUsd: series.occurrenceBudgetCrewCostUsd,
        updatedAt: now,
      });
    }

    await applyPositionTemplates(ctx, args.eventId, startAt, series.positionTemplates ?? [], now);

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

    // A multi-day booking's days carry their own costs; its group budget is a total.
    if ((args.propagateOccurrenceCosts ?? true) && !isMultiDayGroup(series)) {
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
