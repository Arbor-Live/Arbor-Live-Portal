import { describe, expect, it } from "vitest";
import { recordCascadeRows } from "./bookingChainDelete";

describe("recordCascadeRows", () => {
  it("counts every relation against one budget", () => {
    const budget = { total: 0 };
    recordCascadeRows(budget, 3000);
    recordCascadeRows(budget, 2000);
    expect(budget.total).toBe(5000);
    expect(() => recordCascadeRows(budget, 1)).toThrow(
      /Cascade exceeded 5000 rows \(got 5001\)/,
    );
  });

  it("allows a cascade that lands exactly on the limit", () => {
    const budget = { total: 0 };
    recordCascadeRows(budget, 5000);
    expect(budget.total).toBe(5000);
  });
});
