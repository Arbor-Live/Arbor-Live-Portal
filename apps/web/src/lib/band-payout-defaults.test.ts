import { describe, expect, it } from "vitest";
import { resolvePayoutDefaults } from "./band-payout-defaults";

describe("resolvePayoutDefaults", () => {
  it("prefers the org profile over the invoice line", () => {
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
      source: "band_profile",
      ratePerMemberPerHourUsd: "100",
      performanceHours: "1.5",
      memberCount: "5",
    });
  });

  it("fills gaps from the invoice line", () => {
    const result = resolvePayoutDefaults({
      invoiceLine: {
        organizationId: "org1",
        rateUsd: 200,
        performanceHours: 1.5,
        memberCount: 3,
      },
      bandProfile: {
        organizationId: "org1",
        performerHourlyRateUsd: 0,
        memberCount: 0,
      },
    });
    expect(result).toMatchObject({
      source: "invoice",
      ratePerMemberPerHourUsd: "200",
      performanceHours: "1.5",
      memberCount: "3",
    });
  });

  it("leaves rate and members empty when neither source knows them", () => {
    expect(resolvePayoutDefaults({})).toMatchObject({
      source: "none",
      ratePerMemberPerHourUsd: "",
      memberCount: "",
      performanceHours: "1",
    });
  });
});
