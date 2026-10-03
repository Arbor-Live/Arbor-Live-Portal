import { describe, expect, it } from "vitest";
import { payoutPricingFromLine } from "./bandPayments";

describe("payoutPricingFromLine", () => {
  it("pays per person per hour when the line has its split", () => {
    expect(payoutPricingFromLine({ rateUsd: 50, amountUsd: 400, memberCount: 4, performanceHours: 2 })).toEqual({
      pricingMode: "per_member_hourly",
      ratePerMemberPerHourUsd: 50,
      memberCount: 4,
      performanceHours: 2,
    });
  });

  it("pays the line's amount without a split", () => {
    expect(payoutPricingFromLine({ rateUsd: 300, amountUsd: 300 })).toEqual({
      pricingMode: "fixed_total",
      totalUsd: 300,
    });
  });
});
