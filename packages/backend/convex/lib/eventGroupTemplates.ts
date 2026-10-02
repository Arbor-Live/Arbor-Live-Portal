import { pacificDayIndexFromAnchor } from "@arbor/format";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { syncEventCrewCostUsd } from "./crewCost";
import {
  applyPositionTemplates,
  blocksToTemplates,
  replaceEmptyShiftsFromTemplates,
  replaceScheduleBlocksFromTemplates,
  resolveDefaultCrewHourlyRateUsd,
  shiftsToTemplates,
  type EventSeriesBlockTemplate,
  type EventSeriesShiftTemplate,
} from "./eventSeriesGeneration";
import {
  MAX_OCCURRENCE_POSITIONS,
  positionTemplateFromSlot,
  type EventSeriesPositionTemplate,
} from "./eventSeriesPositions";
import { isActBlock } from "./runOfShow";
import { isTraineeShift } from "./crewShiftKinds";
import { listGroupDays, selectDaysInScope, type GroupApplyScope } from "./eventGroupDays";

export { listGroupDays, selectDaysInScope, type GroupApplyScope };

/**
 * One apply engine for event groups (recurring series and multi-day bookings):
 * the group's templates (Run of Show sections, crew slots, positions) are
 * relative to each day's start, and applying them to a scope of days only adds,
 * moves or removes template content. Acts' soundcheck/set blocks, assigned crew
 * shifts and filled positions are never touched.
 *
 * Which days a scope reaches is decided in `eventGroupDays.ts`.
 */

export type GroupTemplateParts = {
  schedule?: boolean;
  crew?: boolean;
  positions?: boolean;
};

export function assertValidReferenceIndex(referenceIndex: number) {
  if (!Number.isInteger(referenceIndex) || referenceIndex < 0) {
    throw new Error("Pick a day to apply from.");
  }
}

/** Apply the group's saved templates to one day. */
export async function applyGroupTemplatesToDay(
  ctx: MutationCtx,
  group: Doc<"eventSeries">,
  day: Pick<Doc<"events">, "_id" | "startAt">,
  parts: GroupTemplateParts,
  options: { now: number; defaultHourlyRateUsd?: number },
) {
  const { now } = options;
  const blockTemplates = group.blockTemplates ?? undefined;
  if (parts.schedule && blockTemplates && blockTemplates.length > 0) {
    await replaceScheduleBlocksFromTemplates(ctx, day._id, day.startAt, blockTemplates, now);
  }
  // An empty crew template still clears the day's open slots: the template is
  // the day's whole crew shape.
  if (parts.crew) {
    await replaceEmptyShiftsFromTemplates(
      ctx,
      day._id,
      day.startAt,
      group.shiftTemplates ?? undefined,
      blockTemplates,
      options.defaultHourlyRateUsd,
      now,
    );
    await syncEventCrewCostUsd(ctx, day._id, now);
  }
  if (parts.positions) {
    await applyPositionTemplates(ctx, day._id, day.startAt, group.positionTemplates ?? [], now);
  }
}

/** Apply the group's saved templates to every day in scope; returns the day count. */
export async function applyGroupTemplates(
  ctx: MutationCtx,
  group: Doc<"eventSeries">,
  args: { scope: GroupApplyScope; referenceIndex: number; parts: GroupTemplateParts; now: number },
): Promise<number> {
  assertValidReferenceIndex(args.referenceIndex);
  const days = selectDaysInScope(
    await listGroupDays(ctx, group._id),
    args.scope,
    args.referenceIndex,
    args.now,
  );
  const defaultHourlyRateUsd = args.parts.crew
    ? await resolveDefaultCrewHourlyRateUsd(ctx)
    : undefined;
  for (const day of days) {
    await applyGroupTemplatesToDay(ctx, group, day, args.parts, {
      now: args.now,
      defaultHourlyRateUsd,
    });
  }
  return days.length;
}

export type CapturedDayTemplates = {
  blockTemplates?: EventSeriesBlockTemplate[];
  shiftTemplates?: EventSeriesShiftTemplate[];
  positionTemplates?: EventSeriesPositionTemplate[];
};

/**
 * Read one day's setup as group templates, relative to the day's start.
 * Capturing positions also stamps each position's template key on the source
 * day, so applying the template back to it updates rather than duplicates.
 */
/** Rows read per kind when capturing a day (a day's blocks and shifts are in the dozens). */
const MAX_DAY_ROWS = 500;

