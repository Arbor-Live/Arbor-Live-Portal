import { describe, expect, it } from "vitest";
import { crewHoursBand } from "./crewHourThresholds";

describe("crewHoursBand", () => {
  it("puts the boundaries in the higher band they reach", () => {
    expect(crewHoursBand(0)).toBe("below_minimum");
    expect(crewHoursBand(19.99)).toBe("below_minimum");
    expect(crewHoursBand(20)).toBe("meets_minimum");
    expect(crewHoursBand(50)).toBe("meets_minimum");
    expect(crewHoursBand(50.01)).toBe("above_expected");
  });
});
