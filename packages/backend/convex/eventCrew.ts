import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

function hoursBetween(start: number, end: number) {
  return Number(((end - start) / 3_600_000).toFixed(2));
}

export const listByEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("eventCrewShifts")
      .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", args.eventId))
      .take(500);
  },
});

export const upsertShifts = mutation({
  args: {
    eventId: v.id("events"),
    shifts: v.array(
      v.object({
        id: v.optional(v.id("eventCrewShifts")),
        expenseReportId: v.optional(v.id("eventExpenseReports")),
        role: v.string(),
        personName: v.optional(v.string()),
        userId: v.optional(v.string()),
        callTime: v.optional(v.number()),
        startsAt: v.number(),
        endsAt: v.number(),
        postedToExpense: v.boolean(),
        notes: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const shift of args.shifts) {
      if (shift.endsAt <= shift.startsAt) throw new Error("Shift end must be after shift start.");
      if (shift.postedToExpense && !shift.expenseReportId) {
        throw new Error("Posted shifts must be linked to an expense report.");
      }
      if (shift.expenseReportId) {
        const report = await ctx.db.get(shift.expenseReportId);
        if (!report || report.eventId !== args.eventId) throw new Error("Shift has invalid expense report link.");
      }
    }

    const existing = await ctx.db
      .query("eventCrewShifts")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500);
    const keepIds = new Set(args.shifts.map((s) => s.id).filter(Boolean));
    for (const row of existing) {
      if (!keepIds.has(row._id)) await ctx.db.delete(row._id);
    }

    const now = Date.now();
    for (const shift of args.shifts) {
      const hours = hoursBetween(shift.startsAt, shift.endsAt);
      if (shift.id) {
        await ctx.db.patch(shift.id, {
          expenseReportId: shift.expenseReportId,
          role: shift.role.trim(),
          personName: shift.personName?.trim() || undefined,
          userId: shift.userId?.trim() || undefined,
          callTime: shift.callTime,
          startsAt: shift.startsAt,
          endsAt: shift.endsAt,
          hours,
          postedToExpense: shift.postedToExpense,
          notes: shift.notes?.trim() || undefined,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("eventCrewShifts", {
          eventId: args.eventId,
          expenseReportId: shift.expenseReportId,
          role: shift.role.trim(),
          personName: shift.personName?.trim() || undefined,
          userId: shift.userId?.trim() || undefined,
          callTime: shift.callTime,
          startsAt: shift.startsAt,
          endsAt: shift.endsAt,
          hours,
          postedToExpense: shift.postedToExpense,
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
  },
});
