import { describe, expect, it } from "vitest";
import { activeFilters, matchesFilter } from "./filter-state";

describe("matchesFilter", () => {
  it("passes everything when the chip is missing or has no values yet", () => {
    expect(matchesFilter(undefined, "a")).toBe(true);
    expect(matchesFilter({ operator: "is", values: [] }, "a")).toBe(true);
    expect(matchesFilter({ operator: "is_not", values: [] }, "a")).toBe(true);
  });

  it("is: any of the values", () => {
    const filter = { operator: "is" as const, values: ["sound", "lighting"] };
    expect(matchesFilter(filter, "sound")).toBe(true);
    expect(matchesFilter(filter, "misc")).toBe(false);
  });

  it("is not: none of the values", () => {
    const filter = { operator: "is_not" as const, values: ["sound", "lighting"] };
    expect(matchesFilter(filter, "misc")).toBe(true);
    expect(matchesFilter(filter, "lighting")).toBe(false);
  });

  it("matches multi-valued rows (tags) on any overlap", () => {
    expect(matchesFilter({ operator: "is", values: ["dmx"] }, ["ip65", "dmx"])).toBe(true);
    expect(matchesFilter({ operator: "is_not", values: ["dmx"] }, ["ip65", "dmx"])).toBe(false);
    expect(matchesFilter({ operator: "is", values: ["dmx"] }, [])).toBe(false);
    expect(matchesFilter({ operator: "is_not", values: ["dmx"] }, [])).toBe(true);
  });
});

describe("activeFilters", () => {
  it("drops chips that are still being set up", () => {
    expect(
      activeFilters({
        category: { operator: "is", values: ["sound"] },
        units: { operator: "is", values: [] },
      }),
    ).toEqual({ category: { operator: "is", values: ["sound"] } });
  });
});
