/** Comma-separated list in forms ↔ string arrays in Convex. */
export function formatCommaList(values: string[] | undefined): string {
  return (values ?? []).join(", ");
}

/** Trim form text; keep `""` so Convex receives an explicit clear (undefined is omitted). */
export function trimOptional(value: string | undefined): string {
  return (value ?? "").trim();
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
    oneLiner: trimOptional(values.oneLiner),
    genres: parseCommaList(values.genres),
    demoURL: trimOptional(values.demoURL),
    bandMembers: parseCommaList(values.bandMembers),
    mainContactName: trimOptional(values.mainContactName),
    mainContactEmail: trimOptional(values.mainContactEmail),
    mainContactPhone: trimOptional(values.mainContactPhone),
  };
}

export function bandPublicUrlsToMutation(values: {
  publicWebsiteUrl?: string;
  publicInstagramUrl?: string;
  publicYoutubeUrl?: string;
  publicSpotifyUrl?: string;
  publicSlug?: string;
  publicHeroImageUrl?: string;
}) {
  return {
    publicWebsiteUrl: trimOptional(values.publicWebsiteUrl),
    publicInstagramUrl: trimOptional(values.publicInstagramUrl),
    publicYoutubeUrl: trimOptional(values.publicYoutubeUrl),
    publicSpotifyUrl: trimOptional(values.publicSpotifyUrl),
    publicSlug: trimOptional(values.publicSlug),
    publicHeroImageUrl: trimOptional(values.publicHeroImageUrl),
  };
}
