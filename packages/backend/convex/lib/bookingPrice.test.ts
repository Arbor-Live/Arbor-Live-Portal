import { describe, expect, it } from "vitest";
import {
  artistLineBillsPrice,
  artistLineFieldsFromPrice,
  bookingPriceFromLine,
  bookingPriceFromPayout,
  bookingPriceFromProfile,
  decideBookingPriceBackfill,
  eventArtistCostUsd,
  normalizeBookingPrice,
  payoutFieldsFromPrice,
} from "./bookingPrice";

const fivePeopleAt90 = normalizeBookingPrice({
  pricingMode: "per_member_hourly",
  memberCount: 5,
  performanceHours: 1,
  ratePerMemberPerHourUsd: 90,
});

describe("normalizeBookingPrice", () => {
  it("computes the total from people × hours × rate", () => {
    expect(fivePeopleAt90).toEqual({
      pricingMode: "per_member_hourly",
      memberCount: 5,
      performanceHours: 1,
      ratePerMemberPerHourUsd: 90,
      totalUsd: 450,
    });
  });

  it("keeps only the total for a fixed price, never below zero", () => {
    expect(normalizeBookingPrice({ pricingMode: "fixed_total", totalUsd: -5, memberCount: 3 })).toEqual({
      pricingMode: "fixed_total",
      totalUsd: 0,
    });
  });
});

describe("quote line ↔ price", () => {
  it("reads people × hours × rate from a line with its split", () => {
    expect(
      bookingPriceFromLine({ quantity: 8, rateUsd: 50, amountUsd: 400, memberCount: 4, performanceHours: 2 }),
    ).toMatchObject({ pricingMode: "per_member_hourly", memberCount: 4, performanceHours: 2, totalUsd: 400 });
  });

  it("reads the amount as a fixed total without a split", () => {
    expect(bookingPriceFromLine({ quantity: 1, rateUsd: 300, amountUsd: 300 })).toEqual({
      pricingMode: "fixed_total",
      totalUsd: 300,
    });
  });

  it("reads a line whose split doesn't add up to what it bills as a fixed total", () => {
    expect(
      bookingPriceFromLine({ quantity: 5, rateUsd: 90, amountUsd: 450, memberCount: 6, performanceHours: 1 }),
    ).toEqual({ pricingMode: "fixed_total", totalUsd: 450 });
  });

  it("round-trips through the line fields", () => {
    const fixed = normalizeBookingPrice({ pricingMode: "fixed_total", totalUsd: 750 });
    for (const price of [fivePeopleAt90, fixed]) {
      const line = artistLineFieldsFromPrice(price);
      expect(bookingPriceFromLine(line)).toEqual(price);
      expect(artistLineBillsPrice(line, price)).toBe(true);
    }
    expect(artistLineBillsPrice(artistLineFieldsFromPrice(fivePeopleAt90), fixed)).toBe(false);
  });
});

describe("payout ↔ price", () => {
  it("clears the split on a fixed payout", () => {
    expect(payoutFieldsFromPrice(normalizeBookingPrice({ pricingMode: "fixed_total", totalUsd: 200 }))).toEqual({
      pricingMode: "fixed_total",
      totalUsd: 200,
      memberCount: undefined,
      performanceHours: undefined,
      ratePerMemberPerHourUsd: undefined,
    });
  });

  it("keeps the agreed total when a payout's split doesn't add up to it", () => {
    expect(
      bookingPriceFromPayout({
        pricingMode: "per_member_hourly",
        memberCount: 6,
        performanceHours: 1,
        ratePerMemberPerHourUsd: 150,
        totalUsd: 800,
      }),
    ).toEqual({ pricingMode: "fixed_total", totalUsd: 800 });
  });
});