/**
 * Capturing a day's setup must see all of it: a template built from a
 * truncated read would quietly drop the rest from every day it is applied to.
 * `rows` was read with one extra row so overflow is detectable.
 */
function withinCap<T>(rows: T[], what: string, max: number = MAX_DAY_ROWS): T[] {
  if (rows.length > max) {
    throw new Error(`This day has more than ${max} ${what}, too many to use as a template.`);
  }
  return rows;
}

export async function captureDayTemplates(
  ctx: MutationCtx,
  day: Doc<"events">,
  parts: GroupTemplateParts,
  now: number,
): Promise<CapturedDayTemplates> {
  const captured: CapturedDayTemplates = {};
  if (parts.schedule || parts.crew) {
    // An act's soundcheck/set blocks belong to one day's lineup, not the group.
    const blocks = withinCap(
      await ctx.db
        .query("eventScheduleBlocks")
        .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", day._id))
        .take(MAX_DAY_ROWS + 1),
      "Run of Show blocks",
    ).filter((block) => !isActBlock(block));
    const blockTemplates = blocksToTemplates(blocks, day.startAt);
    captured.blockTemplates = blockTemplates;
    if (parts.crew) {
      const shifts = withinCap(
        await ctx.db
          .query("eventCrewShifts")
          .withIndex("by_eventId", (q) => q.eq("eventId", day._id))
          .take(MAX_DAY_ROWS + 1),
        "crew shifts",
      );
      captured.shiftTemplates = shiftsToTemplates(shifts, blocks, blockTemplates, day.startAt, {
        copyingDay: true,
      });
    }
  }
  if (parts.positions) {
    const slots = withinCap(
      await ctx.db
        .query("eventArtistNeeds")
        .withIndex("by_eventId", (q) => q.eq("eventId", day._id))
        .take(MAX_OCCURRENCE_POSITIONS + 1),
      "positions",
      MAX_OCCURRENCE_POSITIONS,
    );
    const seenKeys = new Set<string>();
    const templates: EventSeriesPositionTemplate[] = [];
    const ordered = slots
      .slice()
      .sort(
        (a, b) =>
          (a.sortOrder ?? a.createdAt) - (b.sortOrder ?? b.createdAt) || a.createdAt - b.createdAt,
      );
    for (const slot of ordered) {
      // A duplicated key (hand-copied row) becomes its own template.
      const template = positionTemplateFromSlot(
        slot.templateKey && seenKeys.has(slot.templateKey)
          ? { ...slot, templateKey: undefined }
          : slot,
        day.startAt,
        (timeMs) => pacificDayIndexFromAnchor(day.startAt, timeMs),
      );
      seenKeys.add(template.templateKey);
      templates.push(template);
      if (slot.templateKey !== template.templateKey) {
        await ctx.db.patch(slot._id, { templateKey: template.templateKey, updatedAt: now });
      }
    }
    captured.positionTemplates = templates;
  }
  return captured;
}

/**
 * What "apply this day's setup" actually does for one source day. A part the
 * day has nothing for is skipped, never used to wipe the other days (no Run of
 * Show yet must not clear their crew slots), and shifts outside any section
 * aren't part of the section template: they copy across on their own and never
 * switch the template parts on.
 */
export function planDaySetup(args: {
  wantSchedule: boolean;
  wantPositions: boolean;
  wantPullList: boolean;
  captured: CapturedDayTemplates;
  hasUnlinkedShifts: boolean;
  pullListRows: number;
}) {
  const hasTemplateSchedule =
    (args.captured.blockTemplates?.length ?? 0) > 0 ||
    (args.captured.shiftTemplates?.length ?? 0) > 0;
  const parts: GroupTemplateParts = {
    schedule: args.wantSchedule && hasTemplateSchedule,
    crew: args.wantSchedule && hasTemplateSchedule,
    positions: args.wantPositions && (args.captured.positionTemplates?.length ?? 0) > 0,
  };
  const copyUnlinkedShifts = args.wantSchedule && args.hasUnlinkedShifts;
  const copyPullList = args.wantPullList && args.pullListRows > 0;
  return {
    parts,
    copyUnlinkedShifts,
    copyPullList,
    nothingToApply: !parts.schedule && !parts.positions && !copyUnlinkedShifts && !copyPullList,
  };
}

/**
 * Replace a day's pull list with another day's (quantities to pull reset, so
 * each day tracks its own pull progress). Pull lists are per day, not a group
 * template: equipment differs by day far more often than the schedule does.
 */
