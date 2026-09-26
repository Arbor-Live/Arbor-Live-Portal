import { describe, expect, it } from "vitest";
import { isArtistOrgAdminRole } from "../users";

describe("isArtistOrgAdminRole", () => {
  it("accepts the artist-admin role strings stored on memberships", () => {
    expect(isArtistOrgAdminRole("org_admin")).toBe(true);
    expect(isArtistOrgAdminRole("admin")).toBe(true);
    expect(isArtistOrgAdminRole("owner")).toBe(true);
  });

  it("rejects members and empty roles", () => {
    expect(isArtistOrgAdminRole("org_member")).toBe(false);
    expect(isArtistOrgAdminRole("member")).toBe(false);
    expect(isArtistOrgAdminRole(undefined)).toBe(false);
  });
});
