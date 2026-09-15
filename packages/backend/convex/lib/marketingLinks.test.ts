import { describe, expect, it } from "vitest";
import {
  isPartifulUrl,
  linksIncludePartiful,
  normalizeMarketingLinks,
  normalizeOptionalUrl,
} from "./marketingLinks";

describe("marketingLinks", () => {
  it("detects partiful hosts", () => {
    expect(isPartifulUrl("https://partiful.com/e/abc")).toBe(true);
    expect(isPartifulUrl("partiful.com/e/abc")).toBe(true);
    expect(isPartifulUrl("https://www.partiful.com/e/abc")).toBe(true);
    expect(isPartifulUrl("https://instagram.com/arbor")).toBe(false);
  });

  it("normalizes links and optional icons", () => {
    expect(
      normalizeMarketingLinks([
        { label: "  RSVP ", url: " https://partiful.com/e/x ", icon: " partiful " },
        { label: "", url: "https://example.com" },
        { label: "Site", url: "https://example.com", icon: "" },
      ]),
    ).toEqual([
      { label: "RSVP", url: "https://partiful.com/e/x", icon: "partiful" },
      { label: "Site", url: "https://example.com" },
    ]);
  });

  it("normalizes optional urls", () => {
    expect(normalizeOptionalUrl("  ")).toBeUndefined();
    expect(normalizeOptionalUrl(" https://x ")).toBe("https://x");
  });

  it("detects partiful among links", () => {
    expect(linksIncludePartiful([{ url: "https://example.com" }])).toBe(false);
    expect(
      linksIncludePartiful([
        { url: "https://example.com" },
        { url: "https://partiful.com/e/1" },
      ]),
    ).toBe(true);
  });
});
