import { v } from "convex/values";

export const MAX_ADDITIONAL_LINKS = 10;
export const MAX_LINK_ICON_CHARS = 64;
export const MAX_PARTIFUL_COHOST_URL_CHARS = 2000;

export const marketingDesignLinkValue = v.object({
  label: v.string(),
  url: v.string(),
  icon: v.optional(v.string()),
});

export type MarketingDesignLink = {
  label: string;
  url: string;
  icon?: string;
};

export function normalizeMarketingLinks(
  links: Array<{ label: string; url: string; icon?: string }> | undefined,
  max = MAX_ADDITIONAL_LINKS,
): MarketingDesignLink[] {
  return (links ?? [])
    .map((link) => {
      const label = link.label.trim();
      const url = link.url.trim();
      const icon = link.icon?.trim().slice(0, MAX_LINK_ICON_CHARS) || undefined;
      return icon ? { label, url, icon } : { label, url };
    })
    .filter((link) => link.label && link.url)
    .slice(0, max);
}

export function normalizeOptionalUrl(url: string | undefined, maxChars?: number) {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  if (maxChars != null && trimmed.length > maxChars) {
    throw new Error(`URL must be ${maxChars} characters or fewer.`);
  }
  return trimmed;
}

export function isPartifulUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const host = new URL(withProtocol).hostname.toLowerCase();
    return host === "partiful.com" || host.endsWith(".partiful.com");
  } catch {
    return /partiful\.com/i.test(trimmed);
  }
}

export function linksIncludePartiful(links: Array<{ url: string }> | undefined) {
  return (links ?? []).some((link) => isPartifulUrl(link.url));
}
