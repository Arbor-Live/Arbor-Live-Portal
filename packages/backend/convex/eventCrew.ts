import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireArborInternalContext, requireAuth } from "./lib/auth";
import { requireEventEditAccess } from "./lib/eventAccess";
import { calculateCrewCost, syncEventCrewCostUsd } from "./lib/crewCost";
import {
  loadInvoiceCrewRateSettings,
  resolveOpenSlotHourlyRateUsd,
} from "./lib/crewCompensation";
import { getUserOtForecast } from "./lib/otForecast";
import { scheduleCrewScheduledEmails } from "./email/triggers";
import { bumpCrewInviteSequence } from "./email/crewInviteSequence";
import { isSectionBlockType } from "./lib/scheduleBlockTypes";
import { isTraineeShift } from "./lib/crewShiftKinds";
import { normalizeEventStatus } from "./lib/eventStatus";

function hoursBetween(start: number, end: number) {
  return Number(((end - start) / 3_600_000).toFixed(2));
}

export const listByEvent = query({
  args: { eventId: v.id("events") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    return await ctx.db
      .query("eventCrewShifts")
      .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", args.eventId))
      .take(500);
  },
});

export const getComputedCrewCost = query({
  args: { eventId: v.id("events") },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    return await calculateCrewCost(ctx, args.eventId);
  },
});

