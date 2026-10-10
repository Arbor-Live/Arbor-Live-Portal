import { describe, expect, it } from "vitest";
import { matchArtists } from "./globalSearch";

describe("matchArtists", () => {
  const organizations = [
    { id: "arbor", name: "Arbor Live", slug: "arbor-live" },
    { id: "b1", name: "the band org" },
    { id: "b2", name: "Archived Blues" },
    { id: "b3", name: "Blue Moon Trio" },
    { _id: "b4", name: "DJ Bluebird" },
  ];
  const profiles = [
    { organizationId: "arbor", organizationType: "arbor_internal" },
    { organizationId: "b1", organizationType: "band", displayName: "Blues Brothers" },
    { organizationId: "b2", organizationType: "band", status: "archived" },
    { organizationId: "b4", organizationType: "dj" },
  ];

  it("matches the display name, hides archived acts and Arbor Live, and sorts by name", () => {
    expect(matchArtists(organizations, profiles, "blu", 10)).toEqual([
      { organizationId: "b3", name: "Blue Moon Trio" },
      { organizationId: "b1", name: "Blues Brothers" },
      { organizationId: "b4", name: "DJ Bluebird" },
    ]);
    expect(matchArtists(organizations, profiles, "band org", 10)).toEqual([]);
    expect(matchArtists(organizations, profiles, "arbor", 10)).toEqual([]);
  });

  it("caps the result count", () => {
    expect(matchArtists(organizations, profiles, "blu", 2)).toHaveLength(2);
  });
});
