/**
 * Which stored files the warehouse printer can take. Images are wrapped in a
 * PDF page before printing; react-pdf only embeds PNG and JPEG, so WebP, GIF
 * and SVG uploads cannot print. Mirrored in apps/web/src/lib/r2-assets.ts.
 */
export type PrintableFormat = "pdf" | "png" | "jpg";

/** Max copies per poster print job. */
export const MAX_POSTER_COPIES = 30;

export function printableFormatFromName(value: string | undefined): PrintableFormat | null {
  const path = value?.trim().split(/[?#]/)[0]?.toLowerCase() ?? "";
  if (path.endsWith(".pdf")) return "pdf";
  if (path.endsWith(".png")) return "png";
  if (/\.jpe?g$/.test(path)) return "jpg";
  return null;
}

export function printableFormatFromContentType(value: string | null | undefined): PrintableFormat | null {
  const type = value?.split(";")[0]?.trim().toLowerCase();
  if (type === "application/pdf") return "pdf";
  if (type === "image/png") return "png";
  if (type === "image/jpeg" || type === "image/jpg") return "jpg";
  return null;
}
