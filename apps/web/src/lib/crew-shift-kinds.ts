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

/**
 * Slot counts. `backup` is filled slots held by someone who answered "only if
 * necessary": they count as filled, but the event still needs crew.
 */
export function countStaffing(shifts: ShiftLike[], backupUserIds?: ReadonlySet<string>) {
  const slots = staffingSlots(shifts);
  const filledSlots = slots.filter((shift) => !isOpenSlot(shift));
  const backup = backupUserIds
    ? filledSlots.filter((shift) => backupUserIds.has(shift.userId?.trim() ?? "")).length
    : 0;
  return {
    slots: slots.length,
    filled: filledSlots.length,
    open: slots.length - filledSlots.length,
    backup,
  };
}
