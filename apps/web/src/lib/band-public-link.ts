import { formatShortLinkUrl } from "@/lib/validations/short-links";

export const BAND_PUBLIC_LINK_BASE_URL =
  process.env.NEXT_PUBLIC_SHORT_LINK_BASE_URL?.trim() || "https://arbor.st";

export function formatBandPublicArtistUrl(slug: string) {
  const trimmed = slug.trim();
  if (!trimmed) return "";
  return formatShortLinkUrl(`artists/${trimmed}`, BAND_PUBLIC_LINK_BASE_URL);
}
