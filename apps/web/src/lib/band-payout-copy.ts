/** Shared copy for band payout / payee setup surfaces. */

export type BandPayeePayoutMethod = "pickup" | "delivery";

export const DEFAULT_BAND_PAYEE_PAYOUT_METHOD: BandPayeePayoutMethod = "pickup";

export const BAND_PAYEE_PAYOUT_METHOD_OPTIONS: ReadonlyArray<{
  value: BandPayeePayoutMethod;
  label: string;
  description: string;
}> = [
  {
    value: "pickup",
    label: "Pickup (ASSU office)",
    description: "Recommended — pick up your payment from the ASSU office. A mailing address is still required.",
  },
  {
    value: "delivery",
    label: "Delivery",
    description: "Mail payment to the mailing address below.",
  },
];

export function formatBandPayeePayoutMethod(method?: BandPayeePayoutMethod | "") {
  if (method === "pickup") return "Pickup (ASSU office)";
  if (method === "delivery") return "Delivery";
  return "—";
}

export const BAND_PAYEE_MAILING_ADDRESS_HINT =
  "Required for Stanford / GrantEd whether you choose pickup or delivery. Prefer a personal mailing address off campus — not a Stanford mailbox, dorm, or other on-campus address.";

export const BAND_PAYEE_MAILING_ADDRESS_PLACEHOLDER =
  "123 Example St\nPalo Alto, CA 94301";

export const BAND_PAYEE_1099_NOTICE =
  "If your designated payee receives more than $2,000 in total across the calendar year from any Stanford VSO (not just Arbor Live), Stanford will issue them a Form 1099. Consider rotating the designated payee among members if you expect to exceed that threshold.";

/** Shown to artist members who can see payout details but cannot change them. */
export function bandPayoutAdminOnlyNotice(adminNames: string[]) {
  const ask =
    adminNames.length === 0
      ? "Ask Arbor Live to make someone on your team an artist admin."
      : `Ask ${new Intl.ListFormat("en", { type: "disjunction" }).format(adminNames)}.`;
  return `Only your artist admin can set the payee. ${ask}`;
}
