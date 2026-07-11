type ShiftHours = {
  hours: number;
};

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}

export function computeUserDayHours(
  shiftsForUserOnDay: ShiftHours[],
  options: { otPremium?: boolean },
): {
  actualHours: number;
  inputHours: number;
  regularInputHours: number;
  overtimeHours: number;
} {
  const actualHours = roundHours(shiftsForUserOnDay.reduce((sum, shift) => sum + shift.hours, 0));

  if (options.otPremium === true) {
    const regularPortion = Math.min(actualHours, 8);
    const overtimeHours = Math.max(0, actualHours - 8);
    const inputHours = regularPortion * 1.5 + overtimeHours;
    return {
      actualHours,
      inputHours: roundHours(inputHours),
      regularInputHours: roundHours(regularPortion * 1.5),
      overtimeHours: roundHours(overtimeHours),
    };
  }

  return {
    actualHours,
    inputHours: actualHours,
    regularInputHours: roundHours(Math.min(actualHours, 8)),
    overtimeHours: roundHours(Math.max(0, actualHours - 8)),
  };
}
