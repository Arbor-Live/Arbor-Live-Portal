"use client";

import type { ComponentType, SVGProps } from "react";
import {
  AppleLogoIcon,
  ApplePodcastsLogoIcon,
  ArticleIcon,
  CalendarBlankIcon,
  CameraIcon,
  DiscordLogoIcon,
  EnvelopeSimpleIcon,
  FacebookLogoIcon,
  GlobeIcon,
  HeartIcon,
  HouseIcon,
  InstagramLogoIcon,
  LinkedinLogoIcon,
  LinkSimpleIcon,
  LinktreeLogoIcon,
  MapPinIcon,
  MicrophoneIcon,
  MusicNotesIcon,
  NewspaperIcon,
  PatreonLogoIcon,
  PhoneIcon,
  PinterestLogoIcon,
  RedditLogoIcon,
  ShoppingBagIcon,
  SlackLogoIcon,
  SnapchatLogoIcon,
  SoundcloudLogoIcon,
  SpotifyLogoIcon,
  StarIcon,
  StorefrontIcon,
  TelegramLogoIcon,
  ThreadsLogoIcon,
  TicketIcon,
  TiktokLogoIcon,
  TreeIcon,
  TwitchLogoIcon,
  WhatsappLogoIcon,
  XLogoIcon,
  YoutubeLogoIcon,
} from "@phosphor-icons/react";

export type MarketingLinkIconId =
  | "partiful"
  | "instagram"
  | "link"
  | "ticket"
  | "calendar"
  | "map-pin"
  | "music"
  | "globe"
  | "youtube"
  | "tiktok"
  | "spotify"
  | "soundcloud"
  | "apple-music"
  | "apple-podcasts"
  | "discord"
  | "x"
  | "threads"
  | "facebook"
  | "linkedin"
  | "whatsapp"
  | "telegram"
  | "snapchat"
  | "twitch"
  | "pinterest"
  | "reddit"
  | "slack"
  | "linktree"
  | "patreon"
  | "email"
  | "phone"
  | "mic"
  | "camera"
  | "house"
  | "heart"
  | "star"
  | "shop"
  | "store"
  | "tree"
  | "news"
  | "article";

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { weight?: "regular" | "bold" | "fill" }>;

export type MarketingLinkIconDef = {
  id: MarketingLinkIconId;
  label: string;
  keywords: string;
  featured?: boolean;
  Icon: IconComponent;
};

function PartifulGlyph({
  weight: _weight,
  ...props
}: SVGProps<SVGSVGElement> & { weight?: "regular" | "bold" | "fill" }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 2.2c.5 0 .95.28 1.18.73l1.1 2.14 2.36.34a1.32 1.32 0 0 1 .73 2.25l-1.71 1.67.4 2.35a1.32 1.32 0 0 1-1.91 1.39L12 12.1l-2.15 1.13a1.32 1.32 0 0 1-1.91-1.39l.4-2.35-1.71-1.67a1.32 1.32 0 0 1 .73-2.25l2.36-.34 1.1-2.14c.23-.45.68-.73 1.18-.73Z" />
      <path d="M7.2 14.6c1.35 1.7 3.05 2.7 4.8 2.7s3.45-1 4.8-2.7c.35-.44.98-.5 1.4-.14.42.35.48.98.13 1.4C16.6 18.1 14.4 19.6 12 19.6s-4.6-1.5-6.33-3.74a.99.99 0 0 1 .13-1.4c.42-.36 1.05-.3 1.4.14Z" />
    </svg>
  );
}

