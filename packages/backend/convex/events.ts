import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { requireArborInternalContext, requireAuth } from "./lib/auth";
import {
  eventStatusValue,
  normalizeEventStatus,
  syncEventStatusForLinkedInvoice,
} from "./lib/eventStatus";
import { listEventsByInvoiceId } from "./lib/invoiceEvents";
import { RENTAL_EVENT_TYPES, enrichPullListItems, summarizePullList } from "./eventPullLists";
import { propagateOverviewToSeriesOccurrences, type SeriesEditScope } from "./lib/eventSeriesGeneration";
import { scheduleEventCancelledEmails } from "./email/triggers";
import { resolveStoredR2AssetUrl } from "./inventoryR2";

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
const EVENT_TIMEZONE = "America/Los_Angeles";

const rentalFulfillmentModeValue = v.union(v.literal("delivery"), v.literal("will_call"));

const seriesEditScopeValue = v.union(v.literal("this"), v.literal("future"), v.literal("all"));

function trimOptional(value: string | undefined) {
  const out = value?.trim();
  return out ? out : undefined;
}

function makePublicToken() {
  return `evt_${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
}

function resolveRentalFulfillmentMode(
  eventType: string | undefined,
  rentalFulfillmentMode: "delivery" | "will_call" | "pickup" | undefined,
) {
  if (!eventType || !RENTAL_EVENT_TYPES.has(eventType)) return undefined;
  if (rentalFulfillmentMode === "pickup") return "delivery";
  return rentalFulfillmentMode;
}

type AuthUserRecord = {
  id?: string;
  _id?: string;
  name?: string;
  email?: string;
  image?: string | null;
};

export const list = query({
  args: {
    status: v.optional(eventStatusValue),
    query: v.optional(v.string()),
    linkedInvoiceOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const filterStatus = args.status ? normalizeEventStatus(args.status) : undefined;
    const baseRows = await ctx.db.query("events").withIndex("by_createdAt").take(200);
    const q = args.query?.trim().toLowerCase();
    const rows = baseRows
      .map((row) => ({ ...row, status: normalizeEventStatus(row.status) }))
      .filter((row) => {
        if (filterStatus && row.status !== filterStatus) return false;
        if (args.linkedInvoiceOnly && !row.invoiceId) return false;
        if (!q) return true;
        const haystack = [row.title, row.venueName, row.eventType, row.host, ...(row.teamsInterested ?? [])]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    return rows.sort((a, b) => b.startAt - a.startAt);
  },
});

export const listForDashboard = query({
  args: {
    status: v.optional(eventStatusValue),
    query: v.optional(v.string()),
    linkedInvoiceOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const filterStatus = args.status ? normalizeEventStatus(args.status) : undefined;
    const baseRows = await ctx.db.query("events").withIndex("by_createdAt").take(200);
    const q = args.query?.trim().toLowerCase();
    const rows = baseRows
      .map((row) => ({ ...row, status: normalizeEventStatus(row.status) }))
      .filter((row) => {
        if (filterStatus && row.status !== filterStatus) return false;
        if (args.linkedInvoiceOnly && !row.invoiceId) return false;
        if (!q) return true;
        const haystack = [row.title, row.venueName, row.eventType, row.host, ...(row.teamsInterested ?? [])]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });

    const sortedRows = rows.sort((a, b) => b.startAt - a.startAt);

    const perEventBlocks = await Promise.all(
      sortedRows.map((row) =>
        ctx.db
          .query("eventScheduleBlocks")
          .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", row._id))
          .take(200),
      ),
    );
    const perEventShifts = await Promise.all(
      sortedRows.map((row) =>
        ctx.db
          .query("eventCrewShifts")
          .withIndex("by_eventId", (q) => q.eq("eventId", row._id))
          .take(500),
      ),
    );
    const perEventPullList = await Promise.all(
      sortedRows.map((row) =>
        ctx.db
          .query("eventPullListItems")
          .withIndex("by_eventId", (q) => q.eq("eventId", row._id))
          .take(500),
      ),
    );

    const seriesIds = Array.from(
      new Set(sortedRows.map((row) => row.seriesId).filter((id): id is NonNullable<typeof id> => Boolean(id))),
    );
    const seriesById = new Map<
      string,
      { title: string; occurrenceCount?: number; totalOccurrences: number }
    >();
    await Promise.all(
      seriesIds.map(async (seriesId) => {
        const series = await ctx.db.get(seriesId);
        if (!series) return;
        const occurrences = await ctx.db
          .query("events")
          .withIndex("by_seriesId_and_occurrenceIndex", (q) => q.eq("seriesId", seriesId))
          .take(200);
        seriesById.set(seriesId, {
          title: series.title,
          occurrenceCount: series.occurrenceCount,
          totalOccurrences: series.occurrenceCount ?? occurrences.length,
        });
      }),
    );

    const allUserIds = Array.from(
      new Set(
        perEventShifts
          .flat()
          .map((shift) => shift.userId?.trim())
          .filter((userId): userId is string => Boolean(userId)),
      ),
    );

    // Fetch every referenced crew member in a single batched call. Better-auth's
    // adapter has a fast _id+in path that resolves each id with ctx.db.get(),
    // avoiding the unindexed scan triggered by `field: "id"`.
    const userByKey = new Map<string, AuthUserRecord>();
    if (allUserIds.length > 0) {
      const usersResult = await ctx.runQuery(components.betterAuth.adapter.findMany, {
        model: "user",
        where: [{ field: "_id", operator: "in", value: allUserIds }],
        paginationOpts: { cursor: null, numItems: allUserIds.length },
      });
      for (const user of (usersResult?.page ?? []) as AuthUserRecord[]) {
        const key = user.id ?? user._id;
        if (key) userByKey.set(key, user);
      }
    }

    return sortedRows.map((row, index) => {
      const blocks = perEventBlocks[index] ?? [];
      const shifts = perEventShifts[index] ?? [];
      const pullListItems = perEventPullList[index] ?? [];
      const eventUserIds = Array.from(
        new Set(
          shifts
            .map((shift) => shift.userId?.trim())
            .filter((userId): userId is string => Boolean(userId)),
        ),
      );
      const assignedCrew = eventUserIds.map((userId) => {
        const user = userByKey.get(userId);
        return {
          userId,
          name: user?.name ?? user?.email ?? userId,
          email: user?.email ?? "",
          image: user?.image ?? undefined,
        };
      });
      const setupBlock = blocks.find((block) => block.blockType === "setup");
      const showBlock = blocks.find((block) => block.blockType === "show");
      const strikeBlock = blocks.find((block) => block.blockType === "strike");
      const blockSummaries = blocks
        .sort((a, b) => a.startsAt - b.startsAt)
        .map((block) => ({
          blockType: block.blockType,
          label: block.label,
          startsAt: block.startsAt,
          endsAt: block.endsAt,
        }));
      const seriesInfo = row.seriesId ? seriesById.get(row.seriesId) : undefined;
      const occurrenceNumber =
        row.occurrenceIndex !== undefined ? row.occurrenceIndex + 1 : undefined;
      return {
        ...row,
        seriesTitle: seriesInfo?.title,
        occurrenceLabel:
          seriesInfo && occurrenceNumber !== undefined
            ? `${occurrenceNumber} of ${seriesInfo.totalOccurrences}`
            : undefined,
        assignedCrewCount: eventUserIds.length,
        assignedCrew,
        pullListSummary: summarizePullList(pullListItems),
        scheduleSummary: {
          setupAt: setupBlock?.startsAt,
          showAt: showBlock?.startsAt ?? row.startAt,
          strikeAt: strikeBlock?.startsAt,
          blocks: blockSummaries,
        },
      };
    });
  },
});

export const get = query({
  args: { id: v.id("events") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const event = await ctx.db.get(args.id);
    if (!event) return null;
    const blocks = await ctx.db
      .query("eventScheduleBlocks")
      .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", args.id))
      .take(500);
    const shifts = await ctx.db
      .query("eventCrewShifts")
      .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", args.id))
      .take(500);
    const assignments = await ctx.db
      .query("eventPeopleAssignments")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.id))
      .take(500);
    const artifacts = await ctx.db
      .query("eventArtifacts")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.id))
      .take(500);
    const enrichedArtifacts = await Promise.all(
      artifacts.map(async (row) => ({
        ...row,
        fileUrl: row.linkUrl ? await resolveStoredR2AssetUrl(row.linkUrl) : undefined,
      })),
    );
    const expenseReports = await ctx.db
      .query("eventExpenseReports")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.id))
      .take(100);
    const pullListItems = await ctx.db
      .query("eventPullListItems")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.id))
      .take(500);
    const sortedPullList = pullListItems.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
    const enrichedPullList = await enrichPullListItems(ctx, sortedPullList);
    return {
      event: { ...event, status: normalizeEventStatus(event.status) },
      series:
        event.seriesId !== undefined
          ? await (async () => {
              const series = await ctx.db.get(event.seriesId!);
              if (!series) return null;
              const siblings = await ctx.db
                .query("events")
                .withIndex("by_seriesId_and_occurrenceIndex", (q) => q.eq("seriesId", event.seriesId!))
                .take(200);
              return {
                _id: series._id,
                title: series.title,
                status: series.status,
                intervalWeeks: series.intervalWeeks,
                totalOccurrences: series.occurrenceCount ?? siblings.length,
                occurrenceIndex: event.occurrenceIndex,
                seriesDetached: event.seriesDetached ?? false,
                budgetUsd: series.budgetUsd,
                occurrenceBandsCostUsd: series.occurrenceBandsCostUsd,
                occurrenceExternalRentalsCostUsd: series.occurrenceExternalRentalsCostUsd,
                occurrenceOtherCostUsd: series.occurrenceOtherCostUsd,
                seriesBandsCostUsd: series.seriesBandsCostUsd,
                seriesExternalRentalsCostUsd: series.seriesExternalRentalsCostUsd,
                seriesOtherCostUsd: series.seriesOtherCostUsd,
              };
            })()
          : null,
      blocks,
      shifts,
      assignments,
      artifacts: enrichedArtifacts,
      expenseReports,
      pullListItems: enrichedPullList,
    };
  },
});

export const getByInvoiceId = query({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const linkedEvents = await listEventsByInvoiceId(ctx, args.invoiceId);
    const event = linkedEvents[0];
    if (!event) return null;

    const eventIds = linkedEvents.map((row) => row._id);
    const blocks = (
      await Promise.all(
        eventIds.map((eventId) =>
          ctx.db
            .query("eventScheduleBlocks")
            .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", eventId))
            .take(500),
        ),
      )
    ).flat();
    const assignments = (
      await Promise.all(
        eventIds.map((eventId) =>
          ctx.db
            .query("eventPeopleAssignments")
            .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
            .take(500),
        ),
      )
    ).flat();
    const shifts = (
      await Promise.all(
        eventIds.map((eventId) =>
          ctx.db
            .query("eventCrewShifts")
            .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", eventId))
            .take(500),
        ),
      )
    ).flat();

    return {
      _id: event._id,
      title: linkedEvents.length > 1 ? `${event.title} (+${linkedEvents.length - 1} more)` : event.title,
      status: event.status,
      startAt: event.startAt,
      endAt: linkedEvents[linkedEvents.length - 1]?.endAt ?? event.endAt,
      blocks,
      assignments,
      shifts,
      linkedEvents: linkedEvents.map((row) => ({
        _id: row._id,
        title: row.title,
        status: row.status,
        startAt: row.startAt,
        endAt: row.endAt,
      })),
    };
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    status: v.optional(eventStatusValue),
    visibility: v.optional(v.union(v.literal("internal"), v.literal("public"))),
    invoiceId: v.optional(v.id("invoices")),
    startAt: v.number(),
    endAt: v.number(),
    requiresShowWindow: v.optional(v.boolean()),
    venueName: v.optional(v.string()),
    eventType: v.optional(eventTypeValue),
    teamsInterested: v.optional(v.array(eventTeamValue)),
    category: v.optional(v.string()),
    host: v.optional(v.string()),
    expectedTurnout: v.optional(v.number()),
    budgetUsd: v.optional(v.number()),
    dayOfLeadUserId: v.optional(v.string()),
    eventManagerUserId: v.optional(v.string()),
    crewCostUsd: v.optional(v.number()),
    bandsCostUsd: v.optional(v.number()),
    externalRentalsCostUsd: v.optional(v.number()),
    otherCostUsd: v.optional(v.number()),
    rentalFulfillmentMode: v.optional(rentalFulfillmentModeValue),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    if (args.endAt <= args.startAt) throw new Error("Event end time must be after start time.");
    const now = Date.now();
    const spansMultipleDays = new Date(args.startAt).toDateString() !== new Date(args.endAt).toDateString();
    const initialStatus = normalizeEventStatus(args.status);
    const eventId = await ctx.db.insert("events", {
      title: args.title.trim(),
      status: initialStatus,
      visibility: args.visibility ?? "internal",
      invoiceId: args.invoiceId,
      publicToken: makePublicToken(),
      startAt: args.startAt,
      endAt: args.endAt,
      timezone: EVENT_TIMEZONE,
      spansMultipleDays,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: args.requiresShowWindow ?? true,
      venueName: trimOptional(args.venueName),
      eventType: args.eventType,
      teamsInterested: args.teamsInterested && args.teamsInterested.length > 0 ? args.teamsInterested : undefined,
      category: trimOptional(args.category),
      host: trimOptional(args.host),
      expectedTurnout: args.expectedTurnout,
      budgetUsd: args.budgetUsd,
      dayOfLeadUserId: trimOptional(args.dayOfLeadUserId),
      eventManagerUserId: trimOptional(args.eventManagerUserId),
      crewCostUsd: args.crewCostUsd,
      bandsCostUsd: args.bandsCostUsd,
      externalRentalsCostUsd: args.externalRentalsCostUsd,
      otherCostUsd: args.otherCostUsd,
      rentalFulfillmentMode: resolveRentalFulfillmentMode(args.eventType, args.rentalFulfillmentMode),
      notes: trimOptional(args.notes),
      createdAt: now,
      updatedAt: now,
    });
    if (args.invoiceId) {
      await syncEventStatusForLinkedInvoice(ctx, eventId, args.invoiceId, initialStatus);
    }
    return eventId;
  },
});

export const update = mutation({
  args: {
    id: v.id("events"),
    editScope: v.optional(seriesEditScopeValue),
    title: v.optional(v.string()),
    status: v.optional(eventStatusValue),
    visibility: v.optional(v.union(v.literal("internal"), v.literal("public"))),
    invoiceId: v.optional(v.id("invoices")),
    startAt: v.optional(v.number()),
    endAt: v.optional(v.number()),
    requiresShowWindow: v.optional(v.boolean()),
    venueName: v.optional(v.string()),
    eventType: v.optional(eventTypeValue),
    teamsInterested: v.optional(v.array(eventTeamValue)),
    category: v.optional(v.string()),
    host: v.optional(v.string()),
    expectedTurnout: v.optional(v.number()),
    budgetUsd: v.optional(v.number()),
    dayOfLeadUserId: v.optional(v.string()),
    eventManagerUserId: v.optional(v.string()),
    crewCostUsd: v.optional(v.number()),
    bandsCostUsd: v.optional(v.number()),
    externalRentalsCostUsd: v.optional(v.number()),
    otherCostUsd: v.optional(v.number()),
    rentalFulfillmentMode: v.optional(rentalFulfillmentModeValue),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Event not found.");
    const startAt = args.startAt ?? existing.startAt;
    const endAt = args.endAt ?? existing.endAt;
    if (endAt <= startAt) throw new Error("Event end time must be after start time.");
    const spansMultipleDays = new Date(startAt).toDateString() !== new Date(endAt).toDateString();
    const nextEventType = args.eventType ?? existing.eventType;
    const nextRentalFulfillmentMode =
      args.rentalFulfillmentMode !== undefined
        ? resolveRentalFulfillmentMode(nextEventType, args.rentalFulfillmentMode)
        : resolveRentalFulfillmentMode(nextEventType, existing.rentalFulfillmentMode);
    const nextInvoiceId = args.invoiceId !== undefined ? args.invoiceId : existing.invoiceId;
    const nextStatus = normalizeEventStatus(args.status ?? existing.status);
    const wasCancelled = normalizeEventStatus(existing.status) === "cancelled";
    const now = Date.now();
    const patch = {
      title: args.title?.trim() ?? existing.title,
      status: nextStatus,
      visibility: args.visibility ?? existing.visibility,
      invoiceId: nextInvoiceId,
      startAt,
      endAt,
      timezone: EVENT_TIMEZONE,
      spansMultipleDays,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: args.requiresShowWindow ?? existing.requiresShowWindow,
      venueName: args.venueName?.trim() ?? existing.venueName,
      eventType: args.eventType ?? existing.eventType,
      teamsInterested: args.teamsInterested ?? existing.teamsInterested,
      category: args.category?.trim() ?? existing.category,
      host: args.host?.trim() ?? existing.host,
      expectedTurnout: args.expectedTurnout ?? existing.expectedTurnout,
      budgetUsd: args.budgetUsd ?? existing.budgetUsd,
      dayOfLeadUserId: args.dayOfLeadUserId?.trim() ?? existing.dayOfLeadUserId,
      eventManagerUserId: args.eventManagerUserId?.trim() ?? existing.eventManagerUserId,
      crewCostUsd: args.crewCostUsd ?? existing.crewCostUsd,
      bandsCostUsd: args.bandsCostUsd ?? existing.bandsCostUsd,
      externalRentalsCostUsd: args.externalRentalsCostUsd ?? existing.externalRentalsCostUsd,
      otherCostUsd: args.otherCostUsd ?? existing.otherCostUsd,
      rentalFulfillmentMode: nextRentalFulfillmentMode,
      notes: args.notes?.trim() ?? existing.notes,
      updatedAt: now,
    };

    const scope = (args.editScope ?? "this") as SeriesEditScope;
    const hasSeries = Boolean(existing.seriesId);

    if (hasSeries && existing.seriesId && scope !== "this") {
      const series = await ctx.db.get(existing.seriesId);
      if (!series) throw new Error("Linked event series not found.");
      const referenceIndex = existing.occurrenceIndex ?? 0;
      const nextAnchorStartAt =
        referenceIndex === 0 && args.startAt !== undefined ? args.startAt : series.anchorStartAt;
      const nextAnchorEndAt =
        referenceIndex === 0 && args.endAt !== undefined
          ? args.endAt
          : args.startAt !== undefined && args.endAt !== undefined && referenceIndex === 0
            ? args.endAt
            : series.anchorEndAt;

      await ctx.db.patch(existing.seriesId, {
        title: patch.title,
        anchorStartAt: nextAnchorStartAt,
        anchorEndAt: nextAnchorEndAt,
        requiresShowWindow: patch.requiresShowWindow,
        venueName: patch.venueName,
        eventType: patch.eventType,
        teamsInterested: patch.teamsInterested,
        category: patch.category,
        host: patch.host,
        expectedTurnout: patch.expectedTurnout,
        budgetUsd: patch.budgetUsd,
        occurrenceBandsCostUsd:
          args.bandsCostUsd !== undefined ? args.bandsCostUsd : series.occurrenceBandsCostUsd,
        occurrenceExternalRentalsCostUsd:
          args.externalRentalsCostUsd !== undefined
            ? args.externalRentalsCostUsd
            : series.occurrenceExternalRentalsCostUsd,
        occurrenceOtherCostUsd:
          args.otherCostUsd !== undefined ? args.otherCostUsd : series.occurrenceOtherCostUsd,
        dayOfLeadUserId: patch.dayOfLeadUserId,
        eventManagerUserId: patch.eventManagerUserId,
        rentalFulfillmentMode: patch.rentalFulfillmentMode,
        notes: patch.notes,
        updatedAt: now,
      });
      const updatedSeries = await ctx.db.get(existing.seriesId);
      if (!updatedSeries) throw new Error("Linked event series not found.");
      await propagateOverviewToSeriesOccurrences(
        ctx,
        updatedSeries,
        referenceIndex,
        scope,
        now,
      );
    } else {
      await ctx.db.patch(args.id, {
        ...patch,
        seriesDetached: hasSeries && scope === "this" ? true : existing.seriesDetached,
      });
    }

    if (nextInvoiceId) {
      await syncEventStatusForLinkedInvoice(ctx, args.id, nextInvoiceId, nextStatus);
    }

    if (nextStatus === "cancelled" && !wasCancelled) {
      await scheduleEventCancelledEmails(ctx, args.id, now);
    }
  },
});

export const setStatus = mutation({
  args: {
    id: v.id("events"),
    status: eventStatusValue,
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Event not found.");
    const wasCancelled = normalizeEventStatus(existing.status) === "cancelled";
    const nextStatus = normalizeEventStatus(args.status);
    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: nextStatus,
      updatedAt: now,
    });
    if (nextStatus === "cancelled" && !wasCancelled) {
      await scheduleEventCancelledEmails(ctx, args.id, now);
    }
  },
});

export const duplicate = mutation({
  args: { id: v.id("events") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Event not found.");
    const now = Date.now();
    const newId = await ctx.db.insert("events", {
      title: `${existing.title} (Copy)`,
      status: "tentative",
      visibility: existing.visibility,
      invoiceId: existing.invoiceId,
      publicToken: makePublicToken(),
      startAt: existing.startAt,
      endAt: existing.endAt,
      timezone: EVENT_TIMEZONE,
      spansMultipleDays: existing.spansMultipleDays,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: existing.requiresShowWindow,
      venueName: existing.venueName,
      eventType: existing.eventType,
      teamsInterested: existing.teamsInterested,
      category: existing.category,
      host: existing.host,
      expectedTurnout: existing.expectedTurnout,
      budgetUsd: existing.budgetUsd,
      dayOfLeadUserId: existing.dayOfLeadUserId,
      eventManagerUserId: existing.eventManagerUserId,
      crewCostUsd: existing.crewCostUsd,
      bandsCostUsd: existing.bandsCostUsd,
      externalRentalsCostUsd: existing.externalRentalsCostUsd,
      otherCostUsd: existing.otherCostUsd,
      rentalFulfillmentMode: existing.rentalFulfillmentMode,
      notes: existing.notes,
      createdAt: now,
      updatedAt: now,
    });
    const pullListItems = await ctx.db
      .query("eventPullListItems")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.id))
      .take(500);
    for (const item of pullListItems) {
      await ctx.db.insert("eventPullListItems", {
        eventId: newId,
        lineKind: item.lineKind ?? (item.packageId ? "package" : "type"),
        typeId: item.typeId,
        packageId: item.packageId,
        label: item.label,
        quantityRequired: item.quantityRequired,
        quantityPulled: 0,
        quantityCheckedOut: 0,
        source: item.source,
        sourcePackageId: item.sourcePackageId,
        sourceInvoiceLineKey: item.sourceInvoiceLineKey,
        sortOrder: item.sortOrder,
        notes: item.notes,
        createdAt: now,
        updatedAt: now,
      });
    }
    await syncEventStatusForLinkedInvoice(ctx, newId, existing.invoiceId, "tentative");
    const blocks = await ctx.db
      .query("eventScheduleBlocks")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.id))
      .take(500);
    for (const block of blocks) {
      await ctx.db.insert("eventScheduleBlocks", {
        eventId: newId,
        blockType: block.blockType,
        label: block.label,
        dayIndex: block.dayIndex,
        startsAt: block.startsAt,
        endsAt: block.endsAt,
        notes: block.notes,
        createdAt: now,
        updatedAt: now,
      });
    }
    return newId;
  },
});
