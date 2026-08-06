import { describe, expect, it } from "vitest";
import {
  assetIdLookupCandidates,
  canonicalizeAssetIdTag,
  normalizeAssetScanInput,
  parseAssetScanInput,
} from "./assetScan";

describe("canonicalizeAssetIdTag", () => {
  it("strips ALE prefix and zero-padding", () => {
    expect(canonicalizeAssetIdTag("ALE-0123")).toBe("123");
    expect(canonicalizeAssetIdTag("ale-0041")).toBe("41");
    expect(canonicalizeAssetIdTag("ALE 0007")).toBe("7");
  });

  it("strips leading zeros from pure numeric tags", () => {
    expect(canonicalizeAssetIdTag("0123")).toBe("123");
    expect(canonicalizeAssetIdTag("0000")).toBe("0");
    expect(canonicalizeAssetIdTag("0")).toBe("0");
    expect(canonicalizeAssetIdTag("123")).toBe("123");
  });

  it("leaves non-numeric tags unchanged", () => {
    expect(canonicalizeAssetIdTag("S100234")).toBe("S100234");
    expect(canonicalizeAssetIdTag("ALE-ABC")).toBe("ALE-ABC");
    expect(canonicalizeAssetIdTag("CASE-01")).toBe("CASE-01");
  });
});

describe("normalizeAssetScanInput / parseAssetScanInput", () => {
  it("extracts and canonicalizes /e/{id} URLs", () => {
    expect(normalizeAssetScanInput("https://arbor.st/e/ALE-0123")).toBe("123");
    expect(normalizeAssetScanInput("https://arbor.st/e/0123")).toBe("123");
    expect(normalizeAssetScanInput("arbor.st/e/41")).toBe("41");
    expect(normalizeAssetScanInput("https://arborlive.stanford.edu/e/ALE-0041")).toBe("41");
    expect(normalizeAssetScanInput("/e/0123")).toBe("123");
  });

  it("canonicalizes bare tags", () => {
    expect(normalizeAssetScanInput("ALE-0123")).toBe("123");
    expect(normalizeAssetScanInput("  0123  ")).toBe("123");
    expect(normalizeAssetScanInput("S100234")).toBe("S100234");
  });

  it("returns null for unrecognized URLs (does not pass the raw link through)", () => {
    expect(normalizeAssetScanInput("https://example.com/other")).toBeNull();
    expect(parseAssetScanInput("https://example.com/other")).toEqual({
      assetId: null,
      shortLinkSlug: null,
    });
  });

  it("parses arbor.st short-link slugs without /e/", () => {
    expect(parseAssetScanInput("https://arbor.st/packout-a")).toEqual({
      assetId: null,
      shortLinkSlug: "packout-a",
    });
  });

  it("returns null for empty input", () => {
    expect(normalizeAssetScanInput("")).toBeNull();
    expect(normalizeAssetScanInput("   ")).toBeNull();
  });
});

describe("assetIdLookupCandidates", () => {
  it("returns the canonical id and case variants only", () => {
    expect(assetIdLookupCandidates("ALE-0123")).toEqual(["123"]);
    expect(assetIdLookupCandidates("Abc")).toEqual(["Abc", "ABC", "abc"]);
  });

  it("does not invent padded or ALE-prefixed legacy forms", () => {
    const candidates = assetIdLookupCandidates("123");
    expect(candidates).toEqual(["123"]);
    expect(candidates.some((c) => c.startsWith("ALE-"))).toBe(false);
    expect(candidates.some((c) => /^0+\d+$/.test(c))).toBe(false);
  });
});
