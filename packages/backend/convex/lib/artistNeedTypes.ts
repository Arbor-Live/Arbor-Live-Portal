import { v } from "convex/values";

/**
 * What a lineup position (`eventArtistNeeds`) is looking for. Kept free of DB
 * imports so `schema.ts` can use the validators.
 */

export const ARTIST_NEED_TYPES = ["band", "dj", "singer_songwriter", "no_preference"] as const;
export type ArtistNeedType = (typeof ARTIST_NEED_TYPES)[number];

export const artistNeedTypeValue = v.union(
  v.literal("band"),
  v.literal("dj"),
  v.literal("singer_songwriter"),
  v.literal("no_preference"),
);

export const ARTIST_NEED_TYPE_LABELS: Record<ArtistNeedType, string> = {
  band: "Live band",
  dj: "DJ",
  singer_songwriter: "Singer-songwriter",
  no_preference: "No preference",
};

/** The act types a position can look for; a position may look for several. */
export const ARTIST_NEED_ACT_TYPES = ["band", "dj", "singer_songwriter"] as const;
export type ArtistNeedActType = (typeof ARTIST_NEED_ACT_TYPES)[number];

export const artistNeedActTypeValue = v.union(
  v.literal("band"),
  v.literal("dj"),
  v.literal("singer_songwriter"),
);

/** Dedupe into canonical order; an empty list means "no preference". */
export function normalizeArtistTypes(types: readonly string[]): ArtistNeedActType[] {
  return ARTIST_NEED_ACT_TYPES.filter((type) => types.includes(type));
}

/**
 * What a position is looking for. Reads the deprecated single `artistType`
 * when the position predates `artistTypes`.
 */
export function artistTypesOf(need: {
  artistTypes?: readonly ArtistNeedActType[];
  artistType?: ArtistNeedType;
}): ArtistNeedActType[] {
  if (need.artistTypes) return normalizeArtistTypes(need.artistTypes);
  return need.artistType && need.artistType !== "no_preference" ? [need.artistType] : [];
}

/** "Live band or DJ"; "No preference" when the list is empty. */
export function artistTypesLabel(types: readonly ArtistNeedActType[]): string {
  if (types.length === 0) return ARTIST_NEED_TYPE_LABELS.no_preference;
  return types.map((type) => ARTIST_NEED_TYPE_LABELS[type]).join(" or ");
}

/** True when an act of `artistType` could fill a position looking for any of `types`. */
export function artistTypesMatchNeed(
  types: readonly ArtistNeedActType[],
  artistType: string | undefined | null,
): boolean {
  if (types.length === 0) return true;
  return types.some((type) => artistTypeMatchesNeed(type, artistType));
}

/** True when `artistType` could satisfy an event looking for `needType`. */
export function artistTypeMatchesNeed(
  needType: ArtistNeedType,
  artistType: string | undefined | null,
): boolean {
  if (needType === "no_preference") return true;
  if (needType === "band") return artistType === "band" || artistType === "singer_songwriter";
  if (needType === "dj") return artistType === "dj";
  if (needType === "singer_songwriter") return artistType === "singer_songwriter";
  return false;
}
