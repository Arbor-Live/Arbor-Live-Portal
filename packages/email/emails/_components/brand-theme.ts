/**
 * Email tokens, mirrored from the web app's light theme in
 * `apps/web/src/app/globals.css` (oklch values converted to hex, since email
 * clients don't support oklch). Warm olive neutrals, green-700 primary, and a
 * zinc-950 masthead behind the white logo — the same pairing as the site hero.
 */
export const ARBOR_WEBSITE_URL = "https://arborlive.stanford.edu";

/**
 * The masthead as one 1200×208 image (logo on zinc-950, shown at 600×104) from
 * `apps/web/public/email/masthead.png`. Clients that recolor emails for dark
 * mode (Outlook, and any forwarded copy that lost our <style> block) never
 * touch images, so the band stays black instead of turning mid-gray.
 */
export const ARBOR_MASTHEAD_URL = `${ARBOR_WEBSITE_URL}/email/masthead.png`;
export const ARBOR_CONTACT_EMAIL = "arborlive@stanford.edu";

export const brand = {
  canvas: "#f4f4f0", // --muted
  surface: "#ffffff", // --background
  surfaceRaised: "#fbfbf9", // --sidebar
  surfaceInset: "#f4f4f0", // --muted
  masthead: "#09090b", // zinc-950, landing hero
  text: "#0c0c09", // --foreground
  textBody: "#1d1d16", // --accent-foreground
  textMuted: "#5b5b4b", // --chart-3, AA on white for body-size copy
  textSubtle: "#7c7c67", // --muted-foreground
  accent: "#008236", // --primary (green-700)
  accentForeground: "#f0fdf4", // --primary-foreground
  accentBright: "#008236",
  accentSoft: "#f0fdf4",
  accentBorder: "#b9e8cb",
  border: "#e8e8e3", // --border
  borderSubtle: "#efefea",
  warning: "#bb4d00", // amber-700
  warningSoft: "#fffbeb", // amber-50
  warningBorder: "#fe9a00", // amber-500
  mutedAccent: "#7c7c67",
  fontFamily:
    'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  headingFontFamily:
    '"Space Grotesk", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  maxWidth: "600px",
} as const;

/**
 * Dark palette from the web app's `.dark` theme, applied through a
 * `prefers-color-scheme: dark` media query in `BrandHead`. Inline styles stay
 * light, so clients without media query support (Gmail) render the light theme.
 */
export const brandDark = {
  canvas: "#0c0c09", // --background
  surface: "#1d1d16", // --card
  surfaceRaised: "#2b2b22", // --muted
  text: "#fbfbf9", // --foreground
  textBody: "#e8e8e3",
  textMuted: "#abab9c", // --muted-foreground
  accentText: "#00c950", // --sidebar-primary (green-500)
  accentSoft: "#032e15", // green-950
  border: "#34342d", // white/10 over --card
  borderRaised: "#3f3f39", // white/15 over --card
  warning: "#ffd230", // amber-300
  warningSoft: "#461901", // amber-950
} as const;

/** Uppercase eyebrow label, matching `--tracking-eyebrow` in the web app. */
export const eyebrowText = {
  color: brand.accent,
  fontFamily: brand.headingFontFamily,
  fontSize: "11px",
  fontWeight: "600",
  letterSpacing: "0.14em",
  lineHeight: "16px",
  margin: "0 0 12px",
  textTransform: "uppercase",
} as const;

export const bodyText = {
  color: brand.textBody,
  fontSize: "16px",
  lineHeight: "26px",
  margin: "0 0 20px",
} as const;

export const mutedText = {
  color: brand.textMuted,
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0 0 20px",
} as const;