export const upsertShifts = mutation({
  args: {
    eventId: v.id("events"),
    shifts: v.array(
      v.object({
        id: v.optional(v.id("eventCrewShifts")),
        scheduleBlockId: v.optional(v.id("eventScheduleBlocks")),
        expenseReportId: v.optional(v.id("eventExpenseReports")),
        role: v.string(),
        personName: v.optional(v.string()),
        userId: v.optional(v.string()),
        crewApplicationId: v.optional(v.id("crewApplications")),
        callTime: v.optional(v.number()),
        startsAt: v.number(),
        endsAt: v.number(),
        timesOverridden: v.optional(v.boolean()),
        estimatedHourlyRateUsd: v.optional(v.number()),
        postedToExpense: v.boolean(),
        notes: v.optional(v.string()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    await requireEventEditAccess(ctx, args.eventId);
    for (const shift of args.shifts) {
      if (shift.endsAt <= shift.startsAt) throw new Error("Shift end must be after shift start.");
      if (shift.expenseReportId) {
        const report = await ctx.db.get(shift.expenseReportId);
        if (!report || report.eventId !== args.eventId) throw new Error("Shift has invalid expense report link.");
      }
      if (shift.scheduleBlockId) {
        const block = await ctx.db.get(shift.scheduleBlockId);
        if (!block || block.eventId !== args.eventId) {
          throw new Error("Shift has invalid schedule block link.");
        }
      }
    }

    const existing = await ctx.db
      .query("eventCrewShifts")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500);
    const existingIds = new Set(existing.map((row) => row._id));
    const existingById = new Map(existing.map((row) => [row._id, row]));
    for (const shift of args.shifts) {
      if (shift.id && !existingIds.has(shift.id)) {
        throw new Error("Crew shift does not belong to this event.");
      }
    }
    const previousShifts = existing.map((row) => ({
      scheduleBlockId: row.scheduleBlockId,
      role: row.role,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      userId: row.userId,
      crewApplicationId: row.crewApplicationId,
    }));
    const keepIds = new Set(args.shifts.map((s) => s.id).filter(Boolean));
    for (const row of existing) {
      if (!keepIds.has(row._id)) await ctx.db.delete(row._id);
    }

    const now = Date.now();
    const crewRateSettings = await loadInvoiceCrewRateSettings(ctx);
    for (const shift of args.shifts) {
      const hours = hoursBetween(shift.startsAt, shift.endsAt);
      const postedToExpense = shift.postedToExpense && !!shift.expenseReportId;
      const userId = shift.userId?.trim() || undefined;
      // Editors that don't know about trainees (e.g. the invoice crew section)
      // send the row back without its application link or call time. Keep them,
      // or the trainee turns into a billed open slot.
      const previous = shift.id ? existingById.get(shift.id) : undefined;
      const crewApplicationId =
        shift.crewApplicationId ?? (userId ? undefined : previous?.crewApplicationId);
      const callTime = shift.callTime ?? previous?.callTime;
      const isTrainee = isTraineeShift({ userId, crewApplicationId });
      const timesOverridden = shift.timesOverridden === true ? true : undefined;
      // Open slots: stamp an estimate from global Normal/Lead when the client
      // didn't send one (common when rates were 0 at edit time, or omitted).
      const estimatedHourlyRateUsd = isTrainee
        ? undefined
        : userId
        ? shift.estimatedHourlyRateUsd !== undefined && shift.estimatedHourlyRateUsd > 0
          ? shift.estimatedHourlyRateUsd
          : undefined
        : (() => {
            const rate = resolveOpenSlotHourlyRateUsd(
              shift.estimatedHourlyRateUsd,
              crewRateSettings,
            );
            return rate > 0 ? rate : undefined;
          })();
      if (shift.id) {
        await ctx.db.patch(shift.id, {
          scheduleBlockId: shift.scheduleBlockId,
          expenseReportId: shift.expenseReportId,
          role: shift.role.trim(),
          personName: shift.personName?.trim() || undefined,
          userId,
          crewApplicationId,
          callTime,
          startsAt: shift.startsAt,
          endsAt: shift.endsAt,
          hours,
          timesOverridden,
          estimatedHourlyRateUsd,
          postedToExpense,
          notes: shift.notes?.trim() || undefined,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("eventCrewShifts", {
          eventId: args.eventId,
          scheduleBlockId: shift.scheduleBlockId,
          expenseReportId: shift.expenseReportId,
          role: shift.role.trim(),
          personName: shift.personName?.trim() || undefined,
          userId,
          crewApplicationId,
          callTime,
          startsAt: shift.startsAt,
          endsAt: shift.endsAt,
          hours,
          timesOverridden,
          estimatedHourlyRateUsd,
          postedToExpense,
          notes: shift.notes?.trim() || undefined,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    const reports = await ctx.db
      .query("eventExpenseReports")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(100);
    for (const report of reports) {
      const reportShifts = await ctx.db
        .query("eventCrewShifts")
        .withIndex("by_expenseReportId", (q) => q.eq("expenseReportId", report._id))
        .take(500);
      const totalHours = Number(reportShifts.reduce((acc, row) => acc + row.hours, 0).toFixed(2));
      await ctx.db.patch(report._id, {
        totalHours,
        updatedAt: now,
      });
    }

    await syncEventCrewCostUsd(ctx, args.eventId, now);
    const inviteSequence = await bumpCrewInviteSequence(ctx, args.eventId);
    await scheduleCrewScheduledEmails(
      ctx,
      args.eventId,
      previousShifts,
      args.shifts.map((shift) => ({
        scheduleBlockId: shift.scheduleBlockId,
        role: shift.role.trim(),
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
        userId: shift.userId?.trim() || undefined,
        crewApplicationId:
          shift.crewApplicationId ??
          (shift.userId?.trim() || !shift.id
            ? undefined
            : existingById.get(shift.id)?.crewApplicationId),
      })),
      inviteSequence,
    );
    return null;
  },
});

export const deleteUnassignedShifts = mutation({
  args: { eventId: v.id("events") },
  returns: v.object({ deletedCount: v.number() }),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    await requireEventEditAccess(ctx, args.eventId);

    const existing = await ctx.db
      .query("eventCrewShifts")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500);
    const blocks = await ctx.db
      .query("eventScheduleBlocks")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500);
    // Crew belong to sections; a shift on a moment (soundcheck, set, …) is unlinked.
    const blockIds = new Set(
      blocks.filter((block) => isSectionBlockType(block.blockType)).map((block) => block._id),
    );
    // Unlinked includes shifts with no block and shifts whose block was deleted
    // (dangling `scheduleBlockId`) — both are invisible on the timeline.
    // Trainees span sections on purpose ("entire event", "first 8 hours").
    const unlinked = existing.filter(
      (row) =>
        !isTraineeShift(row) && (!row.scheduleBlockId || !blockIds.has(row.scheduleBlockId)),
    );
    for (const row of unlinked) {
      await ctx.db.delete(row._id);
    }

    const now = Date.now();
    const reports = await ctx.db
      .query("eventExpenseReports")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(100);
    for (const report of reports) {
      const reportShifts = await ctx.db
        .query("eventCrewShifts")
        .withIndex("by_expenseReportId", (q) => q.eq("expenseReportId", report._id))
        .take(500);
      const totalHours = Number(reportShifts.reduce((acc, row) => acc + row.hours, 0).toFixed(2));
      await ctx.db.patch(report._id, {
        totalHours,
        updatedAt: now,
      });
    }

    await syncEventCrewCostUsd(ctx, args.eventId, now);

    return { deletedCount: unlinked.length };
  },
});

export const getOtForecastForUser = query({
  args: {
    userId: v.string(),
    rangeStart: v.number(),
    rangeEnd: v.number(),
  },
  returns: v.object({
    hasOt: v.boolean(),
    hasDt: v.boolean(),
    otDays: v.array(v.object({ dayKey: v.string(), hours: v.number() })),
    dtDays: v.array(v.object({ dayKey: v.string(), hours: v.number() })),
    otWeeks: v.array(v.object({ weekKey: v.string(), hours: v.number() })),
  }),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    return await getUserOtForecast(ctx, args.userId, args.rangeStart, args.rangeEnd);
  },
});

const CONFLICT_USER_CAP = 80;
const CONFLICT_LOOKBACK_MS = 24 * 3_600_000;

/**
 * Other events' shifts for these people that overlap this event's schedule.
 * The schedule UI checks each section against them to flag double-booking.
 */
export const listCrewConflictsForEvent = query({
  args: {
    eventId: v.id("events"),
    userIds: v.array(v.string()),
  },
  returns: v.array(
    v.object({
      userId: v.string(),
      eventId: v.id("events"),
      eventTitle: v.string(),
      startsAt: v.number(),
      endsAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) return [];

    const blocks = await ctx.db
      .query("eventScheduleBlocks")
      .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", args.eventId))
      .take(200);
    const spanStart = Math.min(event.startAt, ...blocks.map((block) => block.startsAt));
    const spanEnd = Math.max(event.endAt, ...blocks.map((block) => block.endsAt));

    const userIds = Array.from(new Set(args.userIds.map((id) => id.trim()).filter(Boolean))).slice(
      0,
      CONFLICT_USER_CAP,
    );
    const perUser = await Promise.all(
      userIds.map((userId) =>
        ctx.db
          .query("eventCrewShifts")
          .withIndex("by_userId_and_startsAt", (q) =>
            q
              .eq("userId", userId)
              .gte("startsAt", spanStart - CONFLICT_LOOKBACK_MS)
              .lte("startsAt", spanEnd),
          )
          .take(50),
      ),
    );
    const overlapping = perUser
      .flat()
      .filter(
        (shift) =>
          shift.eventId !== args.eventId && shift.endsAt > spanStart && shift.startsAt < spanEnd,
      );

    const eventIds = Array.from(new Set(overlapping.map((shift) => shift.eventId)));
    const otherEvents = new Map(
      (await Promise.all(eventIds.map((id) => ctx.db.get(id))))
        .filter((row): row is NonNullable<typeof row> => row !== null)
        .map((row) => [row._id, row]),
    );

    return overlapping.flatMap((shift) => {
      const other = otherEvents.get(shift.eventId);
      if (!other || normalizeEventStatus(other.status) === "cancelled" || !shift.userId) return [];
      return [
        {
          userId: shift.userId,
          eventId: shift.eventId,
          eventTitle: other.title,
          startsAt: shift.startsAt,
          endsAt: shift.endsAt,
        },
      ];
    });
  },
});
