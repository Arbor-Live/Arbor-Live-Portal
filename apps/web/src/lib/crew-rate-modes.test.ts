import { describe, expect, it } from "vitest";
import {
  crewRateMode,
  crewRateRoles,
  effectiveRate,
  formatHourly,
  hasNoRate,
  parseRateInput,
  summarizeCrewRates,
  type CrewRateRow,
} from "./crew-rate-modes";

function row(overrides: Partial<CrewRateRow>): CrewRateRow {
  return {
    id: "u1",
    name: "Ada",
    email: "ada@example.com",
    role: "user",
    rateMode: "custom",
    customHourlyRateUsd: 20,
    hourlyRateUsd: 20,
    payrollMethod: "stanford",
    ...overrides,
  };
}

describe("crew rates", () => {
  it("treats a person with no rate row as Custom", () => {
    expect(crewRateMode(row({ rateMode: null }))).toBe("custom");
    expect(crewRateMode(row({ rateMode: "lead" }))).toBe("lead");
  });

  it("flags a missing or zero rate", () => {
    expect(hasNoRate(row({ hourlyRateUsd: null }))).toBe(true);
    expect(hasNoRate(row({ hourlyRateUsd: 0 }))).toBe(true);
    expect(hasNoRate(row({ hourlyRateUsd: 18 }))).toBe(false);
  });

  it("resolves Normal and Lead against the globals and Custom to its own number", () => {
    const globals = { normal: 18, lead: 22 };
    expect(effectiveRate("normal", globals, 40)).toBe(18);
    expect(effectiveRate("lead", globals, 40)).toBe(22);
    expect(effectiveRate("custom", globals, 40)).toBe(40);
  });

  it("formats hourly rates with cents only when needed", () => {
    expect(formatHourly(18)).toBe("$18/h");
    expect(formatHourly(18.5)).toBe("$18.50/h");
    expect(formatHourly(1200)).toBe("$1,200/h");
  });

  it("splits comma-separated roles and defaults to user", () => {
    expect(crewRateRoles("admin,user")).toEqual(["admin", "user"]);
    expect(crewRateRoles("")).toEqual(["user"]);
  });

  it("parses typed rates, rejecting empty and negative values", () => {
    expect(parseRateInput("18.5")).toBe(18.5);
    expect(parseRateInput("0")).toBe(0);
    expect(parseRateInput("")).toBeNull();
    expect(parseRateInput("-1")).toBeNull();
    expect(parseRateInput("abc")).toBeNull();
  });

  it("counts people, custom rates and missing rates", () => {
    expect(
      summarizeCrewRates([
        row({ id: "a" }),
        row({ id: "b", rateMode: null, hourlyRateUsd: null }),
        row({ id: "c", rateMode: "normal", hourlyRateUsd: 0 }),
        row({ id: "d", rateMode: "lead", hourlyRateUsd: 22 }),
      ]),
    ).toEqual({ people: 4, custom: 2, noRate: 2 });
  });
});
