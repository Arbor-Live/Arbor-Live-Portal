/**
 * Crew shift kinds (mirrors `packages/backend/convex/lib/crewShiftKinds.ts`).
 *
 * - Staffing slot: a position the event needs filled. Open when no one is on it.
 * - Trainee shift: a crew applicant shadowing the event. It is extra, never
 *   fills a slot, never costs anything, and never bills the host.
 */
type ShiftLike = {
  userId?: string;
  crewApplicationId?: string;
};

export function isTraineeShift(shift: ShiftLike) {
  return Boolean(shift.crewApplicationId) && !shift.userId?.trim();
}

/** A staffing slot with nobody on it. */
export function isOpenSlot(shift: ShiftLike) {
  return !shift.userId?.trim() && !shift.crewApplicationId;
}

export function staffingSlots<T extends ShiftLike>(shifts: T[]) {
  return shifts.filter((shift) => !isTraineeShift(shift));
}

export function countStaffing(shifts: ShiftLike[]) {
  const slots = staffingSlots(shifts);
  const filled = slots.filter((shift) => !isOpenSlot(shift)).length;
  return { slots: slots.length, filled, open: slots.length - filled };
}
