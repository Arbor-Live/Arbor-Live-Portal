import { v, type Infer } from "convex/values";

/**
 * What a booked act costs, stored once on its lineup position
 * (`eventArtistNeeds.price`): people × hours × rate per person per hour, or a
 * fixed total. The quote's artist line bills it and the act's payout pays it,
 * so the two can't drift. Band profile rates are only defaults, copied when an
 * act is booked into a position nothing prices yet.
 *
 * Pure (no Convex context), so it stays out of the schema's import graph and
 * is unit-testable. The writes live in `bookingPriceSync.ts`.
 */
export const bookingPricingModeValue = v.union(
  v.literal("per_member_hourly"),
  v.literal("fixed_total"),
);

export const bookingPriceValue = v.object({
  pricingMode: bookingPricingModeValue,
  /** Per person per hour only. */
  memberCount: v.optional(v.number()),
  performanceHours: v.optional(v.number()),
  ratePerMemberPerHourUsd: v.optional(v.number()),
  /** What the act is paid and billed: people × hours × rate, or the fixed total. */
  totalUsd: v.number(),
});

export type BookingPrice = Infer<typeof bookingPriceValue>;

/** A price as staff type it: the total is recomputed, never trusted. */
export type BookingPriceInput = {
  pricingMode: BookingPrice["pricingMode"];
  memberCount?: number;
  performanceHours?: number;
  ratePerMemberPerHourUsd?: number;
  totalUsd?: number;
};

function money(value: number) {
  return Number(value.toFixed(2));
}

