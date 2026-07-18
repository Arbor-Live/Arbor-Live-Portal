import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type DbCtx = MutationCtx | QueryCtx;

export function normalizeVenueName(name: string) {
  return name.trim();
}

export function normalizeNicknames(nicknames: string[] | undefined): string[] | undefined {
  if (!nicknames) return undefined;
  const cleaned = nicknames.map((n) => n.trim()).filter(Boolean);
  if (cleaned.length === 0) return undefined;
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const nickname of cleaned) {
    const key = nickname.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(nickname);
  }
  return unique.length > 0 ? unique : undefined;
}

export async function buildVenuePath(
  ctx: DbCtx,
  name: string,
  parentId: Id<"venues"> | undefined,
): Promise<string> {
  if (!parentId) return name;
  const parent = await ctx.db.get(parentId);
  if (!parent) throw new Error("Parent venue not found.");
  return `${parent.path} > ${name}`;
}

export type VenueInheritedSource = {
  venueId: Id<"venues">;
  path: string;
  name: string;
};

export type VenueInheritedFields = {
  address?: { value: string; source: VenueInheritedSource };
  googleMapsUrl?: { value: string; source: VenueInheritedSource };
  contact?: {
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    source: VenueInheritedSource;
  };
  documentationLinks: Array<{
    title: string;
    url: string;
    source: VenueInheritedSource;
  }>;
  files: Array<{
    title: string;
    r2Key: string;
    fileName: string;
    contentType: string;
    source: VenueInheritedSource;
  }>;
};

function toInheritedSource(venue: Doc<"venues">): VenueInheritedSource {
  return { venueId: venue._id, path: venue.path, name: venue.name };
}

function hasContact(venue: Doc<"venues">) {
  return Boolean(
    venue.contactName?.trim() || venue.contactEmail?.trim() || venue.contactPhone?.trim(),
  );
}

/** Walk parent → … → root. Nearest parent first. */
export async function loadVenueAncestors(
  ctx: DbCtx,
  parentId: Id<"venues"> | undefined,
): Promise<Doc<"venues">[]> {
  const ancestors: Doc<"venues">[] = [];
  let pointerId: Id<"venues"> | undefined = parentId;
  const seen = new Set<string>();
  while (pointerId) {
    if (seen.has(pointerId)) break;
    seen.add(pointerId);
    const current: Doc<"venues"> | null = await ctx.db.get(pointerId);
    if (!current) break;
    ancestors.push(current);
    pointerId = current.parentId;
  }
  return ancestors;
}

/**
 * Fields inherited from ancestors when the venue itself has no value.
 * Address / maps / contact: nearest ancestor with a value.
 * Links / files: all ancestors from root → nearest (then callers append own).
 */
export async function resolveInheritedVenueFields(
  ctx: DbCtx,
  parentId: Id<"venues"> | undefined,
): Promise<VenueInheritedFields> {
  const ancestors = await loadVenueAncestors(ctx, parentId);
  const result: VenueInheritedFields = {
    documentationLinks: [],
    files: [],
  };

  for (const ancestor of ancestors) {
    if (!result.address && ancestor.address?.trim()) {
      result.address = {
        value: ancestor.address,
        source: toInheritedSource(ancestor),
      };
    }
    if (!result.googleMapsUrl && ancestor.googleMapsUrl?.trim()) {
      result.googleMapsUrl = {
        value: ancestor.googleMapsUrl,
        source: toInheritedSource(ancestor),
      };
    }
    if (!result.contact && hasContact(ancestor)) {
      result.contact = {
        contactName: ancestor.contactName,
        contactEmail: ancestor.contactEmail,
        contactPhone: ancestor.contactPhone,
        source: toInheritedSource(ancestor),
      };
    }
  }

  // Root → nearest so building-level docs appear before nested overrides' parents.
  for (const ancestor of [...ancestors].reverse()) {
    const source = toInheritedSource(ancestor);
    for (const link of ancestor.documentationLinks ?? []) {
      result.documentationLinks.push({ ...link, source });
    }
    for (const file of ancestor.files ?? []) {
      result.files.push({ ...file, source });
    }
  }

  return result;
}

export async function resolveEffectiveVenueAddress(
  ctx: DbCtx,
  venue: Doc<"venues">,
): Promise<string | undefined> {
  if (venue.address?.trim()) return venue.address;
  const inherited = await resolveInheritedVenueFields(ctx, venue.parentId);
  return inherited.address?.value;
}

export async function resolveVenueLink(
  ctx: DbCtx,
  venueId: Id<"venues"> | null | undefined,
): Promise<{ venueId: Id<"venues"> | undefined; venueName: string | undefined; venueAddress: string | undefined }> {
  if (!venueId) {
    return { venueId: undefined, venueName: undefined, venueAddress: undefined };
  }
  const venue = await ctx.db.get(venueId);
  if (!venue) throw new Error("Venue not found.");
  return {
    venueId: venue._id,
    venueName: venue.path,
    venueAddress: await resolveEffectiveVenueAddress(ctx, venue),
  };
}

export async function isVenueDescendant(
  ctx: DbCtx,
  candidateParentId: Id<"venues">,
  currentId: Id<"venues">,
): Promise<boolean> {
  let pointerId: Id<"venues"> | undefined = candidateParentId;
  while (pointerId) {
    if (pointerId === currentId) return true;
    const current: Doc<"venues"> | null = await ctx.db.get(pointerId);
    pointerId = current?.parentId;
  }
  return false;
}

export async function syncDenormalizedVenueName(
  ctx: MutationCtx,
  venueId: Id<"venues">,
  venueName: string,
): Promise<void> {
  const events = await ctx.db
    .query("events")
    .withIndex("by_venueId", (q) => q.eq("venueId", venueId))
    .take(500);
  for (const event of events) {
    if (event.venueName === venueName) continue;
    await ctx.db.patch(event._id, { venueName, updatedAt: Date.now() });
  }

  const seriesRows = await ctx.db
    .query("eventSeries")
    .withIndex("by_venueId", (q) => q.eq("venueId", venueId))
    .take(500);
  for (const series of seriesRows) {
    if (series.venueName === venueName) continue;
    await ctx.db.patch(series._id, { venueName, updatedAt: Date.now() });
  }

  const requests = await ctx.db
    .query("eventRequests")
    .withIndex("by_venueId", (q) => q.eq("venueId", venueId))
    .take(500);
  for (const request of requests) {
    const venue = await ctx.db.get(venueId);
    const venueAddress = venue ? await resolveEffectiveVenueAddress(ctx, venue) : undefined;
    await ctx.db.patch(request._id, {
      venueName,
      venueAddress,
      updatedAt: Date.now(),
    });
  }
}
