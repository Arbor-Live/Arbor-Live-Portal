/** Comma-separated list in forms ↔ string arrays in Convex. */
export function formatCommaList(values: string[] | undefined): string {
  return (values ?? []).join(", ");
}

export function parseCommaList(input: string | undefined): string[] {
  return (input ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function bandListingFieldsFromProfile(profile: {
  oneLiner?: string;
  genres?: string[];
  demoURL?: string;
  bandMembers?: string[];
  mainContactName?: string;
  mainContactEmail?: string;
  mainContactPhone?: string;
}) {
  return {
    oneLiner: profile.oneLiner ?? "",
    genres: formatCommaList(profile.genres),
    demoURL: profile.demoURL ?? "",
    bandMembers: formatCommaList(profile.bandMembers),
    mainContactName: profile.mainContactName ?? "",
    mainContactEmail: profile.mainContactEmail ?? "",
    mainContactPhone: profile.mainContactPhone ?? "",
  };
}

export function bandListingFieldsToMutation(values: {
  oneLiner?: string;
  genres?: string;
  demoURL?: string;
  bandMembers?: string;
  mainContactName?: string;
  mainContactEmail?: string;
  mainContactPhone?: string;
}) {
  return {
    oneLiner: values.oneLiner?.trim() || undefined,
    genres: parseCommaList(values.genres),
    demoURL: values.demoURL?.trim() || undefined,
    bandMembers: parseCommaList(values.bandMembers),
    mainContactName: values.mainContactName?.trim() || undefined,
    mainContactEmail: values.mainContactEmail?.trim() || undefined,
    mainContactPhone: values.mainContactPhone?.trim() || undefined,
  };
}
