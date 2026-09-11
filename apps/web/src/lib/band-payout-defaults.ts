export type PayoutPricingMode = "per_member_hourly" | "fixed_total";

export type InvoiceArtistLineDefaults = {
  organizationId?: string | null;
  rateUsd?: number | null;
  performanceHours?: number | null;
  memberCount?: number | null;
  amountUsd?: number | null;
};

export type BandProfileDefaults = {
  organizationId: string;
  performerHourlyRateUsd?: number | null;
  memberCount?: number | null;
};

export type ResolvedPayoutDefaults = {
  pricingMode: PayoutPricingMode;
  ratePerMemberPerHourUsd: string;
  performanceHours: string;
  memberCount: string;
  fixedTotalUsd: string;
  source: "invoice" | "band_profile" | "fallback";
};

const FALLBACK_RATE = "150";
const FALLBACK_MEMBERS = "4";
const FALLBACK_HOURS = "1";

function positiveNumber(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

/**
 * Invoice artist line wins, then band profile rate/members, then hardcoded fallbacks.
 */
export function resolvePayoutDefaults(args: {
  invoiceLine?: InvoiceArtistLineDefaults | null;
  bandProfile?: BandProfileDefaults | null;
}): ResolvedPayoutDefaults {
  const invoice = args.invoiceLine;
  const invoiceRate = positiveNumber(invoice?.rateUsd ?? null);
  const invoiceHours = positiveNumber(invoice?.performanceHours ?? null);
  const invoiceMembers = positiveNumber(invoice?.memberCount ?? null);

  if (invoice && (invoiceRate || invoiceHours || invoiceMembers)) {
    return {
      pricingMode: "per_member_hourly",
      ratePerMemberPerHourUsd: String(invoiceRate ?? positiveNumber(args.bandProfile?.performerHourlyRateUsd) ?? 150),
      performanceHours: String(invoiceHours ?? 1),
      memberCount: String(
        invoiceMembers ?? positiveNumber(args.bandProfile?.memberCount) ?? 4,
      ),
      fixedTotalUsd: "0",
      source: "invoice",
    };
  }

  const bandRate = positiveNumber(args.bandProfile?.performerHourlyRateUsd ?? null);
  const bandMembers = positiveNumber(args.bandProfile?.memberCount ?? null);
  if (bandRate || bandMembers) {
    return {
      pricingMode: "per_member_hourly",
      ratePerMemberPerHourUsd: String(bandRate ?? 150),
      performanceHours: FALLBACK_HOURS,
      memberCount: String(bandMembers ?? 4),
      fixedTotalUsd: "0",
      source: "band_profile",
    };
  }

  return {
    pricingMode: "per_member_hourly",
    ratePerMemberPerHourUsd: FALLBACK_RATE,
    performanceHours: FALLBACK_HOURS,
    memberCount: FALLBACK_MEMBERS,
    fixedTotalUsd: "0",
    source: "fallback",
  };
}
