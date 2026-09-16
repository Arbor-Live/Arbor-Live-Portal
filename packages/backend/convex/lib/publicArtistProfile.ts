import type { Doc } from "../_generated/dataModel";
import { resolveStoredR2AssetUrl } from "../inventoryR2";

export type PublicArtistLink = { label: string; url: string; icon?: string };

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
 * Artist links, preferring the flexible `artistLinks` array and falling back to
 * the fixed profile link fields for rows the migration hasn't touched yet.
 */
export function buildArtistLinks(
  profile: Pick<
    Doc<"organizationProfiles">,
    | "artistLinks"
    | "publicWebsiteUrl"
    | "publicInstagramUrl"
    | "publicYoutubeUrl"
    | "publicSpotifyUrl"
  >,
): PublicArtistLink[] {
  const explicit: PublicArtistLink[] = [];
  for (const link of profile.artistLinks ?? []) {
    const label = link.label.trim();
    const url = publicProfileUrl(link.url);
    if (label && url) explicit.push({ label, url, icon: link.icon });
  }
  if (explicit.length) return explicit;

  const links: PublicArtistLink[] = [];
  const pairs: Array<[string, string | undefined, string]> = [
    ["Website", profile.publicWebsiteUrl, "Globe"],
    ["Instagram", profile.publicInstagramUrl, "InstagramLogo"],
    ["YouTube", profile.publicYoutubeUrl, "YoutubeLogo"],
    ["Spotify", profile.publicSpotifyUrl, "SpotifyLogo"],
  ];
  for (const [label, raw, icon] of pairs) {
    const url = publicProfileUrl(raw);
    if (url) links.push({ label, url, icon });
  }
  return links;
}
