import { PORTAL_TIMEZONE, pacificDateKey } from "@/lib/format";

/**
 * The text staff paste into GrantED's Student Service Payment form for a
 * signed artist payout.
 *
 * GrantED assigns the S-number only once the request is submitted, and the
 * account statement shows the payment line's Description, not the summary.
 * So the line Description carries the payout ID (`ALBPAY-…`): the statement
 * import matches on it and marks the payout paid with GrantED's S-number.
 */

/** The account artist payouts are charged to. */
export const GRANTED_PAYOUT_ACCOUNT = "01-5001-20-2860 (University Funding - University Collected Funds)";

export type GrantedFilingPayout = {
  confirmationToken: string;
  designatedPayeeName?: string;
  designatedPayeeEmail?: string;
  designatedPayeePayoutMethod?: "pickup" | "delivery";
  bandName: string;
  artistType?: string;
  performanceHours?: number;
  eventTitle: string;
  eventStartAt: number;
  venueName?: string;
  totalUsd: number;
  confirmedAt?: number;
};

export type GrantedFilingField = { label: string; value: string };

const SERVICE_PROVIDED: Record<string, string> = {
  band: "Live Band Performance",
  dj: "DJ Set",
  singer_songwriter: "Singer-Songwriter Set",
};

const SET_KIND: Record<string, string> = {
  dj: "DJ set",
  singer_songwriter: "singer-songwriter set",
};

/** `25-SEP-2026`, GrantED's date format. */
export function grantedDate(ms: number) {
  const [year, month, day] = pacificDateKey(ms).split("-");
  const monthName = new Date(Date.UTC(2000, Number(month) - 1, 1))
    .toLocaleString("en-US", { month: "short", timeZone: "UTC" })
    .toUpperCase();
  return `${day}-${monthName}-${year}`;
}

/** "Sep 25, 2026", without the weekday `formatDate` adds. */
const summaryDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: PORTAL_TIMEZONE,
});

/** The last level of a venue path: "Tresidder Memorial Union > CoHo" → "CoHo". */
function venueShortName(venueName: string | undefined) {
  return venueName?.split(">").pop()?.trim() || undefined;
}

/** "Jasmine Agyepong performed a 2-hr DJ set for NSO Barbeque at Governor's Corner on Sep 25, 2026." */
export function grantedSummaryDescription(payout: GrantedFilingPayout) {
  const payee = payout.designatedPayeeName?.trim() || payout.bandName;
  const actName = payout.bandName.trim();
  const sameName = actName.toLowerCase() === payee.toLowerCase();
  const performer =
    payout.artistType === "band" && !sameName
      ? `${payee}'s band "${actName}"`
      : sameName || !actName
        ? payee
        : `${payee} (${actName})`;
  const hours = payout.performanceHours;
  const length = hours ? `${Number.isInteger(hours) ? hours : hours.toFixed(1)}-hr ` : "";
  const kind = SET_KIND[payout.artistType ?? ""] ?? "set";
  const venue = venueShortName(payout.venueName);
  return [
    `${performer} performed a ${length}${kind} for ${payout.eventTitle}`,
    venue ? ` at ${venue}` : "",
    ` on ${summaryDate.format(payout.eventStartAt)}.`,
  ].join("");
}

/** The form's fields in GrantED's order, ready to copy one by one. */
export function grantedFilingFields(payout: GrantedFilingPayout): GrantedFilingField[] {
  const eventDay = grantedDate(payout.eventStartAt);
  const fields: (GrantedFilingField | null)[] = [
    { label: "Vendor", value: payout.designatedPayeeName?.trim() || payout.bandName },
    payout.designatedPayeeEmail ? { label: "Vendor email", value: payout.designatedPayeeEmail } : null,
    { label: "Service start date", value: eventDay },
    { label: "Service end date", value: eventDay },
    { label: "Payment method", value: "Check" },
    { label: "Delivery method", value: payout.designatedPayeePayoutMethod === "pickup" ? "Pickup" : "Mail" },
    { label: "Service provided", value: SERVICE_PROVIDED[payout.artistType ?? ""] ?? "Live Performance" },
    venueShortName(payout.venueName)
      ? { label: "Service location", value: venueShortName(payout.venueName)! }
      : null,
    { label: "Summary description", value: grantedSummaryDescription(payout) },
    payout.confirmedAt ? { label: "Line document date", value: grantedDate(payout.confirmedAt) } : null,
    { label: "Line description", value: `Electronic Agreement ${payout.confirmationToken}` },
    { label: "Line amount", value: payout.totalUsd.toFixed(2) },
    { label: "Line account", value: GRANTED_PAYOUT_ACCOUNT },
  ];
  return fields.filter((field): field is GrantedFilingField => field !== null);
}
