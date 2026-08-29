import { describe, expect, it } from "vitest";
import { normalizeUsername, usernameFromEmail } from "./username";

describe("normalizeUsername", () => {
  it("lowercases and accepts valid handles", () => {
    expect(normalizeUsername("Jane_Doe")).toBe("jane_doe");
    expect(normalizeUsername("  abc  ")).toBe("abc");
  });

  it("treats blank as unset", () => {
    expect(normalizeUsername("")).toBeUndefined();
    expect(normalizeUsername("   ")).toBeUndefined();
    expect(normalizeUsername(null)).toBeUndefined();
  });

  it("rejects invalid handles", () => {
    expect(() => normalizeUsername("ab")).toThrow(/3–30/);
    expect(() => normalizeUsername("Jane Doe")).toThrow(/lowercase/);
    expect(() => normalizeUsername("jane-doe")).toThrow(/lowercase/);
  });
});

describe("usernameFromEmail", () => {
  it("derives a handle from the local part", () => {
    expect(usernameFromEmail("e2e-crew@arborlive.test")).toBe("e2e_crew");
    expect(usernameFromEmail("Jane.Doe+tag@example.com")).toBe("jane_doe_tag");
  });
});
