import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { findAuthOrganizationById } from "./auth";
import {
  buildArtistLinks,
  resolvePublicHeroImageUrl,
  type PublicArtistLink,
} from "./publicArtistProfile";

export type EventArtist = {
  /** Stable React key: the act, or the position for outside acts and open slots. */
  key: string;
  /**
   * `act`: an artist on the platform. `outside`: an act not on the platform,
   * named on its position. `tba`: a position nobody fills yet.
   */
  kind: "act" | "outside" | "tba";
  /** Platform acts only. */
  organizationId?: string;
  name: string;
  role: "headliner" | "support" | "other";
  /** Set only when the artist is publicly listed. */
  slug?: string;
  organizationType: "band" | "dj" | "singer_songwriter" | "other";
  genres: string[];
  oneLiner?: string;
  imageUrl?: string;
  links: PublicArtistLink[];
  /** Performance time, when the Run of Show has one. */
  setStartsAt?: number;
  setEndsAt?: number;
};

const ROLE_ORDER: Record<EventArtist["role"], number> = {
  headliner: 0,
  support: 1,
  other: 2,
};

/** Positions and bookings are bounded per event; these caps match the Lineup tab. */
const MAX_POSITIONS = 100;
const MAX_PARTICIPATIONS = 50;

/**
 * The event's bill, in show order (by set time; unscheduled entries after, in
 * bill order): platform acts, outside acts named on a position, and open
 * positions ("to be announced"). Public fields (slug, image, links) are only
 * surfaced for artists that opted into the public directory.
 */
export async function getEventArtists(
  ctx: QueryCtx,
  eventId: Id<"events">,
): Promise<EventArtist[]> {
  const [positions, participations] = await Promise.all([
    ctx.db
      .query("eventArtistNeeds")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .take(MAX_POSITIONS),
    ctx.db
      .query("eventBandParticipations")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .take(MAX_PARTICIPATIONS),
  ]);
  if (!positions.length && !participations.length) return [];

  const actByPosition = new Map(
    participations.flatMap((row) => (row.needId ? [[row.needId, row] as const] : [])),
  );
  const positionIds = new Set(positions.map((position) => position._id));

  async function actEntry(row: (typeof participations)[number]): Promise<EventArtist> {
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
      key: `act:${row.organizationId}`,
      kind: "act",
      organizationId: row.organizationId,
      name,
      role: row.role,
      slug: isPublic ? profile!.publicSlug!.trim().toLowerCase() : undefined,
      organizationType:
        profile?.organizationType && profile.organizationType !== "arbor_internal"
          ? profile.organizationType
          : "other",
      genres: profile?.genres?.filter(Boolean) ?? [],
      oneLiner: isPublic ? profile?.oneLiner?.trim() || undefined : undefined,
      imageUrl: isPublic ? await resolvePublicHeroImageUrl(profile?.publicHeroImageUrl) : undefined,
      links: isPublic && profile ? buildArtistLinks(profile) : [],
      setStartsAt: row.setStartsAt,
      setEndsAt: row.setEndsAt,
    };
  }

  const entries: Array<{ artist: EventArtist; billOrder: number }> = [];
  const orderedPositions = [...positions].sort(
    (a, b) =>
      (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
      a.createdAt - b.createdAt,
  );
  for (const [billOrder, position] of orderedPositions.entries()) {
    const act = actByPosition.get(position._id);
    if (act) {
      entries.push({ artist: await actEntry(act), billOrder });
      continue;
    }
    const outside = position.externalArtistName?.trim();
    entries.push({
      billOrder,
      artist: {
        key: `position:${position._id}`,
        kind: outside ? "outside" : "tba",
        name: outside || position.label?.trim() || "To be announced",
        role: "other",
        organizationType:
          position.artistType === "band" || position.artistType === "dj" ? position.artistType : "other",
        genres: [],
        links: [],
        setStartsAt: position.setStartsAt,
        setEndsAt: position.setEndsAt,
      },
    });
  }
  // Acts not in a position yet (every act normally has one) go after the bill.
  for (const row of participations) {
    if (row.needId && positionIds.has(row.needId)) continue;
    entries.push({ artist: await actEntry(row), billOrder: positions.length + ROLE_ORDER[row.role] });
  }

  return entries
    .sort(
      (a, b) =>
        (a.artist.setStartsAt ?? Number.POSITIVE_INFINITY) -
          (b.artist.setStartsAt ?? Number.POSITIVE_INFINITY) || a.billOrder - b.billOrder,
    )
    .map(({ artist }) => artist);
}
