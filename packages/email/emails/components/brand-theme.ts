export const ARBOR_LOGO_URL =
  "https://di867tnz6fwga.cloudfront.net/brand-kits/726962ea-cb8d-4c17-9b25-32bc8259d916/primary/4a5add54-637f-4565-a548-e0eca2109504.png";

export const brand = {
  background: "#070707",
  text: "#e6e6e6",
  textMuted: "#c4c4c4",
  accent: "#567740",
  accentText: "#ffffff",
  border: "#567740",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  maxWidth: "600px",
} as const;

export const bodyText = {
  color: brand.text,
  fontSize: "16px",
  lineHeight: "24px",
  margin: "0 0 24px",
} as const;

export const mutedText = {
  color: brand.textMuted,
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0 0 20px",
} as const;

export const signOffText = {
  color: brand.text,
  fontSize: "16px",
  lineHeight: "24px",
  margin: "0",
} as const;
