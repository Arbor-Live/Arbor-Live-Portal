/**
 * Normalize scanned QR / barcode / typed asset tags into an inventory assetId.
 *
 * Accepts:
 * - https://arbor.st/e/{id} (and schemeless arbor.st/e/{id}) — pass-through QR targets
 * - portal /e/{id} and full arborlive…/e/{id} URLs
 * - bare tags such as ALE-0041, S100234, numeric ids
 */

const EQUIPMENT_PATH_RE = /(?:^|\/)e\/([^/?#\s]+)/i;
const ARBOR_ST_HOST_RE = /^(?:www\.)?arbor\.st$/i;

export type ParsedAssetScan = {
  /** Best-effort asset id extracted from the scan (may still need DB lookup). */
  assetId: string | null;
  /** Short-link slug when the input was arbor.st/{slug} without an /e/ path. */
  shortLinkSlug: string | null;
};

function stripNoise(value: string): string {
  return value
    .replace(/^[\s"'`<({\[]+|[\s"'`>)}\]]+$/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
}

function extractEquipmentIdFromPath(pathname: string): string | null {
  const match = pathname.match(EQUIPMENT_PATH_RE);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]).trim() || null;
  } catch {
    return match[1].trim() || null;
  }
}

function tryParseUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      return new URL(trimmed);
    }
    // Schemeless hosts: arbor.st/e/123, arborlive.stanford.edu/e/ALE-0041
    if (/^(?:www\.)?(?:arbor\.st|arborlive\.stanford\.edu)\//i.test(trimmed)) {
      return new URL(`https://${trimmed}`);
    }
  } catch {
    return null;
  }
  return null;
}

export function parseAssetScanInput(raw: string): ParsedAssetScan {
  const trimmed = stripNoise(raw);
  if (!trimmed) {
    return { assetId: null, shortLinkSlug: null };
  }

  const url = tryParseUrl(trimmed);
  if (url) {
    const fromPath = extractEquipmentIdFromPath(url.pathname);
    if (fromPath) {
      return { assetId: stripNoise(fromPath), shortLinkSlug: null };
    }

    // arbor.st/{slug} custom short link (not /e/…) — resolve destination later
    if (ARBOR_ST_HOST_RE.test(url.hostname)) {
      const slug = url.pathname.replace(/^\/+|\/+$/g, "").split("/")[0] ?? "";
      if (slug && !slug.includes(".")) {
        return { assetId: null, shortLinkSlug: decodeURIComponent(slug) };
      }
    }

    return { assetId: null, shortLinkSlug: null };
  }

  // Relative /e/{id} paste
  const pathOnly = extractEquipmentIdFromPath(trimmed);
  if (pathOnly) {
    return { assetId: stripNoise(pathOnly), shortLinkSlug: null };
  }

  // Bare asset tags: ALE-0041, S######, numeric, etc.
  return { assetId: stripNoise(trimmed), shortLinkSlug: null };
}

export function normalizeAssetScanInput(raw: string): string | null {
  return parseAssetScanInput(raw).assetId;
}

/** Candidate assetId strings to try against the by_assetId index. */
export function assetIdLookupCandidates(assetId: string): string[] {
  const base = stripNoise(assetId);
  if (!base) return [];
  const candidates = [base, base.toUpperCase(), base.toLowerCase()];
  // ALE-0041 style: collapse odd whitespace around the hyphen
  const compact = base.replace(/\s*-\s*/g, "-").replace(/\s+/g, "");
  if (compact && compact !== base) {
    candidates.push(compact, compact.toUpperCase(), compact.toLowerCase());
  }
  return [...new Set(candidates.filter(Boolean))];
}
