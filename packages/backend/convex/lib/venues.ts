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
    venueAddress: venue.address,
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
    await ctx.db.patch(request._id, {
      venueName,
      venueAddress: venue?.address,
      updatedAt: Date.now(),
    });
  }
}
