"use client";

import {
  useEffect,
  useState,
  type ComponentType,
  type SVGProps,
} from "react";
import { LinkSimpleIcon } from "@phosphor-icons/react";
import { PHOSPHOR_ICON_LOADERS } from "@/lib/phosphor-icon-loaders";
import { isPhosphorIconName, PHOSPHOR_ICON_NAMES } from "@/lib/phosphor-icon-names";

export type MarketingLinkIconId = string;

type IconComponent = ComponentType<
  SVGProps<SVGSVGElement> & {
    weight?: "regular" | "bold" | "fill" | "light" | "thin" | "duotone";
  }
>;

export type MarketingLinkIconDef = {
  id: string;
  label: string;
  keywords: string;
  featured?: boolean;
};

/** Custom Partiful mark — not in Phosphor. */
function PartifulGlyph({
  weight: _weight,
  ...props
}: SVGProps<SVGSVGElement> & { weight?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 2.2c.5 0 .95.28 1.18.73l1.1 2.14 2.36.34a1.32 1.32 0 0 1 .73 2.25l-1.71 1.67.4 2.35a1.32 1.32 0 0 1-1.91 1.39L12 12.1l-2.15 1.13a1.32 1.32 0 0 1-1.91-1.39l.4-2.35-1.71-1.67a1.32 1.32 0 0 1 .73-2.25l2.36-.34 1.1-2.14c.23-.45.68-.73 1.18-.73Z" />
      <path d="M7.2 14.6c1.35 1.7 3.05 2.7 4.8 2.7s3.45-1 4.8-2.7c.35-.44.98-.5 1.4-.14.42.35.48.98.13 1.4C16.6 18.1 14.4 19.6 12 19.6s-4.6-1.5-6.33-3.74a.99.99 0 0 1 .13-1.4c.42-.36 1.05-.3 1.4.14Z" />
    </svg>
  );
}

/** Featured / popular row in the picker (shown before search). */
export const FEATURED_MARKETING_LINK_ICONS: MarketingLinkIconDef[] = [
  { id: "partiful", label: "Partiful", keywords: "partiful party rsvp invite", featured: true },
  { id: "InstagramLogo", label: "Instagram", keywords: "instagram ig social photo", featured: true },
  { id: "LinkSimple", label: "Link", keywords: "link url website web", featured: true },
  { id: "Ticket", label: "Ticket", keywords: "ticket rsvp entry pass eventbrite", featured: true },
  { id: "CalendarBlank", label: "Calendar", keywords: "calendar date schedule event", featured: true },
  { id: "MapPin", label: "Map pin", keywords: "map pin location venue place", featured: true },
  { id: "MusicNotes", label: "Music", keywords: "music notes audio song band", featured: true },
  { id: "Globe", label: "Website", keywords: "globe website www site", featured: true },
  { id: "LinktreeLogo", label: "Linktree", keywords: "linktree bio links", featured: true },
  { id: "YoutubeLogo", label: "YouTube", keywords: "youtube video", featured: true },
  { id: "TiktokLogo", label: "TikTok", keywords: "tiktok social video", featured: true },
  { id: "SpotifyLogo", label: "Spotify", keywords: "spotify music playlist", featured: true },
];

const iconComponentCache = new Map<string, IconComponent>();
iconComponentCache.set("partiful", PartifulGlyph);
iconComponentCache.set("LinkSimple", LinkSimpleIcon);

/** Accepts custom `partiful` or a Phosphor icon name (e.g. InstagramLogo). */
export function normalizeMarketingLinkIconId(value: string | undefined | null): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  if (raw === "partiful") return "partiful";
  if (isPhosphorIconName(raw)) return raw;
  return undefined;
}

export function marketingLinkIconLabel(id: string | undefined | null): string {
  const normalized = normalizeMarketingLinkIconId(id);
  if (!normalized) return "Link";
  if (normalized === "partiful") return "Partiful";
  return normalized.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/Logo$/, "").trim() || normalized;
}

export function isMarketingLinkIconId(value: string | undefined | null): boolean {
  return Boolean(normalizeMarketingLinkIconId(value));
}

export function getMarketingLinkIcon(id: string | undefined | null): MarketingLinkIconDef {
  const normalized = normalizeMarketingLinkIconId(id) ?? "LinkSimple";
  const featured = FEATURED_MARKETING_LINK_ICONS.find((icon) => icon.id === normalized);
  if (featured) return featured;
  return {
    id: normalized,
    label: marketingLinkIconLabel(normalized),
    keywords: normalized.toLowerCase(),
  };
}

export function featuredMarketingLinkIcons() {
  return FEATURED_MARKETING_LINK_ICONS;
}

