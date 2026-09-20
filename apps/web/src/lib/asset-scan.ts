/**
 * Client-side twin of the backend `lib/assetScan.ts`. Normalizes a scanned QR /
 * barcode / typed asset tag into a bare assetId so the create-asset wizard can
 * match sibling tags and existing items without a server round-trip.
 *
 * Numeric ALE tags are stored without the prefix or zero-padding:
 * ALE-0123 / 0123 → "123".
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
    if (/^(?:www\.)?(?:arbor\.st|arborlive\.stanford\.edu)\//i.test(trimmed)) {
      return new URL(`https://${trimmed}`);
    }
  } catch {
    return null;
  }
  return null;
}

/** Parses any scan input into a bare assetId and/or an arbor.st short-link slug. */
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

    if (ARBOR_ST_HOST_RE.test(url.hostname)) {
      const slug = url.pathname.replace(/^\/+|\/+$/g, "").split("/")[0] ?? "";
      if (slug && !slug.includes(".")) {
        return { assetId: null, shortLinkSlug: decodeURIComponent(slug) };
      }
    }

    return { assetId: null, shortLinkSlug: null };
  }

  const pathOnly = extractEquipmentIdFromPath(trimmed);
  if (pathOnly) {
    return {
      assetId: canonicalizeAssetIdTag(stripNoise(pathOnly)),
      shortLinkSlug: null,
    };
  }

  return {
    assetId: canonicalizeAssetIdTag(stripNoise(trimmed)),
    shortLinkSlug: null,
  };
}

/** Best-effort bare assetId from any scan input (URL, /e/{id}, bare tag). */
export function normalizeAssetScanInput(raw: string): string | null {
  return parseAssetScanInput(raw).assetId;
}

/** Candidate bare assetIds to try (canonical form + case variants). */
export function assetIdLookupCandidates(assetId: string): string[] {
  const base = stripNoise(assetId);
  if (!base) return [];
  const canonical = canonicalizeAssetIdTag(base);
  const candidates = [canonical, canonical.toUpperCase(), canonical.toLowerCase()];
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

/**
 * High-confidence "this is an asset tag / QR target" — ALE/numeric tags,
 * PREFIX-DIGITS (MIC-12), or an /e/… URL. Used to warn when a tag is typed
 * into the serial field.
 */
export function looksLikeAssetTag(raw: string): boolean {
  const trimmed = stripNoise(raw);
  if (!trimmed) return false;
  if (tryParseUrl(trimmed) || EQUIPMENT_PATH_RE.test(trimmed)) return true;
  // ALE-0123 / bare numeric ids (canonical asset tags)
  if (/^ALE[\s-]*\d+$/i.test(trimmed) || /^\d+$/.test(trimmed)) return true;
  // PREFIX-DIGITS e.g. MIC-12
  if (/^[A-Za-z]{2,8}-\d{2,}$/.test(trimmed)) return true;
  return false;
}

/**
 * High-confidence "this is a manufacturer serial" — long continuous mixed
 * alphanumerics without the hyphenated/numeric tag shape. Used to warn when a
 * serial lands in Asset ID.
 */
export function looksLikeSerialNumber(raw: string): boolean {
  const trimmed = stripNoise(raw);
  if (!trimmed) return false;
  if (looksLikeAssetTag(trimmed)) return false;
  // Continuous mixed alphanumerics, fairly long, no hyphens
  if (/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{10,}$/.test(trimmed)) return true;
  return false;
}
