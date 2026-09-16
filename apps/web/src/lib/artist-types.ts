export const ARTIST_TYPES = ["band", "dj", "singer_songwriter", "other"] as const;

export type ArtistType = (typeof ARTIST_TYPES)[number];

export const ARTIST_TYPE_LABELS: Record<ArtistType, string> = {
  band: "Band",
  dj: "DJ",
  singer_songwriter: "Singer-Songwriter",
  other: "Other",
};

export function artistTypeLabel(value: string | undefined): string {
  return value && value in ARTIST_TYPE_LABELS
    ? ARTIST_TYPE_LABELS[value as ArtistType]
    : ARTIST_TYPE_LABELS.other;
}

/** True for any artist org type (excludes arbor_internal / unset). */
export function isArtistOrganizationType(type: string | undefined | null): boolean {
  return (
    type === "band" || type === "dj" || type === "singer_songwriter" || type === "other"
  );
}
