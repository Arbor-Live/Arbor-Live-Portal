import { describe, expect, it } from "vitest";
import { computeShiftStats, isTraineeShift } from "./crewShiftKinds";

describe("crew shift kinds", () => {
  it("trainees are not staffing slots", () => {
    const trainee = { crewApplicationId: "app1" };
    expect(isTraineeShift(trainee)).toBe(true);
    expect(computeShiftStats([{ userId: "u1" }, trainee])).toEqual({
      totalShifts: 1,
      filledShifts: 1,
      unfilledShifts: 0,
      isCrewConfirmed: true,
    });
  });

  it("an event with no slots isn't fully staffed", () => {
    expect(computeShiftStats([{ crewApplicationId: "app1" }]).isCrewConfirmed).toBe(false);
  });
});
