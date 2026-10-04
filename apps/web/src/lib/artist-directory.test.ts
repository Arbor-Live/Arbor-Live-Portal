import { describe, expect, it } from "vitest";
import {
  artistDirectoryPeople,
  matchArtistDirectoryEntry,
  phoneDigits,
  type ArtistDirectoryEntry,
} from "./artist-directory";

const LARKS: ArtistDirectoryEntry = {
  name: "The Larks",
  oneLiner: "Harmony-heavy folk",
  genres: ["Folk"],
  mainContactName: "Jane Doe",
  mainContactEmail: "jane@example.com",
  mainContactPhone: "(650) 555-0101",
  payeeName: "Sam Payee",
  payeeEmail: "sam@example.com",
  members: [{ name: "Alex Kim", email: "alex@example.com", phone: "+1 408 555 0199", bandRole: "Drums" }],
  bandMembers: ["Riley Stone", " "],
};

describe("phoneDigits", () => {
  it("keeps digits and drops a US country code", () => {
    expect(phoneDigits("+1 (650) 555-0101")).toBe("6505550101");
    expect(phoneDigits("650.555.0101")).toBe("6505550101");
  });
});

describe("artistDirectoryPeople", () => {
  it("lists the contact first, then members, payee and listed names", () => {
    expect(artistDirectoryPeople(LARKS).map((person) => [person.name, person.source])).toEqual([
      ["Jane Doe", "contact"],
      ["Alex Kim", "member"],
      ["Sam Payee", "payee"],
      ["Riley Stone", "listed"],
    ]);
  });
});

describe("matchArtistDirectoryEntry", () => {
  it("matches everything on an empty query", () => {
    expect(matchArtistDirectoryEntry(LARKS, "  ")).toEqual({ person: null });
  });

  it("matches the act by name or genre without naming a person", () => {
    expect(matchArtistDirectoryEntry(LARKS, "larks")).toEqual({ person: null });
    expect(matchArtistDirectoryEntry(LARKS, "folk")).toEqual({ person: null });
  });

  it("names the person a search found", () => {
    expect(matchArtistDirectoryEntry(LARKS, "alex")?.person?.name).toBe("Alex Kim");
    expect(matchArtistDirectoryEntry(LARKS, "riley")?.person?.source).toBe("listed");
    expect(matchArtistDirectoryEntry(LARKS, "sam@")?.person?.role).toBe("Payee");
  });

  it("matches phone numbers however they are typed", () => {
    expect(matchArtistDirectoryEntry(LARKS, "650-555-0101")?.person?.name).toBe("Jane Doe");
    expect(matchArtistDirectoryEntry(LARKS, "+14085550199")?.person?.name).toBe("Alex Kim");
    expect(matchArtistDirectoryEntry(LARKS, "0199")?.person?.name).toBe("Alex Kim");
  });

  it("doesn't treat digits inside a text query as a phone number", () => {
    expect(matchArtistDirectoryEntry(LARKS, "larks 0199")).toBeNull();
  });

  it("ignores short digit runs and misses", () => {
    expect(matchArtistDirectoryEntry(LARKS, "55")).toBeNull();
    expect(matchArtistDirectoryEntry(LARKS, "nobody")).toBeNull();
  });
});
