import { describe, expect, it } from "vitest";
import { normalizeAlertRecipients } from "./alertRecipients";

describe("normalizeAlertRecipients", () => {
  it("trims, lowercases, and dedupes", () => {
    expect(normalizeAlertRecipients([" A@x.com ", "a@x.com", "b@y.com"])).toEqual([
      "a@x.com",
      "b@y.com",
    ]);
  });

  it("rejects malformed addresses", () => {
    expect(() => normalizeAlertRecipients(["nope"])).toThrow(/not a valid email/);
  });

  it("rejects oversized lists with a named limit", () => {
    const many = Array.from({ length: 26 }, (_, index) => `user${index}@example.com`);
    expect(() => normalizeAlertRecipients(many)).toThrow(/Too many recipients \(max 25, got 26\)/);
  });
});
