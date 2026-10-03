/**
 * Crew shift kinds.
 *
 * - Staffing slot: a position the event needs filled. Open when no one is on it.
 * - Trainee shift: a crew applicant shadowing the event. It is extra, never
 *   fills a slot, never costs anything, and never bills the host.
 */
type ShiftLike = {
  userId?: string;
  crewApplicationId?: unknown;
};

export function isTraineeShift(shift: ShiftLike) {
  return Boolean(shift.crewApplicationId) && !shift.userId?.trim();
}

export function isShiftFilled(shift: ShiftLike) {
  return Boolean(shift.userId?.trim());
}

/** Staffing slots only (trainee shifts excluded). */
export function staffingSlots<T extends ShiftLike>(shifts: T[]) {
  return shifts.filter((shift) => !isTraineeShift(shift));
}

/**
 * "Fully staffed" when every staffing slot has someone, none of them is a
 * backup, and there is at least one slot. A slot held by a backup (answered
 * "only if necessary") counts as filled but keeps the event needing crew, so
 * it stays on the list until someone who can actually work it turns up.
 */
export function computeShiftStats(shifts: ShiftLike[], backupUserIds?: ReadonlySet<string>) {
  const slots = staffingSlots(shifts);
  const totalShifts = slots.length;
  const filled = slots.filter(isShiftFilled);
  const filledShifts = filled.length;
  const backupShifts = backupUserIds
    ? filled.filter((shift) => backupUserIds.has(shift.userId?.trim() ?? "")).length
    : 0;
  const isCrewConfirmed = totalShifts > 0 && filledShifts === totalShifts && backupShifts === 0;
  return {
    totalShifts,
    filledShifts,
    unfilledShifts: totalShifts - filledShifts,
    backupShifts,
    isCrewConfirmed,
  };
}
