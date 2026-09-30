import { describe, expect, it } from "vitest";
import { isActiveFilter, matchesListFilter } from "./listFilters";

describe("matchesListFilter", () => {
  it("treats a missing or empty chip as no filter", () => {
    expect(isActiveFilter(undefined)).toBe(false);
    expect(isActiveFilter({ operator: "is", values: [] })).toBe(false);
    expect(matchesListFilter(undefined, ["a"])).toBe(true);
    expect(matchesListFilter({ operator: "is_not", values: [] }, ["a"])).toBe(true);
  });

  it("is matches any value; is not matches none", () => {
    expect(matchesListFilter({ operator: "is", values: ["a", "b"] }, ["b"])).toBe(true);
    expect(matchesListFilter({ operator: "is", values: ["a", "b"] }, ["c"])).toBe(false);
    expect(matchesListFilter({ operator: "is_not", values: ["a", "b"] }, ["c"])).toBe(true);
    expect(matchesListFilter({ operator: "is_not", values: ["a", "b"] }, ["c", "a"])).toBe(false);
  });
});
