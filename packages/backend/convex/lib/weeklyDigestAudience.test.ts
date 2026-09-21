import { describe, expect, it } from "vitest";
import {
  artistDigestIncluded,
  classifyDigestOrganization,
  resolveWeeklyDigestAudience,
  type DigestOrganization,
} from "./weeklyDigestAudience";

function org(
  organizationId: string,
  kind: DigestOrganization["kind"],
  includeInArtistDigest = kind === "artist",
): DigestOrganization {
  return { organizationId, kind, includeInArtistDigest };
}

describe("classifyDigestOrganization", () => {
  it("treats artist organization types as artist orgs", () => {
    expect(classifyDigestOrganization({ organizationType: "band" })).toBe("artist");
    expect(classifyDigestOrganization({ organizationType: "dj" })).toBe("artist");
    expect(classifyDigestOrganization({ organizationType: "singer_songwriter" })).toBe("artist");
  });

  it("recognizes Arbor Live when the profile type is missing", () => {
    expect(
      classifyDigestOrganization({ name: "Arbor Live", slug: "something-else" }),
    ).toBe("arbor_internal");
    expect(classifyDigestOrganization({ slug: "arbor-live" })).toBe("arbor_internal");
  });

  it("treats an untyped named org as an artist org", () => {
    expect(classifyDigestOrganization({ name: "The Quiet Hours" })).toBe("artist");
  });
});

describe("artistDigestIncluded", () => {
  it("drops retired artist orgs from digest content", () => {
    expect(artistDigestIncluded("active")).toBe(true);
    expect(artistDigestIncluded(undefined)).toBe(true);
    expect(artistDigestIncluded("disbanded")).toBe(false);
    expect(artistDigestIncluded("Archived")).toBe(false);
    expect(artistDigestIncluded("inactive")).toBe(false);
  });
});

describe("resolveWeeklyDigestAudience", () => {
  it("does not give band org admins portal queues or crew sections", () => {
    const audience = resolveWeeklyDigestAudience({
      authRole: "admin",
      isStaff: false,
      organizations: [org("band-1", "artist")],
    });
    expect(audience).toEqual({
      staffSections: false,
      adminQueues: false,
      artistOrganizationIds: ["band-1"],
    });
  });

  it("keeps portal admins on staff sections and admin queues", () => {
    const audience = resolveWeeklyDigestAudience({
      authRole: "admin",
      isStaff: true,
      organizations: [org("arbor", "arbor_internal"), org("band-1", "artist")],
    });
    expect(audience.staffSections).toBe(true);
    expect(audience.adminQueues).toBe(true);
    expect(audience.artistOrganizationIds).toEqual(["band-1"]);
  });

  it("gives crew who are also in a band both staff and artist sections", () => {
    const audience = resolveWeeklyDigestAudience({
      authRole: "member",
      isStaff: true,
      organizations: [org("arbor", "arbor_internal"), org("band-1", "artist")],
    });
    expect(audience).toEqual({
      staffSections: true,
      adminQueues: false,
      artistOrganizationIds: ["band-1"],
    });
  });

  it("limits band members to their artist orgs", () => {
    const audience = resolveWeeklyDigestAudience({
      authRole: "member",
      isStaff: false,
      organizations: [org("band-1", "artist"), org("band-2", "artist")],
    });
    expect(audience.staffSections).toBe(false);
    expect(audience.adminQueues).toBe(false);
    expect(audience.artistOrganizationIds).toEqual(["band-1", "band-2"]);
  });

  it("still routes a legacy portal admin with no memberships to admin queues", () => {
    const audience = resolveWeeklyDigestAudience({
      authRole: "admin",
      isStaff: false,
      organizations: [],
    });
    expect(audience.staffSections).toBe(true);
    expect(audience.adminQueues).toBe(true);
  });

  it("does not revive admin queues for a retired band's org admin", () => {
    const audience = resolveWeeklyDigestAudience({
      authRole: "admin",
      isStaff: false,
      organizations: [org("band-1", "artist", false)],
    });
    expect(audience.staffSections).toBe(false);
    expect(audience.adminQueues).toBe(false);
    expect(audience.artistOrganizationIds).toEqual([]);
  });
});
