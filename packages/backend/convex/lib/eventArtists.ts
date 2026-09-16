import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { findAuthOrganizationById } from "./auth";
import {
  buildArtistLinks,
  resolvePublicHeroImageUrl,
  type PublicArtistLink,
} from "./publicArtistProfile";

export type EventArtist = {
  organizationId: string;
  name: string;
  role: "headliner" | "support" | "other";
  /** Set only when the artist is publicly listed. */
  slug?: string;
  genres: string[];
  oneLiner?: string;
  imageUrl?: string;
  links: PublicArtistLink[];
};

const ROLE_ORDER: Record<EventArtist["role"], number> = {
  headliner: 0,
  support: 1,
  other: 2,
};

/**
 * Performers assigned to an event, ordered headliner → support → other. Public
 * fields (slug, image, links) are only surfaced for artists that opted into the
 * public directory.
 */
export async function getEventArtists(
  ctx: QueryCtx,
  eventId: Id<"events">,
): Promise<EventArtist[]> {
  const participations = await ctx.db
    .query("eventBandParticipations")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(50);
  if (!participations.length) return [];

  const artists = await Promise.all(
    participations.map(async (row): Promise<EventArtist> => {
      const profile = await ctx.db
        .query("organizationProfiles")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", row.organizationId))
        .unique();
      const isPublic =
        profile?.publicListing === true &&
        Boolean(profile.publicSlug?.trim()) &&
        profile.status !== "archived";

      let name = profile?.displayName?.trim();
      if (!name) {
        const org = await findAuthOrganizationById(ctx, row.organizationId);
        name = org?.name?.trim() || "Artist";
      }

      return {
        organizationId: row.organizationId,
        name,
        role: row.role,
        slug: isPublic ? profile!.publicSlug!.trim().toLowerCase() : undefined,
        genres: profile?.genres?.filter(Boolean) ?? [],
        oneLiner: isPublic ? profile?.oneLiner?.trim() || undefined : undefined,
        imageUrl: isPublic ? await resolvePublicHeroImageUrl(profile?.publicHeroImageUrl) : undefined,
        links: isPublic && profile ? buildArtistLinks(profile) : [],
      };
    }),
  );

  return artists.sort(
    (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name),
  );
}
