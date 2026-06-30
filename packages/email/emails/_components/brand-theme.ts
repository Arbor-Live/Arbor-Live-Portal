/** Dark-theme tokens aligned with the portal primary (#3d7a5c). */
export const ARBOR_LOGO_URL =
  "https://di867tnz6fwga.cloudfront.net/brand-kits/726962ea-cb8d-4c17-9b25-32bc8259d916/primary/4a5add54-637f-4565-a548-e0eca2109504.png";

export const brand = {
  canvas: "#050505",
  surface: "#111111",
  surfaceRaised: "#181818",
  surfaceInset: "#141414",
  text: "#f2f2f2",
  textMuted: "#a3a3a3",
  textSubtle: "#737373",
  accent: "#3d7a5c",
  accentBright: "#4a9168",
  accentSoft: "rgba(61, 122, 92, 0.14)",
  accentBorder: "rgba(61, 122, 92, 0.35)",
  border: "#262626",
  borderSubtle: "#1f1f1f",
  warning: "#fbbf24",
  warningSoft: "rgba(251, 191, 36, 0.12)",
  warningBorder: "#d97706",
  mutedAccent: "#525252",
  mutedSoft: "rgba(82, 82, 82, 0.2)",
  fontFamily:
    'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, sans-serif',
  maxWidth: "560px",
} as const;

export const bodyText = {
  color: brand.text,
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