function nonNegative(value: number | undefined) {
  return value !== undefined && Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** The stored shape: per-person prices carry their split, fixed prices only a total. */
export function normalizeBookingPrice(input: BookingPriceInput): BookingPrice {
  if (input.pricingMode === "fixed_total") {
    return { pricingMode: "fixed_total", totalUsd: money(nonNegative(input.totalUsd)) };
  }
  const memberCount = nonNegative(input.memberCount);
  const performanceHours = nonNegative(input.performanceHours);
  const ratePerMemberPerHourUsd = money(nonNegative(input.ratePerMemberPerHourUsd));
  return {
    pricingMode: "per_member_hourly",
    memberCount,
    performanceHours,
    ratePerMemberPerHourUsd,
    totalUsd: money(memberCount * performanceHours * ratePerMemberPerHourUsd),
  };
}

export function sameBookingPrice(a: BookingPrice | undefined, b: BookingPrice | undefined) {
  if (!a || !b) return a === b;
  return (
    a.pricingMode === b.pricingMode &&
    a.totalUsd === b.totalUsd &&
    (a.memberCount ?? null) === (b.memberCount ?? null) &&
    (a.performanceHours ?? null) === (b.performanceHours ?? null) &&
    (a.ratePerMemberPerHourUsd ?? null) === (b.ratePerMemberPerHourUsd ?? null)
  );
}

type ArtistLinePricing = {
  quantity: number;
  rateUsd: number;
  amountUsd: number;
  memberCount?: number;
  performanceHours?: number;
};

/**
 * The price a quote's artist line bills: per person per hour when the line has
 * its people × hours split, else the line's amount as a fixed total.
 */
export function bookingPriceFromLine(line: ArtistLinePricing): BookingPrice {
  if (
    line.memberCount !== undefined &&
    line.memberCount > 0 &&
    line.performanceHours !== undefined &&
    line.performanceHours > 0
  ) {
    return normalizeBookingPrice({
      pricingMode: "per_member_hourly",
      memberCount: line.memberCount,
      performanceHours: line.performanceHours,
      ratePerMemberPerHourUsd: line.rateUsd,
    });
  }
  return normalizeBookingPrice({ pricingMode: "fixed_total", totalUsd: line.amountUsd });
}

/** The artist line fields that bill a price (`quantity` is person-hours). */
export function artistLineFieldsFromPrice(price: BookingPrice): ArtistLinePricing {
  if (price.pricingMode === "fixed_total") {
    return { quantity: 1, rateUsd: price.totalUsd, amountUsd: price.totalUsd };
  }
  const memberCount = price.memberCount ?? 0;
  const performanceHours = price.performanceHours ?? 0;
  const rateUsd = price.ratePerMemberPerHourUsd ?? 0;
  const quantity = memberCount * performanceHours;
  return {
    quantity,
    rateUsd,
    amountUsd: money(quantity * rateUsd),
    memberCount: memberCount > 0 ? memberCount : undefined,
    performanceHours: performanceHours > 0 ? performanceHours : undefined,
  };
}

/** Whether a line already bills exactly this price. */
export function artistLineBillsPrice(line: ArtistLinePricing, price: BookingPrice) {
  const next = artistLineFieldsFromPrice(price);
  return (
    line.quantity === next.quantity &&
    line.rateUsd === next.rateUsd &&
    line.amountUsd === next.amountUsd &&
    (line.memberCount ?? null) === (next.memberCount ?? null) &&
    (line.performanceHours ?? null) === (next.performanceHours ?? null)
  );
}

type PayoutPricing = {
  pricingMode: BookingPrice["pricingMode"];
  ratePerMemberPerHourUsd?: number;
  performanceHours?: number;
  memberCount?: number;
  totalUsd: number;
};

/** The pricing fields a payout stores for a price (unused keys cleared). */
export function payoutFieldsFromPrice(price: BookingPrice): Required<
  Pick<PayoutPricing, "pricingMode" | "totalUsd">
> & {
  ratePerMemberPerHourUsd: number | undefined;
  performanceHours: number | undefined;
  memberCount: number | undefined;
} {
  if (price.pricingMode === "fixed_total") {
    return {
      pricingMode: "fixed_total",
      totalUsd: price.totalUsd,
      ratePerMemberPerHourUsd: undefined,
      performanceHours: undefined,
      memberCount: undefined,
    };
  }
  return {
    pricingMode: "per_member_hourly",
    totalUsd: price.totalUsd,
    ratePerMemberPerHourUsd: price.ratePerMemberPerHourUsd,
    performanceHours: price.performanceHours,
    memberCount: price.memberCount,
  };
}

/** The price a payout was set at, before prices lived on the booking. */
export function bookingPriceFromPayout(payout: PayoutPricing): BookingPrice {
  if (
    payout.pricingMode === "per_member_hourly" &&
    payout.memberCount !== undefined &&
    payout.performanceHours !== undefined &&
    payout.ratePerMemberPerHourUsd !== undefined
  ) {
    const price = normalizeBookingPrice(payout);
    // Keep what was actually agreed when the split doesn't add up to it.
    if (price.totalUsd === money(payout.totalUsd)) return price;
  }
  return normalizeBookingPrice({ pricingMode: "fixed_total", totalUsd: payout.totalUsd });
}

export function payoutPaysPrice(payout: PayoutPricing, price: BookingPrice) {
  const next = payoutFieldsFromPrice(price);
  return (
    payout.pricingMode === next.pricingMode &&
    payout.totalUsd === next.totalUsd &&
    (payout.memberCount ?? null) === (next.memberCount ?? null) &&
    (payout.performanceHours ?? null) === (next.performanceHours ?? null) &&
    (payout.ratePerMemberPerHourUsd ?? null) === (next.ratePerMemberPerHourUsd ?? null)
  );
}

/** Paid payouts are history and cancelled ones aren't being paid: neither follows the booking. */
export function payoutFollowsBooking(status: string) {
  return status !== "paid" && status !== "cancelled";
}

/**
 * Defaults for an act booked into a position nothing prices yet: the band
 * profile's rate per person per hour and member count, for its set length
 * (or one hour). None when the profile has no rate.
 */
export function bookingPriceFromProfile(args: {
  performerHourlyRateUsd?: number;
  bandMemberCount: number;
  setStartsAt?: number;
  setEndsAt?: number;
}): BookingPrice | undefined {
  const rate = args.performerHourlyRateUsd ?? 0;
  if (!(rate > 0)) return undefined;
  return normalizeBookingPrice({
    pricingMode: "per_member_hourly",
    memberCount: args.bandMemberCount > 0 ? args.bandMemberCount : 1,
    performanceHours: setLengthHours(args.setStartsAt, args.setEndsAt) ?? 1,
    ratePerMemberPerHourUsd: rate,
  });
}

/** A set's length in hours, to the quarter hour; undefined without a full window. */
export function setLengthHours(startsAt?: number, endsAt?: number) {
  if (startsAt == null || endsAt == null || endsAt <= startsAt) return undefined;
  return Math.round(((endsAt - startsAt) / 3_600_000) * 4) / 4 || undefined;
}

/**
 * An event's artist cost (`events.bandsCostUsd`): every payout that's still
 * being paid (paid ones at what was paid), plus the booking price of each
 * priced position whose act has no payout yet — an open or outside-act
 * position, or a platform act not paid through Arbor yet. A position whose
 * act's payout was removed costs nothing: staff said Arbor doesn't pay it.
 */
export function eventArtistCostUsd(args: {
  payouts: ReadonlyArray<{ organizationId: string; status: string; totalUsd: number }>;
  positions: ReadonlyArray<{ seatedOrganizationId?: string; price?: BookingPrice }>;
}) {
  const orgsWithPayout = new Set(args.payouts.map((payout) => payout.organizationId));
  let total = 0;
  for (const payout of args.payouts) {
    if (payout.status !== "cancelled") total += payout.totalUsd;
  }
  for (const position of args.positions) {
    if (!position.price) continue;
    if (position.seatedOrganizationId && orgsWithPayout.has(position.seatedOrganizationId)) continue;
    total += position.price.totalUsd;
  }
  return money(total);
}

export type BookingPriceBackfill = {
  price: BookingPrice;
  source: "invoice_line" | "payout";
  /** Unpaid, uncancelled payouts that must change to pay `price`. */
  payoutIdsToUpdate: string[];
};

/**
 * Migration decision for one position that has no price yet. The quote line
 * wins (billed = paid); without one, the act's payout sets the price. Paid
 * and cancelled payouts are never touched. Null when nothing prices it.
 *
 * `line` must already be the line for this position on a non-void invoice
 * (matched by position, else by the line's day and act).
 */
export function decideBookingPriceBackfill(args: {
  line: ArtistLinePricing | null;
  payouts: ReadonlyArray<PayoutPricing & { id: string; status: string }>;
}): BookingPriceBackfill | null {
  const live = args.payouts.filter((payout) => payout.status !== "cancelled");
  if (args.line) {
    const price = bookingPriceFromLine(args.line);
    return {
      price,
      source: "invoice_line",
      payoutIdsToUpdate: live
        .filter((payout) => payoutFollowsBooking(payout.status) && !payoutPaysPrice(payout, price))
        .map((payout) => payout.id),
    };
  }
  // One act has one payout per event; prefer the one still in progress.
  const payout = live.find((row) => payoutFollowsBooking(row.status)) ?? live[0];
  if (!payout) return null;
  const price = bookingPriceFromPayout(payout);
  return {
    price,
    source: "payout",
    payoutIdsToUpdate: live
      .filter(
        (row) => row.id !== payout.id && payoutFollowsBooking(row.status) && !payoutPaysPrice(row, price),
      )
      .map((row) => row.id),
  };
}
