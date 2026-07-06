import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireArborInternalContext, requireAuth } from "./lib/auth";
import { calculateCrewCost, syncEventCrewCostUsd } from "./lib/crewCost";
import { scheduleCrewScheduledEmails } from "./email/triggers";

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
        callTime: v.optional(v.number()),
        startsAt: v.number(),
        endsAt: v.number(),
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
    }));
    const keepIds = new Set(args.shifts.map((s) => s.id).filter(Boolean));
    for (const row of existing) {
      if (!keepIds.has(row._id)) await ctx.db.delete(row._id);
    }

    const now = Date.now();
    for (const shift of args.shifts) {
      const hours = hoursBetween(shift.startsAt, shift.endsAt);
      const postedToExpense = shift.postedToExpense && !!shift.expenseReportId;
      const estimatedHourlyRateUsd =
        shift.estimatedHourlyRateUsd !== undefined && shift.estimatedHourlyRateUsd > 0
          ? shift.estimatedHourlyRateUsd
          : undefined;
      if (shift.id) {
        await ctx.db.patch(shift.id, {
          scheduleBlockId: shift.scheduleBlockId,
          expenseReportId: shift.expenseReportId,
          role: shift.role.trim(),
          personName: shift.personName?.trim() || undefined,
          userId: shift.userId?.trim() || undefined,
          callTime: shift.callTime,
          startsAt: shift.startsAt,
          endsAt: shift.endsAt,
          hours,
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
          userId: shift.userId?.trim() || undefined,
          callTime: shift.callTime,
          startsAt: shift.startsAt,
          endsAt: shift.endsAt,
          hours,
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
      })),
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

    const existing = await ctx.db
      .query("eventCrewShifts")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500);
    const legacy = existing.filter((row) => !row.scheduleBlockId);
    for (const row of legacy) {
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

    return { deletedCount: legacy.length };
  },
});
