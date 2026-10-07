import { describe, expect, it } from "vitest";
import {
  assetIdLookupCandidates,
  assetSearchVariants,
  canonicalizeAssetIdTag,
  classifyLabelScan,
  describeScan,
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

  it("routes bulk label reads: our tags to Asset ID, other codes to Serial", () => {
    expect(classifyLabelScan("https://arbor.st/e/ALE-0123")).toBe("assetId");
    expect(classifyLabelScan("arbor.st/e/41")).toBe("assetId");
    expect(classifyLabelScan("ALE-0041")).toBe("assetId");
    expect(classifyLabelScan("0041")).toBe("assetId");
    expect(classifyLabelScan("SN8834KX19")).toBe("serialNumber");
    expect(classifyLabelScan("MIC-12")).toBe("serialNumber");
    expect(classifyLabelScan("012345678905")).toBe("serialNumber");
  });

  it("offers the bare asset id as a search variant for tags and links", () => {
    expect(assetSearchVariants("ALE-0041")).toEqual(["41"]);
    expect(assetSearchVariants("https://arbor.st/e/ALE-0041")).toEqual(["41"]);
    expect(assetSearchVariants("41")).toEqual([]);
    expect(assetSearchVariants("https://example.com/x")).toEqual([]);
  });

  it("labels a read by the asset id inside a link, other reads as-is", () => {
    expect(describeScan("https://arbor.st/e/ALE-0099")).toBe("99");
    expect(describeScan("https://arbor.st/packout-a")).toBe("https://arbor.st/packout-a");
    expect(describeScan("ALE-0041")).toBe("ALE-0041");
    expect(describeScan("SN8834KX19")).toBe("SN8834KX19");
  });
});
