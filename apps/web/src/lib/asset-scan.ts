/**
 * Client-side twin of the backend `lib/assetScan.ts`. Normalizes a scanned QR /
 * barcode / typed asset tag into a bare assetId so the create-asset wizard can
 * match sibling tags and existing items without a server round-trip.
 */

const EQUIPMENT_PATH_RE = /(?:^|\/)e\/([^/?#\s]+)/i;

function stripNoise(value: string): string {
  return value
    .replace(/^[\s"'`<({\[]+|[\s"'`>)}\]]+$/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
}

function tryParseUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      return new URL(trimmed);
    }
    if (/^(?:www\.)?(?:arbor\.st|arborlive\.stanford\.edu)\//i.test(trimmed)) {
      return new URL(`https://${trimmed}`);
    }
  } catch {
    return null;
  }
  return null;
}

/** Best-effort bare assetId from any scan input (URL, /e/{id}, bare tag). */
export function normalizeAssetScanInput(raw: string): string | null {
  const trimmed = stripNoise(raw);
  if (!trimmed) return null;

  const url = tryParseUrl(trimmed);
  if (url) {
    const match = url.pathname.match(EQUIPMENT_PATH_RE);
    const fromPath = match?.[1];
    if (fromPath) {
      try {
        return stripNoise(decodeURIComponent(fromPath)) || null;
      } catch {
        return stripNoise(fromPath) || null;
      }
    }
    return null;
  }

  const pathOnly = trimmed.match(EQUIPMENT_PATH_RE);
  if (pathOnly?.[1]) {
    return stripNoise(pathOnly[1]) || null;
  }

  return stripNoise(trimmed);
}

/** Candidate bare assetIds to try (case variants, hyphen/space collapsed). */
export function assetIdLookupCandidates(assetId: string): string[] {
  const base = stripNoise(assetId);
  if (!base) return [];
  const candidates = [base, base.toUpperCase(), base.toLowerCase()];
  const compact = base.replace(/\s*-\s*/g, "-").replace(/\s+/g, "");
  if (compact && compact !== base) {
    candidates.push(compact, compact.toUpperCase(), compact.toLowerCase());
  }
  return [...new Set(candidates.filter(Boolean))];
}