/** Featured first; order within featured is intentional for the picker. */
export const MARKETING_LINK_ICONS: MarketingLinkIconDef[] = [
  {
    id: "partiful",
    label: "Partiful",
    keywords: "partiful party rsvp invite",
    featured: true,
    Icon: PartifulGlyph,
  },
  {
    id: "instagram",
    label: "Instagram",
    keywords: "instagram ig social photo",
    featured: true,
    Icon: InstagramLogoIcon,
  },
  {
    id: "link",
    label: "Link",
    keywords: "link url website web",
    featured: true,
    Icon: LinkSimpleIcon,
  },
  {
    id: "ticket",
    label: "Ticket",
    keywords: "ticket rsvp entry pass eventbrite",
    featured: true,
    Icon: TicketIcon,
  },
  {
    id: "calendar",
    label: "Calendar",
    keywords: "calendar date schedule event",
    featured: true,
    Icon: CalendarBlankIcon,
  },
  {
    id: "map-pin",
    label: "Map pin",
    keywords: "map pin location venue place",
    featured: true,
    Icon: MapPinIcon,
  },
  {
    id: "music",
    label: "Music",
    keywords: "music notes audio song band",
    featured: true,
    Icon: MusicNotesIcon,
  },
  {
    id: "globe",
    label: "Website",
    keywords: "globe website www site",
    featured: true,
    Icon: GlobeIcon,
  },
  {
    id: "linktree",
    label: "Linktree",
    keywords: "linktree bio links",
    featured: true,
    Icon: LinktreeLogoIcon,
  },
  {
    id: "youtube",
    label: "YouTube",
    keywords: "youtube video",
    Icon: YoutubeLogoIcon,
  },
  {
    id: "tiktok",
    label: "TikTok",
    keywords: "tiktok social video",
    Icon: TiktokLogoIcon,
  },
  {
    id: "spotify",
    label: "Spotify",
    keywords: "spotify music playlist",
    Icon: SpotifyLogoIcon,
  },
  {
    id: "soundcloud",
    label: "SoundCloud",
    keywords: "soundcloud music audio",
    Icon: SoundcloudLogoIcon,
  },
  {
    id: "apple-music",
    label: "Apple Music",
    keywords: "apple music itunes",
    Icon: AppleLogoIcon,
  },
  {
    id: "apple-podcasts",
    label: "Apple Podcasts",
    keywords: "apple podcasts podcast",
    Icon: ApplePodcastsLogoIcon,
  },
  {
    id: "discord",
    label: "Discord",
    keywords: "discord chat community",
    Icon: DiscordLogoIcon,
  },
  {
    id: "x",
    label: "X",
    keywords: "x twitter social",
    Icon: XLogoIcon,
  },
  {
    id: "threads",
    label: "Threads",
    keywords: "threads meta social",
    Icon: ThreadsLogoIcon,
  },
  {
    id: "facebook",
    label: "Facebook",
    keywords: "facebook social meta",
    Icon: FacebookLogoIcon,
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    keywords: "linkedin professional social",
    Icon: LinkedinLogoIcon,
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    keywords: "whatsapp chat message",
    Icon: WhatsappLogoIcon,
  },
  {
    id: "telegram",
    label: "Telegram",
    keywords: "telegram chat message",
    Icon: TelegramLogoIcon,
  },
  {
    id: "snapchat",
    label: "Snapchat",
    keywords: "snapchat social snap",
    Icon: SnapchatLogoIcon,
  },
  {
    id: "twitch",
    label: "Twitch",
    keywords: "twitch stream live",
    Icon: TwitchLogoIcon,
  },
  {
    id: "pinterest",
    label: "Pinterest",
    keywords: "pinterest pins social",
    Icon: PinterestLogoIcon,
  },
  {
    id: "reddit",
    label: "Reddit",
    keywords: "reddit social forum",
    Icon: RedditLogoIcon,
  },
  {
    id: "slack",
    label: "Slack",
    keywords: "slack chat workplace",
    Icon: SlackLogoIcon,
  },
  {
    id: "patreon",
    label: "Patreon",
    keywords: "patreon support membership",
    Icon: PatreonLogoIcon,
  },
  {
    id: "email",
    label: "Email",
    keywords: "email mail envelope contact",
    Icon: EnvelopeSimpleIcon,
  },
  {
    id: "phone",
    label: "Phone",
    keywords: "phone call contact",
    Icon: PhoneIcon,
  },
  {
    id: "mic",
    label: "Mic",
    keywords: "mic microphone audio podcast",
    Icon: MicrophoneIcon,
  },
  {
    id: "camera",
    label: "Camera",
    keywords: "camera photo gallery",
    Icon: CameraIcon,
  },
  {
    id: "house",
    label: "Home",
    keywords: "house home venue",
    Icon: HouseIcon,
  },
  {
    id: "heart",
    label: "Heart",
    keywords: "heart like favorite love",
    Icon: HeartIcon,
  },
  {
    id: "star",
    label: "Star",
    keywords: "star favorite highlight",
    Icon: StarIcon,
  },
  {
    id: "shop",
    label: "Shop",
    keywords: "shop bag merch store buy",
    Icon: ShoppingBagIcon,
  },
  {
    id: "store",
    label: "Storefront",
    keywords: "storefront shop store",
    Icon: StorefrontIcon,
  },
  {
    id: "tree",
    label: "Tree",
    keywords: "tree nature outdoor",
    Icon: TreeIcon,
  },
  {
    id: "news",
    label: "News",
    keywords: "news newspaper press",
    Icon: NewspaperIcon,
  },
  {
    id: "article",
    label: "Article",
    keywords: "article blog post writeup",
    Icon: ArticleIcon,
  },
];

