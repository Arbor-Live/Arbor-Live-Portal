import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireAuth } from "./lib/auth";

function hoursBetween(start: number, end: number) {
  return Number(((end - start) / 3_600_000).toFixed(2));
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function getShiftDayKey(startsAt: number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(startsAt));
}

async function calculateCrewCost(ctx: QueryCtx | MutationCtx, eventId: Id<"events">) {
  const shifts = await ctx.db
    .query("eventCrewShifts")
    .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", eventId))
    .take(500);
  const userIds = Array.from(new Set(shifts.map((shift) => shift.userId).filter(Boolean) as string[]));
  const rates = await ctx.db.query("userCompensationRates").withIndex("by_updatedAt").take(1000);
  const rateByUserId = new Map(rates.map((rate) => [rate.userId, rate.hourlyRateUsd]));

  const scheduleBlocks = await ctx.db
    .query("eventScheduleBlocks")
    .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", eventId))
    .take(500);
  const scheduleBlockById = new Map(scheduleBlocks.map((block) => [block._id, block]));
  const userRecords = new Map<string, { name?: string; email?: string }>();
  if (userIds.length > 0) {
    const usersResult = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "user",
      paginationOpts: { cursor: null, numItems: 500 },
    });
    const users = (usersResult?.page ?? []) as Array<{
      _id?: string;
      id?: string;
      name?: string;
      email?: string;
    }>;
    for (const user of users) {
      const key = user.id ?? user._id ?? "";
      if (!key || !userIds.includes(key)) continue;
      userRecords.set(key, { name: user.name, email: user.email });
    }
  }

  const userTotals = new Map<string, { regularHours: number; overtimeHours: number; rate: number; costUsd: number }>();
  const byBlock = new Map<
    string,
    {
      scheduleBlockId?: Id<"eventScheduleBlocks">;
      blockLabel: string;
      blockType?: string;
      startsAt: number;
      regularHours: number;
      overtimeHours: number;
      subtotalUsd: number;
      rows: Array<{
        shiftId: Id<"eventCrewShifts">;
        userId?: string;
        name: string;
        role: string;
        startsAt: number;
        endsAt: number;
        totalHours: number;
        regularHours: number;
        overtimeHours: number;
        baseRateUsd: number;
        overtimeMultiplier: number;
        overtimeRateUsd: number;
        subtotalUsd: number;
        missingRate: boolean;
      }>;
    }
  >();
  const userDayAllocatedHours = new Map<string, number>();
  const overtimeMultiplier = 1.5;

  for (const shift of shifts) {
    const dayKey = getShiftDayKey(shift.startsAt);
    const block = shift.scheduleBlockId ? scheduleBlockById.get(shift.scheduleBlockId) : undefined;
    const blockKey = shift.scheduleBlockId ?? `unassigned:${dayKey}`;
    const fallbackLabel = `Unassigned (${dayKey})`;
    const blockLabel = block?.label?.trim() || fallbackLabel;
    const blockEntry =
      byBlock.get(blockKey) ??
      {
        scheduleBlockId: shift.scheduleBlockId,
        blockLabel,
        blockType: block?.blockType,
        startsAt: block?.startsAt ?? shift.startsAt,
        regularHours: 0,
        overtimeHours: 0,
        subtotalUsd: 0,
        rows: [],
      };

    const rate = shift.userId ? (rateByUserId.get(shift.userId) ?? 0) : 0;
    const userName = shift.userId ? userRecords.get(shift.userId)?.name ?? userRecords.get(shift.userId)?.email ?? shift.userId : shift.personName?.trim() || "Unassigned user";
    const allocationKey = shift.userId ? `${shift.userId}:${dayKey}` : undefined;
    const alreadyAllocated = allocationKey ? (userDayAllocatedHours.get(allocationKey) ?? 0) : 0;
    const regularHours = roundCurrency(Math.max(0, Math.min(shift.hours, 8 - alreadyAllocated)));
    const overtimeHours = roundCurrency(Math.max(0, shift.hours - regularHours));
    if (allocationKey) {
      userDayAllocatedHours.set(allocationKey, roundCurrency(alreadyAllocated + shift.hours));
    }
    const overtimeRateUsd = roundCurrency(rate * overtimeMultiplier);
    const subtotalUsd = roundCurrency(regularHours * rate + overtimeHours * overtimeRateUsd);

    blockEntry.regularHours = roundCurrency(blockEntry.regularHours + regularHours);
    blockEntry.overtimeHours = roundCurrency(blockEntry.overtimeHours + overtimeHours);
    blockEntry.subtotalUsd = roundCurrency(blockEntry.subtotalUsd + subtotalUsd);
    blockEntry.rows.push({
      shiftId: shift._id,
      userId: shift.userId,
      name: userName,
      role: shift.role,
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
      totalHours: shift.hours,
      regularHours,
      overtimeHours,
      baseRateUsd: rate,
      overtimeMultiplier,
      overtimeRateUsd,
      subtotalUsd,
      missingRate: rate <= 0,
    });
    byBlock.set(blockKey, blockEntry);

    if (shift.userId) {
      const existing = userTotals.get(shift.userId) ?? { regularHours: 0, overtimeHours: 0, rate, costUsd: 0 };
      userTotals.set(shift.userId, {
        regularHours: roundCurrency(existing.regularHours + regularHours),
        overtimeHours: roundCurrency(existing.overtimeHours + overtimeHours),
        rate,
        costUsd: roundCurrency(existing.costUsd + subtotalUsd),
      });
    }
  }

  const byUser = Array.from(userTotals.entries())
    .map(([userId, totals]) => ({
      userId,
      name: userRecords.get(userId)?.name ?? userRecords.get(userId)?.email ?? userId,
      rateUsd: totals.rate,
      regularHours: totals.regularHours,
      overtimeHours: totals.overtimeHours,
      costUsd: totals.costUsd,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const byScheduleBlock = Array.from(byBlock.values())
    .map((entry) => ({
      ...entry,
      rows: entry.rows.sort((a, b) => a.startsAt - b.startsAt || a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.startsAt - b.startsAt || a.blockLabel.localeCompare(b.blockLabel));
  const totalCostUsd = roundCurrency(byUser.reduce((sum, row) => sum + row.costUsd, 0));
  const missingRateUsers = Array.from(
    new Set(
      byScheduleBlock
        .flatMap((block) => block.rows.filter((row) => row.missingRate && row.userId).map((row) => row.name)),
    ),
  ).sort((a, b) => a.localeCompare(b));
  const totalRegularHours = roundCurrency(byScheduleBlock.reduce((sum, row) => sum + row.regularHours, 0));
  const totalOvertimeHours = roundCurrency(byScheduleBlock.reduce((sum, row) => sum + row.overtimeHours, 0));
  return {
    totalCostUsd,
    totalRegularHours,
    totalOvertimeHours,
    overtimeMultiplier,
    byUser,
    byScheduleBlock,
    missingRateUsers,
  };
}

export const listByEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db
      .query("eventCrewShifts")
      .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", args.eventId))
      .take(500);
  },
});

export const getComputedCrewCost = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
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
        postedToExpense: v.boolean(),
        notes: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
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
    const keepIds = new Set(args.shifts.map((s) => s.id).filter(Boolean));
    for (const row of existing) {
      if (!keepIds.has(row._id)) await ctx.db.delete(row._id);
    }

    const now = Date.now();
    for (const shift of args.shifts) {
      const hours = hoursBetween(shift.startsAt, shift.endsAt);
      const postedToExpense = shift.postedToExpense && !!shift.expenseReportId;
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

    const costs = await calculateCrewCost(ctx, args.eventId);
    await ctx.db.patch(args.eventId, {
      crewCostUsd: costs.totalCostUsd,
      updatedAt: now,
    });
  },
});

export const deleteUnassignedShifts = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

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

    const costs = await calculateCrewCost(ctx, args.eventId);
    await ctx.db.patch(args.eventId, {
      crewCostUsd: costs.totalCostUsd,
      updatedAt: now,
    });

    return { deletedCount: legacy.length };
  },
});
