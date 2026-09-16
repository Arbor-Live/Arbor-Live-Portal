import type { Doc } from "../_generated/dataModel";
import { resolveStoredR2AssetUrl } from "../inventoryR2";

export type PublicArtistLink = { label: string; url: string };

export async function resolvePublicHeroImageUrl(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return (await resolveStoredR2AssetUrl(trimmed)) ?? trimmed;
}

/** Profile links are rendered as public anchors — only publish absolute http(s) URLs. */
export function publicProfileUrl(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
  } catch {
    return undefined;
  }
  return trimmed;
}

/**
 * The fixed profile link fields, flattened to labeled links. Replaced by the
 * flexible `artistLinks` array in a follow-up migration.
 */
export function buildArtistLinks(
  profile: Pick<
    Doc<"organizationProfiles">,
    "publicWebsiteUrl" | "publicInstagramUrl" | "publicYoutubeUrl" | "publicSpotifyUrl"
  >,
): PublicArtistLink[] {
  const links: PublicArtistLink[] = [];
  const pairs: Array<[string, string | undefined]> = [
    ["Website", profile.publicWebsiteUrl],
    ["Instagram", profile.publicInstagramUrl],
    ["YouTube", profile.publicYoutubeUrl],
    ["Spotify", profile.publicSpotifyUrl],
  ];
  for (const [label, raw] of pairs) {
    const url = publicProfileUrl(raw);
    if (url) links.push({ label, url });
  }
  return links;
}
