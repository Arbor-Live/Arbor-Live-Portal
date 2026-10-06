import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { isTraineeShift } from "./crewShiftKinds";
import { normalizeEventStatus } from "./eventStatus";

/** A trainee is on a handful of events at most; past this, the rest are ignored. */
const TRAINEE_SHIFT_TAKE = 50;

/**
 * When a trainee's training is over: the end of their last trainee shift on an
 * event that wasn't cancelled. Undefined when they have no such shift (assigned
 * nowhere yet, or every training event was cancelled), so they stay "Trainee".
 */
export async function loadTrainingEndsAt(
  ctx: QueryCtx,
  applicationId: Id<"crewApplications">,
): Promise<number | undefined> {
  const shifts = (
    await ctx.db
      .query("eventCrewShifts")
      .withIndex("by_crewApplicationId", (q) => q.eq("crewApplicationId", applicationId))
      .take(TRAINEE_SHIFT_TAKE)
  ).filter(isTraineeShift);

  let endsAt: number | undefined;
  const cancelledByEventId = new Map<Id<"events">, boolean>();
  for (const shift of shifts) {
    let cancelled = cancelledByEventId.get(shift.eventId);
    if (cancelled === undefined) {
      const event = await ctx.db.get(shift.eventId);
      cancelled = !event || normalizeEventStatus(event.status) === "cancelled";
      cancelledByEventId.set(shift.eventId, cancelled);
    }
    if (cancelled) continue;
    endsAt = Math.max(endsAt ?? shift.endsAt, shift.endsAt);
  }
  return endsAt;
}

/** Training is over and nobody has added them as a member or turned them away. */
export function isTraineeDecisionNeeded(
  application: { status: string },
  trainingEndsAt: number | undefined,
  now: number,
): boolean {
  return application.status === "trainee" && trainingEndsAt !== undefined && trainingEndsAt <= now;
}
