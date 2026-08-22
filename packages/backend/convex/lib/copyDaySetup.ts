import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { listEventsByInvoiceId } from "./invoiceEvents";

const MAX_LINKED_DAYS = 50;

/**
 * Sibling day-events for a multi-day booking: same invoice and/or same
 * source booking request. Sorted by start time.
 */
export async function listSiblingDayEvents(
  ctx: QueryCtx | MutationCtx,
  event: Doc<"events">,
): Promise<Doc<"events">[]> {
  const byId = new Map<string, Doc<"events">>();
  byId.set(event._id, event);

  if (event.invoiceId) {
    for (const row of await listEventsByInvoiceId(ctx, event.invoiceId)) {
      byId.set(row._id, row);
    }
  }

  if (event.sourceEventRequestId) {
    const byRequest = await ctx.db
      .query("events")
      .withIndex("by_sourceEventRequestId", (q) =>
        q.eq("sourceEventRequestId", event.sourceEventRequestId!),
      )
      .take(MAX_LINKED_DAYS);
    for (const row of byRequest) {
      byId.set(row._id, row);
    }
  }

  return [...byId.values()].sort(
    (a, b) => a.startAt - b.startAt || a._creationTime - b._creationTime,
  );
}

async function replaceScheduleAndOpenSlots(
  ctx: MutationCtx,
  args: {
    targetEventId: Id<"events">;
    sourceBlocks: Doc<"eventScheduleBlocks">[];
    sourceShifts: Doc<"eventCrewShifts">[];
    deltaMs: number;
    now: number;
  },
) {
  const { targetEventId, sourceBlocks, sourceShifts, deltaMs, now } = args;

  const existingBlocks = await ctx.db
    .query("eventScheduleBlocks")
    .withIndex("by_eventId", (q) => q.eq("eventId", targetEventId))
    .take(500);
  for (const row of existingBlocks) {
    await ctx.db.delete(row._id);
  }

  const existingShifts = await ctx.db
    .query("eventCrewShifts")
    .withIndex("by_eventId", (q) => q.eq("eventId", targetEventId))
    .take(500);
  for (const row of existingShifts) {
    await ctx.db.delete(row._id);
  }

  const blockIdMap = new Map<Id<"eventScheduleBlocks">, Id<"eventScheduleBlocks">>();
  for (const block of sourceBlocks) {
    const newId = await ctx.db.insert("eventScheduleBlocks", {
      eventId: targetEventId,
      blockType: block.blockType,
      label: block.label,
      dayIndex: block.dayIndex,
      startsAt: block.startsAt + deltaMs,
      endsAt: block.endsAt + deltaMs,
      notes: block.notes,
      createdAt: now,
      updatedAt: now,
    });
    blockIdMap.set(block._id, newId);
  }

  // Copy slot shape (role + hours) only — never assignees.
  for (const shift of sourceShifts) {
    const mappedBlockId = shift.scheduleBlockId
      ? blockIdMap.get(shift.scheduleBlockId)
      : undefined;
    const startsAt = shift.startsAt + deltaMs;
    const endsAt = shift.endsAt + deltaMs;
    const hours =
      Number.isFinite(shift.hours) && shift.hours > 0
        ? shift.hours
        : Math.max(0, (endsAt - startsAt) / 3_600_000);
    await ctx.db.insert("eventCrewShifts", {
      eventId: targetEventId,
      scheduleBlockId: mappedBlockId,
      role: shift.role,
      startsAt,
      endsAt,
      hours,
      estimatedHourlyRateUsd: shift.estimatedHourlyRateUsd,
      postedToExpense: false,
      notes: shift.notes,
      createdAt: now,
      updatedAt: now,
    });
  }
}

async function replacePullListFromSource(
  ctx: MutationCtx,
  args: {
    targetEventId: Id<"events">;
    sourceItems: Doc<"eventPullListItems">[];
    now: number;
  },
) {
  const existing = await ctx.db
    .query("eventPullListItems")
    .withIndex("by_eventId", (q) => q.eq("eventId", args.targetEventId))
    .take(500);
  for (const row of existing) {
    await ctx.db.delete(row._id);
  }

  for (const item of args.sourceItems) {
    await ctx.db.insert("eventPullListItems", {
      eventId: args.targetEventId,
      lineKind: item.lineKind,
      typeId: item.typeId,
      packageId: item.packageId,
      label: item.label,
      quantityRequired: item.quantityRequired,
      // Preserve checkout intent from the source day; pulled stays reset so
      // each day tracks its own pull progress.
      quantityPulled: 0,
      quantityCheckedOut: item.quantityCheckedOut,
      source: item.source,
      sourcePackageId: item.sourcePackageId,
      sourceInvoiceLineKey: item.sourceInvoiceLineKey,
      excludedTypeIds: item.excludedTypeIds,
      sortOrder: item.sortOrder,
      notes: item.notes,
      createdAt: args.now,
      updatedAt: args.now,
    });
  }
}

/**
 * Copy schedule slot hours (not people) and pull-list / checkout quantities
 * from one multi-day sibling event onto other sibling days.
 */
export async function copyDaySetupToTargets(
  ctx: MutationCtx,
  args: {
    sourceEventId: Id<"events">;
    targetEventIds: Id<"events">[];
    copySchedule: boolean;
    copyPullList: boolean;
  },
): Promise<{ copiedToEventIds: Id<"events">[] }> {
  const source = await ctx.db.get(args.sourceEventId);
  if (!source) throw new Error("Source event not found.");

  const siblings = await listSiblingDayEvents(ctx, source);
  const siblingIds = new Set(siblings.map((row) => row._id));
  if (siblings.length < 2) {
    throw new Error("This event has no linked days to copy setup onto.");
  }

  const targets = args.targetEventIds.filter(
    (id) => id !== args.sourceEventId && siblingIds.has(id),
  );
  if (targets.length === 0) {
    throw new Error("Select at least one other linked day to copy onto.");
  }

  const sourceBlocks = args.copySchedule
    ? await ctx.db
        .query("eventScheduleBlocks")
        .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", args.sourceEventId))
        .take(500)
    : [];
  const sourceShifts = args.copySchedule
    ? await ctx.db
        .query("eventCrewShifts")
        .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", args.sourceEventId))
        .take(500)
    : [];
  const sourcePullList = args.copyPullList
    ? await ctx.db
        .query("eventPullListItems")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.sourceEventId))
        .take(500)
    : [];

  const now = Date.now();
  const copiedToEventIds: Id<"events">[] = [];

  for (const targetId of targets) {
    const target = await ctx.db.get(targetId);
    if (!target) continue;
    const deltaMs = target.startAt - source.startAt;

    if (args.copySchedule) {
      await replaceScheduleAndOpenSlots(ctx, {
        targetEventId: targetId,
        sourceBlocks,
        sourceShifts,
        deltaMs,
        now,
      });
    }
    if (args.copyPullList) {
      await replacePullListFromSource(ctx, {
        targetEventId: targetId,
        sourceItems: sourcePullList,
        now,
      });
    }
    await ctx.db.patch(targetId, { updatedAt: now });
    copiedToEventIds.push(targetId);
  }

  return { copiedToEventIds };
}