describe("bookingPriceFromProfile", () => {
  it("prices members × set length × the profile rate", () => {
    expect(
      bookingPriceFromProfile({
        performerHourlyRateUsd: 100,
        bandMemberCount: 3,
        setStartsAt: 0,
        setEndsAt: 90 * 60_000,
      }),
    ).toMatchObject({ memberCount: 3, performanceHours: 1.5, totalUsd: 450 });
  });

  it("is nothing without a rate, and one person for one hour by default", () => {
    expect(bookingPriceFromProfile({ bandMemberCount: 4 })).toBeUndefined();
    expect(bookingPriceFromProfile({ performerHourlyRateUsd: 80, bandMemberCount: 0 })).toMatchObject({
      memberCount: 1,
      performanceHours: 1,
      totalUsd: 80,
    });
  });
});

describe("eventArtistCostUsd", () => {
  it("counts payouts, and booking prices where no payout exists yet", () => {
    expect(
      eventArtistCostUsd({
        payouts: [
          { organizationId: "paid-act", status: "paid", totalUsd: 300 },
          { organizationId: "booked-act", status: "draft", totalUsd: 450 },
          { organizationId: "removed-act", status: "cancelled", totalUsd: 999 },
        ],
        positions: [
          { seatedOrganizationId: "booked-act", price: fivePeopleAt90 },
          // A removed payout means Arbor doesn't pay this act.
          { seatedOrganizationId: "removed-act", price: fivePeopleAt90 },
          // Booked, priced, no payout yet; and an open position the quote prices.
          { seatedOrganizationId: "unpaid-act", price: fivePeopleAt90 },
          { price: normalizeBookingPrice({ pricingMode: "fixed_total", totalUsd: 100 }) },
          { seatedOrganizationId: "free-act" },
        ],
      }),
    ).toBe(300 + 450 + 450 + 100);
  });
});

describe("decideBookingPriceBackfill", () => {
  const payout = (id: string, status: string, totalUsd: number) => ({
    id,
    status,
    pricingMode: "per_member_hourly" as const,
    memberCount: 6,
    performanceHours: 1,
    ratePerMemberPerHourUsd: totalUsd / 6,
    totalUsd,
  });
  const line = { quantity: 5, rateUsd: 90, amountUsd: 450, memberCount: 5, performanceHours: 1 };

  it("takes the quote line and moves unpaid payouts to it (the $450 vs $900 incident)", () => {
    expect(decideBookingPriceBackfill({ line, payouts: [payout("p1", "draft", 900)] })).toEqual({
      price: fivePeopleAt90,
      source: "invoice_line",
      payoutIdsToUpdate: ["p1"],
    });
  });

  it("never touches paid or cancelled payouts", () => {
    const decision = decideBookingPriceBackfill({
      line,
      payouts: [payout("paid", "paid", 900), payout("gone", "cancelled", 900)],
    });
    expect(decision?.payoutIdsToUpdate).toEqual([]);
  });

  it("leaves a payout that already pays the line alone", () => {
    const matching = { id: "p1", status: "confirmed", ...payoutFieldsFromPrice(fivePeopleAt90) };
    expect(decideBookingPriceBackfill({ line, payouts: [matching] })?.payoutIdsToUpdate).toEqual([]);
  });

  it("falls back to the act's live payout without a line", () => {
    expect(
      decideBookingPriceBackfill({ line: null, payouts: [payout("gone", "cancelled", 50), payout("p1", "paid", 600)] }),
    ).toEqual({
      price: { pricingMode: "per_member_hourly", memberCount: 6, performanceHours: 1, ratePerMemberPerHourUsd: 100, totalUsd: 600 },
      source: "payout",
      payoutIdsToUpdate: [],
    });
  });

  it("ignores a $0 placeholder line and keeps the payout's price", () => {
    const placeholder = { quantity: 1, rateUsd: 0, amountUsd: 0, memberCount: 1, performanceHours: 1 };
    expect(decideBookingPriceBackfill({ line: placeholder, payouts: [payout("p1", "confirmed", 600)] })).toMatchObject({
      price: { totalUsd: 600 },
      source: "payout",
      payoutIdsToUpdate: [],
    });
  });

  it("decides nothing when neither a line nor a live payout prices the position", () => {
    expect(decideBookingPriceBackfill({ line: null, payouts: [payout("gone", "cancelled", 50)] })).toBeNull();
    expect(decideBookingPriceBackfill({ line: null, payouts: [] })).toBeNull();
  });
});
