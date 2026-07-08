import { describe, expect, it } from "vitest";
import { computeUserDayHours } from "./stanfordHours";

describe("computeUserDayHours", () => {
  it("returns 1:1 input hours when otPremium is off", () => {
    const result = computeUserDayHours([{ hours: 6 }], { otPremium: false });
    expect(result.actualHours).toBe(6);
    expect(result.inputHours).toBe(6);
    expect(result.overtimeHours).toBe(0);
  });

  it("applies 1.5× inflation for hours up to 8 when otPremium is on", () => {
    const result = computeUserDayHours([{ hours: 6 }], { otPremium: true });
    expect(result.actualHours).toBe(6);
    expect(result.inputHours).toBe(9);
  });

  it("handles exactly 8 hours with otPremium", () => {
    const result = computeUserDayHours([{ hours: 8 }], { otPremium: true });
    expect(result.actualHours).toBe(8);
    expect(result.inputHours).toBe(12);
    expect(result.overtimeHours).toBe(0);
  });

  it("counts hours beyond 8 at 1:1 input when otPremium is on", () => {
    const result = computeUserDayHours([{ hours: 10 }], { otPremium: true });
    expect(result.actualHours).toBe(10);
    expect(result.inputHours).toBe(14);
    expect(result.overtimeHours).toBe(2);
  });

  it("sums multiple shifts on the same day", () => {
    const result = computeUserDayHours([{ hours: 4 }, { hours: 3 }], { otPremium: false });
    expect(result.actualHours).toBe(7);
    expect(result.inputHours).toBe(7);
  });
});
