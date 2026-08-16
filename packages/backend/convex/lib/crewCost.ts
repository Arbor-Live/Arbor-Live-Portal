import { components } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  resolveOpenSlotHourlyRateUsd,
  resolveUserCompensationHourlyRateUsd,
} from "./crewCompensation";

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

export async function calculateCrewCost(ctx: QueryCtx | MutationCtx, eventId: Id<"events">) {
  const event = await ctx.db.get(eventId);
  const otPremium = event?.otPremium === true;
  const settings = await ctx.db
    .query("invoiceSettings")
    .withIndex("by_key", (q) => q.eq("key", "default"))
    .unique();
  const bufferPercent = event?.crewCostBufferPercent ?? settings?.crewCostBufferPercent ?? 0;

  const shifts = await ctx.db
    .query("eventCrewShifts")
    .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", eventId))
    .take(500);
  const userIds = Array.from(new Set(shifts.map((shift) => shift.userId).filter(Boolean) as string[]));
  const rates = await ctx.db.query("userCompensationRates").withIndex("by_updatedAt").take(1000);
  const rateByUserId = new Map(
    rates.map((rate) => [
      rate.userId,
      resolveUserCompensationHourlyRateUsd(rate, settings),
    ]),
  );

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

    const assignedRate = shift.userId ? (rateByUserId.get(shift.userId) ?? 0) : 0;
    // Open slots: prefer the stamp on the shift, else average of global Normal/Lead.
    const estimatedRate = resolveOpenSlotHourlyRateUsd(shift.estimatedHourlyRateUsd, settings);
    const rate = shift.userId ? assignedRate : estimatedRate;
    const userName = shift.userId
      ? (userRecords.get(shift.userId)?.name ?? userRecords.get(shift.userId)?.email ?? shift.userId)
      : shift.personName?.trim() || "Unassigned";
    const allocationKey = shift.userId ? `${shift.userId}:${dayKey}` : undefined;
    const alreadyAllocated = allocationKey ? (userDayAllocatedHours.get(allocationKey) ?? 0) : 0;
    let regularHours = roundCurrency(Math.max(0, Math.min(shift.hours, 8 - alreadyAllocated)));
    let overtimeHours = roundCurrency(Math.max(0, shift.hours - regularHours));
    if (otPremium) {
      regularHours = 0;
      overtimeHours = roundCurrency(shift.hours);
    }
    if (allocationKey) {
      userDayAllocatedHours.set(allocationKey, roundCurrency(alreadyAllocated + shift.hours));
    }
    const overtimeRateUsd = roundCurrency(rate * overtimeMultiplier);
    const subtotalUsd = shift.userId
      ? otPremium
        ? roundCurrency(shift.hours * overtimeRateUsd)
        : roundCurrency(regularHours * rate + overtimeHours * overtimeRateUsd)
      : roundCurrency(shift.hours * rate);

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
  const totalCostUsd = roundCurrency(byScheduleBlock.reduce((sum, row) => sum + row.subtotalUsd, 0));
  const bufferedTotalCostUsd = roundCurrency(totalCostUsd * (1 + bufferPercent / 100));
  const missingRateUsers = Array.from(
    new Set(
      byScheduleBlock
        .flatMap((block) => block.rows.filter((row) => row.missingRate && row.userId).map((row) => row.name)),
    ),
  ).sort((a, b) => a.localeCompare(b));
  const missingRateOpenSlotCount = byScheduleBlock.reduce(
    (sum, block) => sum + block.rows.filter((row) => row.missingRate && !row.userId).length,
    0,
  );
  const totalRegularHours = roundCurrency(byScheduleBlock.reduce((sum, row) => sum + row.regularHours, 0));
  const totalOvertimeHours = roundCurrency(byScheduleBlock.reduce((sum, row) => sum + row.overtimeHours, 0));
  return {
    totalCostUsd,
    bufferedTotalCostUsd,
    bufferPercent,
    totalRegularHours,
    totalOvertimeHours,
    overtimeMultiplier,
    otPremium,
    byUser,
    byScheduleBlock,
    missingRateUsers,
    missingRateOpenSlotCount,
  };
}

export async function syncEventCrewCostUsd(ctx: MutationCtx, eventId: Id<"events">, now: number) {
  const costs = await calculateCrewCost(ctx, eventId);
  await ctx.db.patch(eventId, {
    crewCostUsd: costs.totalCostUsd,
    updatedAt: now,
  });
  return costs;
}
