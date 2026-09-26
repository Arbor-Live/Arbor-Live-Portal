import { describe, expect, it } from "vitest";
import {
  assetIdLookupCandidates,
  canonicalizeAssetIdTag,
  normalizeAssetScanInput,
  parseAssetScanInput,
} from "./asset-scan";

describe("client asset-scan twin", () => {
  it("matches backend canonicalize behavior", () => {
    expect(canonicalizeAssetIdTag("ALE-0123")).toBe("123");
    expect(canonicalizeAssetIdTag("0123")).toBe("123");
    expect(canonicalizeAssetIdTag("S100234")).toBe("S100234");
  });

  it("extracts ids from QR URLs without returning the raw link", () => {
    expect(normalizeAssetScanInput("https://arbor.st/e/ALE-0123")).toBe("123");
    expect(normalizeAssetScanInput("https://example.com/x")).toBeNull();
  });

  it("parses arbor.st short-link slugs without /e/", () => {
    expect(parseAssetScanInput("https://arbor.st/packout-a")).toEqual({
      assetId: null,
      shortLinkSlug: "packout-a",
    });
    expect(parseAssetScanInput("https://example.com/other")).toEqual({
      assetId: null,
      shortLinkSlug: null,
    });
  });

  it("keeps malformed percent-encoded short-link slugs instead of throwing", () => {
    expect(parseAssetScanInput("https://arbor.st/%E0%A4%A")).toEqual({
      assetId: null,
      shortLinkSlug: "%E0%A4%A",
    });
  });

  it("lookup candidates stay on the canonical form", () => {
    expect(assetIdLookupCandidates("ALE-0123")).toEqual(["123"]);
    expect(assetIdLookupCandidates("123").some((c) => c.startsWith("ALE-"))).toBe(false);
  });
});
