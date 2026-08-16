/**
 * Shared description-line builder for user pickers (UserSelect, assignee
 * dropdowns, etc). Appends pronouns / graduation year to the role+email
 * summary only when present, so pickers stay compact for users without them.
 */
export function buildUserSelectDescription(row: {
  role?: string | null;
  email?: string | null;
  pronouns?: string | null;
  gradYear?: number | null;
  rateMode?: "normal" | "lead" | "custom" | string | null;
  hourlyRateUsd?: number | null;
}): string {
  const rateLabel =
    row.rateMode === "lead"
      ? row.hourlyRateUsd && row.hourlyRateUsd > 0
        ? `Lead · $${row.hourlyRateUsd}/hr`
        : "Lead"
      : row.hourlyRateUsd && row.hourlyRateUsd > 0
        ? `$${row.hourlyRateUsd}/hr`
        : undefined;
  const parts = [
    row.role,
    row.email,
    rateLabel,
    row.pronouns,
    row.gradYear ? `'${String(row.gradYear).slice(-2)}` : undefined,
  ];
  return parts.filter((part): part is string => Boolean(part && String(part).trim())).join(" • ");
}
