import type { UserSelectOption } from "@/components/users/user-select";
import { pickUserProfileImageUrl } from "@/lib/user-profile-image";

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

export type UserSelectSource = {
  id: string;
  name: string;
  email?: string | null;
  role?: string | null;
  pronouns?: string | null;
  gradYear?: number | null;
  rateMode?: "normal" | "lead" | "custom" | string | null;
  hourlyRateUsd?: number | null;
  avatarUrl?: string | null;
  image?: string | null;
};

export function toUserSelectOption(entry: UserSelectSource): UserSelectOption {
  return {
    value: entry.id,
    label: entry.name,
    description: buildUserSelectDescription(entry),
    avatarUrl: pickUserProfileImageUrl(entry.avatarUrl, entry.image),
    role: entry.role ?? undefined,
    email: entry.email ?? undefined,
  };
}

/**
 * Dashboard assignable-crew / teammate picker options from `listManagers`
 * (or the same shape). Optionally injects the signed-in user when absent.
 */
export function assignableCrewSelectOptions(
  managers: readonly UserSelectSource[] | null | undefined,
  currentUser?: UserSelectSource | null,
): UserSelectOption[] {
  const options = (managers ?? []).map(toUserSelectOption);
  if (currentUser?.id && !options.some((option) => option.value === currentUser.id)) {
    options.unshift(toUserSelectOption(currentUser));
  }
  return options.sort((a, b) => a.label.localeCompare(b.label));
}
