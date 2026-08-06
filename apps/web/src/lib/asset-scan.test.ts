import { describe, expect, it } from "vitest";
import {
  assetIdLookupCandidates,
  canonicalizeAssetIdTag,
  normalizeAssetScanInput,
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

  it("lookup candidates stay on the canonical form", () => {
    expect(assetIdLookupCandidates("ALE-0123")).toEqual(["123"]);
    expect(assetIdLookupCandidates("123").some((c) => c.startsWith("ALE-"))).toBe(false);
  });
});
