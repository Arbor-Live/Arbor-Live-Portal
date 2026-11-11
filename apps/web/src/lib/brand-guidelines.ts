/**
 * Content for the public brand page (`/brand`). Source of truth is the
 * "Branding Guidelines" Notion page (thearbor.notion.site/branding); keep the
 * two in step. Assets live in `public/brand/`.
 */

export const BRAND_FIGMA_URL =
  "https://www.figma.com/design/nstDrBW0vuop4VkbkcmDn6/Arbor-Live?node-id=0-1";
export const BRAND_KIT_URL = "/brand/arbor-live-brand-kit.zip";
export const BRAND_INSTAGRAM_HANDLE = "@thearborstanford";
export const BRAND_INSTAGRAM_URL = "https://instagram.com/thearborstanford";

export type BrandCreditTier = {
  id: string;
  title: string;
  when: string;
  requirement: "required" | "required-if-discounted" | "optional";
  phrases: string[];
  note: string;
  badge: { slug: string; label: string };
};

export const brandCreditTiers: BrandCreditTier[] = [
  {
    id: "discounted",
    title: "Discounted crew events",
    when: "We ran your event's production and you received a discount.",
    requirement: "required",
    phrases: ["Sponsored by Arbor Live", "[Your group name] x Arbor Live presents…"],
    note: "Use this on every marketing post, and tag or link us wherever you can. Similar variations of the second line are fine.",
    badge: { slug: "sponsored-by", label: "Sponsored by" },
  },
  {
    id: "rentals",
    title: "Rentals without crew",
    when: "You used Arbor Live equipment, but we didn't run it.",
    requirement: "required-if-discounted",
    phrases: ["Equipment provided by Arbor Live"],
    note: "Don't use wording that suggests Arbor Live ran the event.",
    badge: { slug: "equipment-provided-by", label: "Equipment provided by" },
  },
  {
    id: "crew",
    title: "Crew events",
    when: "We ran your event's production at full price.",
    requirement: "optional",
    phrases: [
      "Produced by Arbor Live",
      "Made possible by Arbor Live",
      "In partnership with Arbor Live",
      "Live music provided by Arbor Live",
    ],
    note: "You don't have to credit us, but it would mean a lot to us.",
    badge: { slug: "produced-by", label: "Produced by" },
  },
  {
    id: "support",
    title: "Support",
    when: "We helped make your event happen, without running anything critical to it.",
    requirement: "optional",
    phrases: ["With support from Arbor Live"],
    note: "Optional, and always appreciated.",
    badge: { slug: "with-support-from", label: "With support from" },
  },
];

export const brandNames: { name: string; description: string }[] = [
  {
    name: "Arbor Live",
    description:
      "The students who run live events all over campus. Supported by OSE.",
  },
  {
    name: "Arbor Trivia",
    description: "The part of Arbor Live that runs trivia at the Arbor Bar. Supported by OSE.",
  },
  {
    name: "The Arbor Bar",
    description:
      "The bar in lower Tresidder, right outside TreeHouse. This is where Arbor Trivia happens.",
  },
  {
    name: "The Arbor Stage (Back Patio)",
    description:
      "Our stage in lower Tresidder, at the far end from the building. This is where our live music shows happen.",
  },
  {
    name: "The Arbor",
    description:
      "The umbrella term for all of the above. Where you can, name the specific part instead of just “Arbor”.",
  },
];

export type BrandColor = { hex: string; name: string; onDark?: boolean };

export const brandColorsOnLight: BrandColor[] = [
  { hex: "#000000", name: "Black" },
  { hex: "#001605", name: "Dark green" },
  { hex: "#4BA152", name: "Olive green" },
];

export const brandColorsOnDark: BrandColor[] = [
  { hex: "#FFFFFF", name: "White", onDark: true },
  { hex: "#4BA152", name: "Olive green", onDark: true },
];

export type BrandAsset = {
  href: string;
  label: string;
  /** Background the preview tile sits on. */
  surface: "light" | "dark";
  width: number;
  height: number;
};

export const brandWordmarks: BrandAsset[] = [
  {
    href: "/brand/arbor-live-wordmark-white.svg",
    label: "White wordmark",
    surface: "dark",
    width: 538,
    height: 270,
  },
  {
    href: "/brand/arbor-live-wordmark-black.svg",
    label: "Black wordmark",
    surface: "light",
    width: 538,
    height: 270,
  },
];

export const brandLogomarks: BrandAsset[] = [
  {
    href: "/brand/arbor-logomark-black.svg",
    label: "Black",
    surface: "light",
    width: 390,
    height: 518,
  },
  {
    href: "/brand/arbor-logomark-white.svg",
    label: "White",
    surface: "dark",
    width: 390,
    height: 518,
  },
  {
    href: "/brand/arbor-logomark-outline.svg",
    label: "Outline",
    surface: "light",
    width: 390,
    height: 519,
  },
  {
    href: "/brand/arbor-logomark-inlay-green.svg",
    label: "Outline with text",
    surface: "light",
    width: 430,
    height: 513,
  },
];

export const brandWordmarkRules: { ok: boolean; text: string }[] = [
  { ok: true, text: "Use it in black or white, on any surface with enough contrast." },
  { ok: true, text: "Add texture for depth when it suits the design." },
  {
    ok: true,
    text: "Text above the wordmark should span its full width. Text to its left needs clear space and must be shorter than the wordmark.",
  },
  {
    ok: true,
    text: "Align multi-line text toward the wordmark. Center it, unless it sits in a corner of the page, where top or bottom alignment is fine.",
  },
  { ok: false, text: "Don't remove “Live”." },
  { ok: false, text: "Don't add text below or to the right of the wordmark." },
];
