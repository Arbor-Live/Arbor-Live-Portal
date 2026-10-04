import { describe, expect, it } from "vitest";
import { grantedDate, grantedFilingFields, grantedSummaryDescription, type GrantedFilingPayout } from "./granted-filing";

// Sep 25, 2026, 6pm Pacific (Sep 26 in UTC).
const EVENT_START = Date.UTC(2026, 8, 26, 1, 0);

const dj: GrantedFilingPayout = {
  confirmationToken: "ALBPAY-TPU9HW4",
  designatedPayeeName: "Pat Doe",
  designatedPayeeEmail: "pat@stanford.edu",
  designatedPayeePayoutMethod: "delivery",
  bandName: "Pat Doe",
  artistType: "dj",
  performanceHours: 2,
  eventTitle: "NSO Barbeque",
  eventStartAt: EVENT_START,
  venueName: "White Plaza > Governor's Corner",
  totalUsd: 300,
  confirmedAt: Date.UTC(2026, 8, 28, 19, 0),
};

describe("granted filing", () => {
  it("formats dates the way GrantED does, in Pacific time", () => {
    expect(grantedDate(EVENT_START)).toBe("25-SEP-2026");
  });

  it("writes a summary like the ones staff type", () => {
    expect(grantedSummaryDescription(dj)).toBe(
      "Pat Doe performed a 2-hr DJ set for NSO Barbeque at Governor's Corner on Sep 25, 2026.",
    );
    expect(
      grantedSummaryDescription({ ...dj, artistType: "band", bandName: "MONARCH", performanceHours: 1.5 }),
    ).toBe(`Pat Doe's band "MONARCH" performed a 1.5-hr set for NSO Barbeque at Governor's Corner on Sep 25, 2026.`);
    expect(grantedSummaryDescription({ ...dj, performanceHours: undefined, venueName: undefined })).toBe(
      "Pat Doe performed a DJ set for NSO Barbeque on Sep 25, 2026.",
    );
  });

  it("puts the payout ID in the line description, which the statement shows", () => {
    const fields = Object.fromEntries(grantedFilingFields(dj).map((f) => [f.label, f.value]));
    expect(fields).toMatchObject({
      Vendor: "Pat Doe",
      "Service start date": "25-SEP-2026",
      "Delivery method": "Mail",
      "Service provided": "DJ Set",
      "Service location": "Governor's Corner",
      "Line document date": "28-SEP-2026",
      "Line description": "Electronic Agreement ALBPAY-TPU9HW4",
      "Line amount": "300.00",
    });
  });
});
