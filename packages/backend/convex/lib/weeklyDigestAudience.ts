import { isArtistOrganizationType } from "./organizationType";

/** How an organization counts for the weekly digest audience. */
export type DigestOrgKind = "arbor_internal" | "artist" | "unknown";

export type DigestOrganization = {
  organizationId: string;
  kind: DigestOrgKind;
  /**
   * Artist orgs that should contribute shows and onboarding rows.
   * Retired bands still count as artist membership so a band org admin is not
   * treated as a portal admin, but they do not generate digest sections.
   */
  includeInArtistDigest: boolean;
};

export type WeeklyDigestAudience = {
  /** Availability, crew shifts, timecards, and assigned post-event work. */
  staffSections: boolean;
  /**
   * Booking requests and artist payouts. Other people's unsubmitted reviews
   * are not a personal to-do and stay off the digest.
   * Band org admins share Better Auth `role: "admin"` with portal admins;
   * that role alone must not open these queues.
   */
  adminQueues: boolean;
  artistOrganizationIds: string[];
};

const RETIRED_ARTIST_STATUSES = new Set(["disbanded", "inactive", "archived"]);

/**
 * Classify an org for digest routing. Missing `organizationType` falls back to
 * the Arbor Live name/slug, then treats any other named org as an artist org.
 */
export function classifyDigestOrganization(args: {
  organizationType?: string | null;
  name?: string | null;
  slug?: string | null;
}): DigestOrgKind {
  if (args.organizationType === "arbor_internal") return "arbor_internal";
  if (isArtistOrganizationType(args.organizationType)) return "artist";

  const name = (args.name ?? "").trim().toLowerCase();
  const slug = (args.slug ?? "").trim().toLowerCase();
  if (name === "arbor live" || slug === "arbor-live") return "arbor_internal";
  if (args.organizationType) return "unknown";
  if (name || slug) return "artist";
  return "unknown";
}

export function artistDigestIncluded(status: string | null | undefined): boolean {
  const normalized = (status ?? "").trim().toLowerCase();
  if (!normalized) return true;
  return !RETIRED_ARTIST_STATUSES.has(normalized);
}

/**
 * Who receives which weekly-digest sections.
 *
 * Artist-only people (band/DJ/etc. members who are not Arbor staff) do not get
 * crew sections or portal-admin queues. Everyone else keeps the staff digest;
 * real portal admins are Arbor members (or legacy admins with no artist org).
 */
export function resolveWeeklyDigestAudience(args: {
  authRole: string | null | undefined;
  organizations: DigestOrganization[];
  isStaff: boolean;
}): WeeklyDigestAudience {
  const artistOrgs = args.organizations.filter((org) => org.kind === "artist");
  const isArborMember = args.organizations.some((org) => org.kind === "arbor_internal");
  const artistOnly = artistOrgs.length > 0 && !isArborMember && !args.isStaff;
  const artistOrganizationIds = [
    ...new Set(
      artistOrgs
        .filter((org) => org.includeInArtistDigest)
        .map((org) => org.organizationId),
    ),
  ];

  return {
    staffSections: !artistOnly,
    adminQueues: args.authRole === "admin" && !artistOnly,
    artistOrganizationIds,
  };
}
