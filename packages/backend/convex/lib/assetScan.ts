/**
 * Normalize scanned QR / barcode / typed asset tags into an inventory assetId.
 * Accepts arbor.st/e/{id}, portal /e/{id}, bare asset ids, and S###### tags.
 */
export function normalizeAssetScanInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let candidate = trimmed;

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      const pathMatch = url.pathname.match(/\/e\/([^/?#]+)/i);
      if (pathMatch?.[1]) {
        candidate = decodeURIComponent(pathMatch[1]);
      }
    } else {
      const pathMatch = trimmed.match(/(?:^|\/)e\/([^/?#\s]+)/i);
      if (pathMatch?.[1]) {
        candidate = decodeURIComponent(pathMatch[1]);
      }
    }
  } catch {
    // keep trimmed candidate
  }

  candidate = candidate.trim();
  if (!candidate) return null;

  // Strip wrapping punctuation from paste/scan noise
  candidate = candidate.replace(/^["'`<({\[]+|["'`>)}\]]+$/g, "").trim();
  if (!candidate) return null;

  return candidate;
}