export async function copyPullListBetweenDays(
  ctx: MutationCtx,
  sourceItems: readonly Doc<"eventPullListItems">[],
  targetEventId: Id<"events">,
  now: number,
) {
  const existing = await ctx.db
    .query("eventPullListItems")
    .withIndex("by_eventId", (q) => q.eq("eventId", targetEventId))
    .take(500);
  for (const row of existing) {
    await ctx.db.delete(row._id);
  }
  for (const item of sourceItems) {
    await ctx.db.insert("eventPullListItems", {
      eventId: targetEventId,
      lineKind: item.lineKind,
      typeId: item.typeId,
      packageId: item.packageId,
      label: item.label,
      quantityRequired: item.quantityRequired,
      // Each day tracks its own pull and checkout progress.
      quantityPulled: 0,
      quantityCheckedOut: 0,
      source: item.source,
      sourcePackageId: item.sourcePackageId,
      sourceInvoiceLineKey: item.sourceInvoiceLineKey,
      excludedTypeIds: item.excludedTypeIds,
      sortOrder: item.sortOrder,
      notes: item.notes,
      createdAt: now,
      updatedAt: now,
    });
  }
}

type ShiftRow = Pick<
  Doc<"eventCrewShifts">,
  "_id" | "role" | "startsAt" | "endsAt" | "scheduleBlockId" | "userId" | "crewApplicationId"
>;

/**
 * Plan copying one day's shifts that sit outside any Run of Show section onto
 * another day, as open slots. Idempotent: the target's own open unsectioned
 * shifts (an earlier copy, or hand-added) are replaced rather than added to,
 * and a slot a staffed shift already fills (same role and times) isn't opened
 * again. Trainees (applicants shadowing one day) are never part of it.
 */
export function planUnlinkedShiftCopy<S extends ShiftRow>(
  sourceShifts: readonly S[],
  targetShifts: readonly ShiftRow[],
  deltaMs: number,
) {
  const isUnlinkedSlot = (shift: ShiftRow) => !shift.scheduleBlockId && !isTraineeShift(shift);
  const staffed = targetShifts.filter((shift) => Boolean(shift.userId?.trim()));
  const deleteIds = targetShifts
    .filter((shift) => isUnlinkedSlot(shift) && !shift.userId?.trim())
    .map((shift) => shift._id);
  const inserts: Array<{ source: S; startsAt: number; endsAt: number }> = [];
  for (const shift of sourceShifts) {
    if (!isUnlinkedSlot(shift)) continue;
    const startsAt = shift.startsAt + deltaMs;
    const endsAt = shift.endsAt + deltaMs;
    const filled = staffed.findIndex(
      (row) => row.role === shift.role && row.startsAt === startsAt && row.endsAt === endsAt,
    );
    if (filled >= 0) {
      staffed.splice(filled, 1);
      continue;
    }
    inserts.push({ source: shift, startsAt, endsAt });
  }
  return { deleteIds, inserts };
}

/**
 * Crew shifts not tied to a Run of Show section (e.g. a load-in call) aren't
 * part of the section-based crew template; copying a day carries them across
 * as open slots, at the same offset from the day's start (see
 * `planUnlinkedShiftCopy`).
 */
export async function copyUnlinkedShiftsBetweenDays(
  ctx: MutationCtx,
  source: Pick<Doc<"events">, "_id" | "startAt">,
  target: Pick<Doc<"events">, "_id" | "startAt">,
  now: number,
) {
  const [sourceShifts, targetShifts] = await Promise.all([
    ctx.db
      .query("eventCrewShifts")
      .withIndex("by_eventId", (q) => q.eq("eventId", source._id))
      .take(500),
    ctx.db
      .query("eventCrewShifts")
      .withIndex("by_eventId", (q) => q.eq("eventId", target._id))
      .take(500),
  ]);
  const plan = planUnlinkedShiftCopy(sourceShifts, targetShifts, target.startAt - source.startAt);
  for (const id of plan.deleteIds) {
    await ctx.db.delete(id);
  }
  for (const { source: shift, startsAt, endsAt } of plan.inserts) {
    await ctx.db.insert("eventCrewShifts", {
      eventId: target._id,
      role: shift.role,
      startsAt,
      endsAt,
      hours: shift.hours,
      timesOverridden: shift.timesOverridden === true ? true : undefined,
      estimatedHourlyRateUsd: shift.estimatedHourlyRateUsd,
      postedToExpense: false,
      notes: shift.notes,
      createdAt: now,
      updatedAt: now,
    });
  }
}
