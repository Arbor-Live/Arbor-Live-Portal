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
  const normalized: MarketingDesignLink[] = [];
  for (const link of links ?? []) {
    const label = link.label.trim();
    const url = normalizeHttpUrl(link.url);
    if (!label || !url) continue;
    const icon = link.icon?.trim().slice(0, MAX_LINK_ICON_CHARS) || undefined;
    normalized.push(icon ? { label, url, icon } : { label, url });
    if (normalized.length >= max) break;
  }
  return normalized;
}

/** Accept only http(s) URLs; bare hosts are normalized to https://. */
function normalizeHttpUrl(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
  } catch {
    return undefined;
  }
  return candidate;
}

export function normalizeOptionalUrl(url: string | undefined, maxChars?: number) {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  if (maxChars != null && trimmed.length > maxChars) {
    throw new Error(`URL must be ${maxChars} characters or fewer.`);
  }
  return trimmed;
}

function partifulHostname(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "partiful.com" || host.endsWith(".partiful.com");
}

/** True for Partiful RSVP / event URLs (protocol optional; bare hosts allowed). */
export function isPartifulUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    return partifulHostname(new URL(withProtocol).hostname);
  } catch {
    return false;
  }
}

export function linksIncludePartiful(links: Array<{ url: string }> | undefined) {
  return (links ?? []).some((link) => isPartifulUrl(link.url));
}

/** Strict HTTPS Partiful URL — for cohost invite persistence and admin link rendering. */
export function isPartifulCohostInviteUrl(url: string | undefined | null): boolean {
  const trimmed = url?.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" && partifulHostname(parsed.hostname);
  } catch {
    return false;
  }
}

export function normalizePartifulCohostUrl(url: string | undefined) {
  const trimmed = normalizeOptionalUrl(url, MAX_PARTIFUL_COHOST_URL_CHARS);
  if (!trimmed) return undefined;
  if (!isPartifulCohostInviteUrl(trimmed)) {
    throw new Error("Partiful cohost invite must be an https://partiful.com URL.");
  }
  return trimmed;
}
