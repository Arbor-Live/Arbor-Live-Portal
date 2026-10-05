/**
 * Shared document tokens, mirrored from the web app's light theme in
 * `apps/web/src/app/globals.css` (oklch converted to hex): warm olive
 * neutrals and the green-700 primary.
 */
export const invoiceTheme = {
  primary: "#008236", // --primary (green-700)
  primaryForeground: "#f0fdf4", // --primary-foreground
  primarySoft: "#f0fdf4",
  primaryBorder: "#b9e8cb",
  primaryHighlightBg: "#f0fdf4",
  text: "#0c0c09", // --foreground
  textMuted: "#5b5b4b", // --chart-3
  textSubtle: "#7c7c67", // --muted-foreground
  border: "#e8e8e3", // --border
  borderStrong: "#d4d4cc",
  mutedBg: "#f4f4f0", // --muted
  mutedHeaderBg: "#f4f4f0",
  discount: "#bb4d00", // amber-700
  white: "#ffffff",
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  headingFontFamily:
    '"Space Grotesk", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
} as const;