const ICON_BY_ID = new Map(MARKETING_LINK_ICONS.map((icon) => [icon.id, icon]));

export function isMarketingLinkIconId(value: string | undefined | null): value is MarketingLinkIconId {
  return Boolean(value && ICON_BY_ID.has(value as MarketingLinkIconId));
}

export function getMarketingLinkIcon(id: string | undefined | null): MarketingLinkIconDef {
  if (id && ICON_BY_ID.has(id as MarketingLinkIconId)) {
    return ICON_BY_ID.get(id as MarketingLinkIconId)!;
  }
  return ICON_BY_ID.get("link")!;
}

export function featuredMarketingLinkIcons() {
  return MARKETING_LINK_ICONS.filter((icon) => icon.featured);
}

export function filterMarketingLinkIcons(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return MARKETING_LINK_ICONS;
  return MARKETING_LINK_ICONS.filter((icon) => {
    const haystack = `${icon.id} ${icon.label} ${icon.keywords}`.toLowerCase();
    return haystack.includes(q);
  });
}

export function guessMarketingLinkIcon(url: string): MarketingLinkIconId | undefined {
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  try {
    const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const host = new URL(withProtocol).hostname.toLowerCase();
    if (host === "partiful.com" || host.endsWith(".partiful.com")) return "partiful";
    if (host.includes("instagram.com")) return "instagram";
    if (host.includes("youtube.com") || host === "youtu.be") return "youtube";
    if (host.includes("tiktok.com")) return "tiktok";
    if (host.includes("spotify.com")) return "spotify";
    if (host.includes("soundcloud.com")) return "soundcloud";
    if (host.includes("music.apple.com")) return "apple-music";
    if (host.includes("podcasts.apple.com")) return "apple-podcasts";
    if (host.includes("discord.com") || host.includes("discord.gg")) return "discord";
    if (host === "x.com" || host.includes("twitter.com")) return "x";
    if (host.includes("threads.net")) return "threads";
    if (host.includes("facebook.com") || host.includes("fb.com")) return "facebook";
    if (host.includes("linkedin.com")) return "linkedin";
    if (host.includes("wa.me") || host.includes("whatsapp.com")) return "whatsapp";
    if (host.includes("t.me") || host.includes("telegram.")) return "telegram";
    if (host.includes("snapchat.com")) return "snapchat";
    if (host.includes("twitch.tv")) return "twitch";
    if (host.includes("pinterest.com") || host.includes("pin.it")) return "pinterest";
    if (host.includes("reddit.com")) return "reddit";
    if (host.includes("slack.com")) return "slack";
    if (host.includes("linktr.ee") || host.includes("linktree.com")) return "linktree";
    if (host.includes("patreon.com")) return "patreon";
    if (host.includes("eventbrite.")) return "ticket";
  } catch {
    if (/partiful\.com/i.test(trimmed)) return "partiful";
  }
  return undefined;
}

export function MarketingLinkIcon({
  id,
  className,
}: {
  id?: string | null;
  className?: string;
}) {
  const { Icon } = getMarketingLinkIcon(id);
  return <Icon className={className} weight="regular" />;
}