/** Search across the full Phosphor set (+ Partiful). */
export function filterMarketingLinkIcons(query: string, limit = 120): MarketingLinkIconDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return FEATURED_MARKETING_LINK_ICONS;

  const results: MarketingLinkIconDef[] = [];
  const partiful = FEATURED_MARKETING_LINK_ICONS[0]!;
  if (`${partiful.id} ${partiful.label} ${partiful.keywords}`.toLowerCase().includes(q)) {
    results.push(partiful);
  }

  for (const name of PHOSPHOR_ICON_NAMES) {
    const label = marketingLinkIconLabel(name);
    const haystack = `${name} ${label}`.toLowerCase();
    if (!haystack.includes(q)) continue;
    results.push({ id: name, label, keywords: haystack });
    if (results.length >= limit) break;
  }
  return results;
}

export async function loadMarketingLinkIcon(
  id: string | undefined | null,
): Promise<IconComponent> {
  const normalized = normalizeMarketingLinkIconId(id) ?? "LinkSimple";
  const cached = iconComponentCache.get(normalized);
  if (cached) return cached;

  if (normalized === "partiful") {
    iconComponentCache.set(normalized, PartifulGlyph);
    return PartifulGlyph;
  }

  const loader = PHOSPHOR_ICON_LOADERS[normalized];
  if (!loader) {
    return LinkSimpleIcon;
  }

  try {
    const mod = await loader();
    const Icon = mod[`${normalized}Icon`] ?? mod[normalized];
    if (!Icon) return LinkSimpleIcon;
    iconComponentCache.set(normalized, Icon);
    return Icon;
  } catch {
    return LinkSimpleIcon;
  }
}

export function guessMarketingLinkIcon(url: string): string | undefined {
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  try {
    const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const host = new URL(withProtocol).hostname.toLowerCase();
    if (host === "partiful.com" || host.endsWith(".partiful.com")) return "partiful";
    if (host.includes("instagram.com")) return "InstagramLogo";
    if (host.includes("youtube.com") || host === "youtu.be") return "YoutubeLogo";
    if (host.includes("tiktok.com")) return "TiktokLogo";
    if (host.includes("spotify.com")) return "SpotifyLogo";
    if (host.includes("soundcloud.com")) return "SoundcloudLogo";
    if (host.includes("music.apple.com")) return "AppleLogo";
    if (host.includes("podcasts.apple.com")) return "ApplePodcastsLogo";
    if (host.includes("discord.com") || host.includes("discord.gg")) return "DiscordLogo";
    if (host === "x.com" || host.includes("twitter.com")) return "XLogo";
    if (host.includes("threads.net")) return "ThreadsLogo";
    if (host.includes("facebook.com") || host.includes("fb.com")) return "FacebookLogo";
    if (host.includes("linkedin.com")) return "LinkedinLogo";
    if (host.includes("wa.me") || host.includes("whatsapp.com")) return "WhatsappLogo";
    if (host.includes("t.me") || host.includes("telegram.")) return "TelegramLogo";
    if (host.includes("snapchat.com")) return "SnapchatLogo";
    if (host.includes("twitch.tv")) return "TwitchLogo";
    if (host.includes("pinterest.com") || host.includes("pin.it")) return "PinterestLogo";
    if (host.includes("reddit.com")) return "RedditLogo";
    if (host.includes("slack.com")) return "SlackLogo";
    if (host.includes("linktr.ee") || host.includes("linktree.com")) return "LinktreeLogo";
    if (host.includes("patreon.com")) return "PatreonLogo";
    if (host.includes("eventbrite.")) return "Ticket";
  } catch {
    if (/partiful\.com/i.test(trimmed)) return "partiful";
  }
  return undefined;
}

/** Renders a marketing-link icon, loading Phosphor glyphs on demand. */
export function MarketingLinkIcon({
  id,
  className,
}: {
  id?: string | null;
  className?: string;
}) {
  const normalized = normalizeMarketingLinkIconId(id) ?? "LinkSimple";
  const [{ Icon }, setIcon] = useState<{ Icon: IconComponent }>({
    Icon: iconComponentCache.get(normalized) ?? LinkSimpleIcon,
  });

  useEffect(() => {
    let cancelled = false;
    const cached = iconComponentCache.get(normalized);
    if (cached) {
      setIcon({ Icon: cached });
      return;
    }
    void loadMarketingLinkIcon(normalized).then((loaded) => {
      if (!cancelled) setIcon({ Icon: loaded });
    });
    return () => {
      cancelled = true;
    };
  }, [normalized]);

  return <Icon className={className} weight="regular" />;
}
