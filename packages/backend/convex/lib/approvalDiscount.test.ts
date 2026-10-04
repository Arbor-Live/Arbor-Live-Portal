import { describe, expect, it } from "vitest";
import { matchDiscountToApproval } from "./approvalDiscount";

describe("matchDiscountToApproval", () => {
  it("lowers an existing discount when crew came in cheaper (greedy-cricket-158)", () => {
    // Approved at $1,000 − $40 = $960. Crew dropped $20, so the subtotal is $980.
    expect(
      matchDiscountToApproval({ subtotalUsd: 980, discountAmountUsd: 40, approvedTotalUsd: 960 }),
    ).toEqual({ kind: "lower", fromUsd: 40, toUsd: 20, totalUsd: 960, reachesApproved: true });
  });

  it("clamps at zero when the drop is bigger than the discount", () => {
    expect(
      matchDiscountToApproval({ subtotalUsd: 900, discountAmountUsd: 40, approvedTotalUsd: 960 }),
    ).toEqual({ kind: "lower", fromUsd: 40, toUsd: 0, totalUsd: 900, reachesApproved: false });
  });

  it("removes the discount exactly when the drop equals it", () => {
    expect(
      matchDiscountToApproval({ subtotalUsd: 960, discountAmountUsd: 40, approvedTotalUsd: 960 }),
    ).toEqual({ kind: "lower", fromUsd: 40, toUsd: 0, totalUsd: 960, reachesApproved: true });
  });

  it("has nothing to lower without a discount", () => {
    expect(matchDiscountToApproval({ subtotalUsd: 900, discountAmountUsd: 0, approvedTotalUsd: 960 })).toBeNull();
  });

  it("is null when the total already matches", () => {
    expect(matchDiscountToApproval({ subtotalUsd: 1000, discountAmountUsd: 40, approvedTotalUsd: 960 })).toBeNull();
    expect(
      matchDiscountToApproval({ subtotalUsd: 1000, discountAmountUsd: 40, approvedTotalUsd: 960.004 }),
    ).toBeNull();
  });

  it("only grows the discount on the explicit raise path, when the total went up", () => {
    expect(
      matchDiscountToApproval({ subtotalUsd: 1100, discountAmountUsd: 40, approvedTotalUsd: 960 }),
    ).toEqual({ kind: "raise", fromUsd: 40, toUsd: 140, totalUsd: 960, reachesApproved: true });
  });

  it("never lowers to more than the current discount", () => {
    const match = matchDiscountToApproval({ subtotalUsd: 999.99, discountAmountUsd: 40, approvedTotalUsd: 960 });
    expect(match?.kind).toBe("lower");
    expect(match!.toUsd).toBeLessThanOrEqual(40);
    expect(match).toMatchObject({ toUsd: 39.99, totalUsd: 960 });
  });

  it("handles a discount larger than the subtotal (total floored at zero)", () => {
    // Subtotal $30 with a $40 discount bills $0; approved was $10.
    expect(matchDiscountToApproval({ subtotalUsd: 30, discountAmountUsd: 40, approvedTotalUsd: 10 })).toEqual({
      kind: "lower",
      fromUsd: 40,
      toUsd: 20,
      totalUsd: 10,
      reachesApproved: true,
    });
  });

  it("rounds to cents", () => {
    expect(
      matchDiscountToApproval({ subtotalUsd: 980.004, discountAmountUsd: 40.001, approvedTotalUsd: 959.996 }),
    ).toEqual({ kind: "lower", fromUsd: 40, toUsd: 20, totalUsd: 960, reachesApproved: true });
  });
});
