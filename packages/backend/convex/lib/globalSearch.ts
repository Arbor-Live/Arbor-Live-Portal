import { isArtistOrganizationType } from "./organizationType";

/** Pure matching for the ⌘K global search (`convex/globalSearch.ts`). */

export type SearchOrganizationRow = { id?: string; _id?: string; name?: string; slug?: string };
export type SearchArtistProfile = {
  organizationId: string;
  organizationType: string;
  displayName?: string;
  status?: string;
};

function isArborOrganization(org: SearchOrganizationRow) {
  const name = (org.name ?? "").trim().toLowerCase();
  const slug = (org.slug ?? "").trim().toLowerCase();
  return name === "arbor live" || slug === "arbor-live";
}

/**
 * Artists whose name contains `lowered`, named and filtered as the artist
 * directory does: the profile's display name wins, archived acts are hidden,
 * and an org with no profile reads as a band.
 */
export function matchArtists(
  organizations: SearchOrganizationRow[],
  profiles: SearchArtistProfile[],
  lowered: string,
  limit: number,
): Array<{ organizationId: string; name: string }> {
  const profileByOrgId = new Map(profiles.map((profile) => [profile.organizationId, profile]));
  return organizations
    .filter((org) => !isArborOrganization(org))
    .flatMap((org) => {
      const organizationId = org.id ?? org._id ?? "";
      if (!organizationId) return [];
      const profile = profileByOrgId.get(organizationId);
      if (!isArtistOrganizationType(profile?.organizationType ?? "band")) return [];
      if (profile?.status === "archived") return [];
      const name = (profile?.displayName ?? org.name ?? "").trim() || "Artist";
      return name.toLowerCase().includes(lowered) ? [{ organizationId, name }] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, limit);
}
