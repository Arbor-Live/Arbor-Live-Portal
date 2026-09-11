import { describe, expect, it } from "vitest";
import { resolvePayoutDefaults } from "./band-payout-defaults";

describe("resolvePayoutDefaults", () => {
  it("prefers invoice line fields", () => {
    const result = resolvePayoutDefaults({
      invoiceLine: {
        organizationId: "org1",
        rateUsd: 200,
        performanceHours: 1.5,
        memberCount: 3,
      },
      bandProfile: {
        organizationId: "org1",
        performerHourlyRateUsd: 100,
        memberCount: 5,
      },
    });
    expect(result).toMatchObject({
      source: "invoice",
      ratePerMemberPerHourUsd: "200",
      performanceHours: "1.5",
      memberCount: "3",
    });
  });

  it("falls back to band profile", () => {
    const result = resolvePayoutDefaults({
      bandProfile: {
        organizationId: "org1",
        performerHourlyRateUsd: 175,
        memberCount: 6,
      },
    });
    expect(result).toMatchObject({
      source: "band_profile",
      ratePerMemberPerHourUsd: "175",
      memberCount: "6",
      performanceHours: "1",
    });
  });

  it("uses hardcoded fallbacks", () => {
    expect(resolvePayoutDefaults({})).toMatchObject({
      source: "fallback",
      ratePerMemberPerHourUsd: "150",
      memberCount: "4",
      performanceHours: "1",
    });
  });
});
