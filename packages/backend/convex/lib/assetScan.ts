/**
 * Normalize scanned QR / barcode / typed asset tags into an inventory assetId.
 *
 * Accepts:
 * - https://arbor.st/e/{id} (and schemeless arbor.st/e/{id}) — pass-through QR targets
 * - portal /e/{id} and full arborlive…/e/{id} URLs
 * - bare tags such as ALE-0041, S100234, numeric ids
 *
 * Numeric ALE tags are stored without the prefix or zero-padding:
 * ALE-0123 / 0123 → "123". Other tags (e.g. S100234) pass through unchanged.
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

/**
 * Canonical bare asset id for ALE / numeric tags.
 * ALE-0123 / 0123 → "123". Non-numeric tags pass through.
 */
export function canonicalizeAssetIdTag(tag: string): string {
  const trimmed = stripNoise(tag);
  if (!trimmed) return trimmed;

  const ale = trimmed.match(/^ALE[\s-]*0*(\d+)$/i);
  if (ale?.[1] !== undefined) {
    return ale[1] || "0";
  }

  if (/^\d+$/.test(trimmed)) {
    const stripped = trimmed.replace(/^0+/, "");
    return stripped || "0";
  }

  return trimmed;
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
      return {
        assetId: canonicalizeAssetIdTag(stripNoise(fromPath)),
        shortLinkSlug: null,
      };
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
    return {
      assetId: canonicalizeAssetIdTag(stripNoise(pathOnly)),
      shortLinkSlug: null,
    };
  }

  // Bare asset tags: ALE-0041, S######, numeric, etc.
  return {
    assetId: canonicalizeAssetIdTag(stripNoise(trimmed)),
    shortLinkSlug: null,
  };
}

export function normalizeAssetScanInput(raw: string): string | null {
  return parseAssetScanInput(raw).assetId;
}

/** Candidate assetId strings to try against the by_assetId index. */
export function assetIdLookupCandidates(assetId: string): string[] {
  const base = stripNoise(assetId);
  if (!base) return [];
  const canonical = canonicalizeAssetIdTag(base);
  const candidates = [canonical, canonical.toUpperCase(), canonical.toLowerCase()];
  // Collapse odd whitespace around hyphens before/after canonicalize
  const compact = base.replace(/\s*-\s*/g, "-").replace(/\s+/g, "");
  if (compact && compact !== base) {
    const compactCanonical = canonicalizeAssetIdTag(compact);
    candidates.push(
      compactCanonical,
      compactCanonical.toUpperCase(),
      compactCanonical.toLowerCase(),
    );
  }
  return [...new Set(candidates.filter(Boolean))];
}
