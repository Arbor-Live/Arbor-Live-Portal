import { describe, expect, it } from "vitest";
import { formatUsd } from "@arbor/format";
import { formatCompensationRateLabel } from "./crewCompensation";

const settings = {
  crewNormalRateUsd: 20,
  crewLeadRateUsd: 25,
};

describe("formatCompensationRateLabel", () => {
  it("says the rate is not set when the user has no compensation row", () => {
    expect(formatCompensationRateLabel(null, settings)).toBe("Not set");
    expect(formatCompensationRateLabel(undefined, settings)).toBe("Not set");
  });

  it("resolves Normal and Lead from invoice settings", () => {
    expect(
      formatCompensationRateLabel({ rateMode: "normal", hourlyRateUsd: 0 }, settings),
    ).toBe(`${formatUsd(20)}/hr · Normal`);
    expect(
      formatCompensationRateLabel({ rateMode: "lead", hourlyRateUsd: 0 }, settings),
    ).toBe(`${formatUsd(25)}/hr · Lead`);
  });

  it("uses the stored amount for Custom, including legacy rows without a mode", () => {
    expect(
      formatCompensationRateLabel({ rateMode: "custom", hourlyRateUsd: 18.5 }, settings),
    ).toBe(`${formatUsd(18.5)}/hr · Custom`);
    expect(formatCompensationRateLabel({ hourlyRateUsd: 22 }, settings)).toBe(
      `${formatUsd(22)}/hr · Custom`,
    );
  });
});
