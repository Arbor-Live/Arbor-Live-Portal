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
  source: "band_profile" | "invoice" | "none";
};

const FALLBACK_HOURS = "1";

function positiveNumber(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

/**
 * The artist org profile is the source of truth for a payout, so its rate and
 * member count win over the event invoice artist line (a snapshot taken when
 * the line was billed). The invoice line only fills gaps. Whatever neither
 * knows stays empty, rather than inventing a rate or headcount.
 */
export function resolvePayoutDefaults(args: {
  invoiceLine?: InvoiceArtistLineDefaults | null;
  bandProfile?: BandProfileDefaults | null;
}): ResolvedPayoutDefaults {
  const profileRate = positiveNumber(args.bandProfile?.performerHourlyRateUsd ?? null);
  const profileMembers = positiveNumber(args.bandProfile?.memberCount ?? null);
  const invoiceRate = positiveNumber(args.invoiceLine?.rateUsd ?? null);
  const invoiceMembers = positiveNumber(args.invoiceLine?.memberCount ?? null);
  const invoiceHours = positiveNumber(args.invoiceLine?.performanceHours ?? null);

  const rate = profileRate ?? invoiceRate;
  const members = profileMembers ?? invoiceMembers;
  const source =
    profileRate || profileMembers
      ? "band_profile"
      : invoiceRate || invoiceMembers || invoiceHours
        ? "invoice"
        : "none";

  return {
    pricingMode: "per_member_hourly",
    ratePerMemberPerHourUsd: rate != null ? String(rate) : "",
    performanceHours: invoiceHours != null ? String(invoiceHours) : FALLBACK_HOURS,
    memberCount: members != null ? String(members) : "",
    fixedTotalUsd: "0",
    source,
  };
}
