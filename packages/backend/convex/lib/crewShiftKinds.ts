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

/** "Fully staffed" when every staffing slot has someone and there is at least one slot. */
export function computeShiftStats(shifts: ShiftLike[]) {
  const slots = staffingSlots(shifts);
  const totalShifts = slots.length;
  const filledShifts = slots.filter(isShiftFilled).length;
  const isCrewConfirmed = totalShifts > 0 && filledShifts === totalShifts;
  return {
    totalShifts,
    filledShifts,
    unfilledShifts: totalShifts - filledShifts,
    isCrewConfirmed,
  };
}
