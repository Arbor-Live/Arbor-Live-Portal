import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { syncEventCrewCostUsd } from "./crewCost";
import {
  applyPositionTemplates,
  replaceEmptyShiftsFromTemplates,
  replaceScheduleBlocksFromTemplates,
  resolveDefaultCrewHourlyRateUsd,
  shouldApplySeriesUpdate,
  type EventSeriesBlockTemplate,
  type EventSeriesShiftTemplate,
  type SeriesEditScope,
} from "./eventSeriesGeneration";
import type { EventSeriesPositionTemplate } from "./eventSeriesPositions";

/**
 * One apply path for a group's templates: Run of Show sections, crew slots and
 * positions, each relative to a target day's start. Series (recurring) and
 * multi-day groups both feed it a list of target days and the templates to
 * stamp onto them.
 */

export type GroupTemplateTarget = {
  eventId: Id<"events">;
  /** Each template is offset from this day's start. */
  startAt: number;
};

export type GroupTemplateSet = {
  blockTemplates?: EventSeriesBlockTemplate[];
  shiftTemplates?: EventSeriesShiftTemplate[];
  positionTemplates?: EventSeriesPositionTemplate[];
};

/** Resolve the group's occurrences a scope (all / this / future) applies to. */
export function groupTemplateTargets(
  occurrences: readonly Doc<"events">[],
  scope: SeriesEditScope,
  fromOccurrenceIndex: number,
  now: number,
): GroupTemplateTarget[] {
  const targets: GroupTemplateTarget[] = [];
  for (const occurrence of occurrences) {
    if (scope === "this") {
      if (occurrence.occurrenceIndex !== fromOccurrenceIndex) continue;
    } else if (!shouldApplySeriesUpdate(occurrence, scope, fromOccurrenceIndex, now)) {
      continue;
    }
    if (occurrence.seriesDetached || occurrence.status === "cancelled") continue;
    targets.push({ eventId: occurrence._id, startAt: occurrence.startAt });
  }
  return targets;
}

/**
 * Stamp the supplied templates onto each target day. Passing only some template
 * sets leaves the others untouched. Returns the number of days updated.
 */
export async function applyGroupTemplates(
  ctx: MutationCtx,
  targets: readonly GroupTemplateTarget[],
  templates: GroupTemplateSet,
  now: number,
): Promise<number> {
  const applyShifts = Boolean(templates.shiftTemplates && templates.shiftTemplates.length > 0);
  const defaultHourlyRateUsd = applyShifts
    ? await resolveDefaultCrewHourlyRateUsd(ctx)
    : undefined;

  for (const target of targets) {
    if (templates.blockTemplates) {
      await replaceScheduleBlocksFromTemplates(
        ctx,
        target.eventId,
        target.startAt,
        templates.blockTemplates,
        now,
      );
    }
    if (applyShifts) {
      await replaceEmptyShiftsFromTemplates(
        ctx,
        target.eventId,
        target.startAt,
        templates.shiftTemplates,
        templates.blockTemplates,
        defaultHourlyRateUsd,
        now,
      );
      await syncEventCrewCostUsd(ctx, target.eventId, now);
    }
    if (templates.positionTemplates) {
      await applyPositionTemplates(
        ctx,
        target.eventId,
        target.startAt,
        templates.positionTemplates,
        now,
      );
    }
  }

  return targets.length;
}
