import { Font } from "@react-pdf/renderer";
import { INTER_400_TTF } from "./fonts/inter-400";
import { INTER_400_ITALIC_TTF } from "./fonts/inter-400-italic";
import { INTER_600_TTF } from "./fonts/inter-600";
import { SPACE_GROTESK_600_TTF } from "./fonts/space-grotesk-600";
import { invoiceTheme } from "./theme";

export { invoiceTheme as pdfTheme } from "./theme";

/**
 * Registers the brand fonts with react-pdf. Imported for its side effect by
 * every PDF document; kept out of `theme.ts` so the web bundle never pulls in
 * the embedded font data. Weights 700 resolve to the 600 files, and every
 * italic to Inter Italic 400: react-pdf throws on a style with no registered
 * file. Space Grotesk is headings only and never italic.
 */
Font.register({
  family: "Inter",
  fonts: [
    { src: INTER_400_TTF, fontWeight: 400 },
    { src: INTER_400_ITALIC_TTF, fontWeight: 400, fontStyle: "italic" },
    { src: INTER_600_TTF, fontWeight: 600 },
  ],
});
Font.register({
  family: "Space Grotesk",
  fonts: [{ src: SPACE_GROTESK_600_TTF, fontWeight: 600 }],
});

export const pdfFonts = {
  body: "Inter",
  heading: "Space Grotesk",
} as const;

/** Small uppercase label, matching the web app's eyebrow (`--tracking-eyebrow`). */
export const pdfEyebrow = {
  fontFamily: pdfFonts.heading,
  fontSize: 7,
  fontWeight: 600,
  letterSpacing: 1,
  textTransform: "uppercase",
  color: invoiceTheme.textMuted,
} as const;
