import { describe, expect, it } from "vitest";
import {
  collectR2KeysFromLexicalContentJson,
  collectR2KeysFromResourceLinks,
  diffReleasedR2Keys,
  isWithinOrphanGracePeriod,
  keysToReleaseIfUnreferenced,
  r2KeyFromReference,
  r2KeyFromStoredValue,
} from "./r2Lifecycle";

describe("r2KeyFromReference", () => {
  it("parses r2-prefixed refs", () => {
    expect(r2KeyFromReference("r2:inventory/packages/pkg/hero/uuid-photo.jpg")).toBe(
      "inventory/packages/pkg/hero/uuid-photo.jpg",
    );
  });

  it("ignores external URLs", () => {
    expect(r2KeyFromReference("https://example.com/photo.jpg")).toBeUndefined();
  });
});

describe("r2KeyFromStoredValue", () => {
  it("accepts bare venue keys", () => {
    expect(r2KeyFromStoredValue("venues/abc/documents/uuid-file.pdf")).toBe(
      "venues/abc/documents/uuid-file.pdf",
    );
  });
});

describe("collectR2KeysFromResourceLinks", () => {
  it("collects r2 manual links only", () => {
    expect(
      collectR2KeysFromResourceLinks([
        { url: "r2:inventory/types/t/manuals/a-manual.pdf" },
        { url: "https://vendor.example/manual.pdf" },
      ]),
    ).toEqual(["inventory/types/t/manuals/a-manual.pdf"]);
  });
});

describe("collectR2KeysFromLexicalContentJson", () => {
  it("walks nested image nodes", () => {
    const contentJson = JSON.stringify({
      root: {
        type: "root",
        children: [
          {
            type: "paragraph",
            children: [
              {
                type: "image",
                src: "r2:marketing/posts/p/content/uuid-img.png",
              },
            ],
          },
        ],
      },
    });

    expect(collectR2KeysFromLexicalContentJson(contentJson)).toEqual([
      "marketing/posts/p/content/uuid-img.png",
    ]);
  });
});

describe("diffReleasedR2Keys", () => {
  it("returns keys removed from the after set", () => {
    expect(diffReleasedR2Keys(["a", "b"], ["b", "c"])).toEqual(["a"]);
  });
});

describe("keysToReleaseIfUnreferenced", () => {
  it("drops keys still referenced elsewhere", () => {
    const referenced = new Set(["shared-key", "kept-key"]);
    expect(keysToReleaseIfUnreferenced(["shared-key", "orphan-key"], referenced)).toEqual([
      "orphan-key",
    ]);
  });
});

describe("isWithinOrphanGracePeriod", () => {
  it("treats recent metadata as in grace", () => {
    const now = Date.parse("2026-08-29T12:00:00.000Z");
    expect(isWithinOrphanGracePeriod("2026-08-29T10:00:00.000Z", now)).toBe(true);
  });

  it("allows old metadata to be pruned", () => {
    const now = Date.parse("2026-08-29T12:00:00.000Z");
    expect(isWithinOrphanGracePeriod("2026-08-01T10:00:00.000Z", now)).toBe(false);
  });
});
