import { v } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { resolveStoredR2AssetUrl } from "./inventoryR2";
import {
  buildPublicEventUrl,
  isOpenMicSignupOpen,
  isPublicListableEventStatus,
  isPubliclyListableEvent,
  isUpcomingEvent,
  isWithinDays,
} from "./lib/publicEvents";
import { isPublicSiteListableVisibility } from "./lib/eventVisibility";
import { SITE_URL } from "./email/constants";
import { loadEventHostDisplay } from "./lib/hostOrgs";

const publicEventLinkValue = v.object({
  label: v.string(),
  url: v.string(),
});

const publicEventCardValue = v.object({
  eventId: v.id("events"),
  title: v.string(),
  startAt: v.number(),
  endAt: v.number(),
  venueName: v.optional(v.string()),
  venueAddress: v.optional(v.string()),
  googleMapsUrl: v.optional(v.string()),
  host: v.optional(v.string()),
  additionalHosts: v.array(v.string()),
  posterImageUrl: v.optional(v.string()),
  caption: v.optional(v.string()),
  publicEventUrl: v.string(),
  additionalLinks: v.array(publicEventLinkValue),
  /** Present when the event's Open Mic add-on is accepting public sign-ups. */
  openMicSignupUrl: v.optional(v.string()),
});

type DesignDoc = Doc<"eventMarketingDesigns">;

async function mapPublicEventCard(
  ctx: QueryCtx,
  event: Doc<"events">,
  design?: DesignDoc | null,
  venueAddress?: string,
  googleMapsUrl?: string,
) {
  const posterImageUrl = design?.imageUrl
    ? ((await resolveStoredR2AssetUrl(design.imageUrl)) ?? undefined)
    : undefined;
  const publicEventUrl = buildPublicEventUrl(String(event._id), SITE_URL);
  const hostDisplay = await loadEventHostDisplay(ctx, event);
  const openMicSignupUrl = isOpenMicSignupOpen(event, Date.now())
    ? `${SITE_URL}/open-mic`
    : undefined;
  return {
    eventId: event._id,
    title: event.title,
    startAt: event.startAt,
    endAt: event.endAt,
    venueName: event.venueName,
    venueAddress,
    googleMapsUrl,
    host: hostDisplay.hostLabel,
    additionalHosts: hostDisplay.additionalHosts,
    posterImageUrl,
    caption: design?.caption,
    publicEventUrl,
    additionalLinks: design?.additionalLinks ?? [],
    openMicSignupUrl,
  };
}

function isWebsiteVisibleDesign(design: DesignDoc) {
  return design.status === "published" || design.status === "ready";
}

async function loadWebsiteVisibleDesignsByEventId(ctx: QueryCtx) {
  const [published, ready] = await Promise.all([
    ctx.db
      .query("eventMarketingDesigns")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .take(500),
    ctx.db
      .query("eventMarketingDesigns")
      .withIndex("by_status", (q) => q.eq("status", "ready"))
      .take(500),
  ]);
  const byEventId = new Map<string, DesignDoc>();
  for (const design of [...published, ...ready]) {
    if (!isWebsiteVisibleDesign(design)) continue;
    const existing = byEventId.get(design.eventId);
    if (!existing || design.updatedAt > existing.updatedAt) {
      byEventId.set(design.eventId, design);
    }
  }
  return byEventId;
}

async function listPublicUpcomingEvents(ctx: QueryCtx, now: number) {
  const events = await ctx.db
    .query("events")
    .withIndex("by_startAt", (q) => q.gte("startAt", now))
    .order("asc")
    .take(500);
  return events.filter(
    (event) =>
      isPublicSiteListableVisibility(event.visibility) &&
      isPublicListableEventStatus(event.status) &&
      isUpcomingEvent(event.startAt, now),
  );
}

export const listUpcoming = query({
  args: {
    now: v.number(),
    limit: v.optional(v.number()),
  },
  returns: v.array(publicEventCardValue),
  handler: async (ctx, args) => {
    const events = await listPublicUpcomingEvents(ctx, args.now);
    const limited =
      args.limit !== undefined ? events.slice(0, Math.max(0, args.limit)) : events;
    const designsByEventId = await loadWebsiteVisibleDesignsByEventId(ctx);
    return Promise.all(
      limited.map((event) =>
        mapPublicEventCard(ctx, event, designsByEventId.get(event._id) ?? null),
      ),
    );
  },
});

export const listUpcomingTwoWeeks = query({
  args: { now: v.number() },
  returns: v.array(publicEventCardValue),
  handler: async (ctx, args) => {
    const events = (await listPublicUpcomingEvents(ctx, args.now)).filter((event) =>
      isWithinDays(event.startAt, args.now, 14),
    );
    const designsByEventId = await loadWebsiteVisibleDesignsByEventId(ctx);
    return Promise.all(
      events.map((event) =>
        mapPublicEventCard(ctx, event, designsByEventId.get(event._id) ?? null),
      ),
    );
  },
});

/** Lean projection for the "Happening right now" banner — title + link only,
 *  so the payload stays cheap (no poster/host/design resolution). */
const happeningNowEventValue = v.object({
  eventId: v.id("events"),
  title: v.string(),
  startAt: v.number(),
  endAt: v.number(),
  publicEventUrl: v.string(),
});

/** Candidate events for the "Happening right now" banner. Returns a ±window
 *  around server time; the client filters exactly with its own clock, so the
 *  subscription args stay stable (no per-minute re-query, no flicker) and the
 *  banner still flips on/off at the right moments. Lookback covers multi-day
 *  events still running; +12h covers tabs left open across a start time.
 *  Series traffic is a handful per week, so 200 is ~10x headroom. */
export const listHappeningNow = query({
  args: {},
  returns: v.array(happeningNowEventValue),
  handler: async (ctx) => {
    const now = Date.now();
    const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
    const FORWARD_MS = 12 * 60 * 60 * 1000;
    const events = await ctx.db
      .query("events")
      .withIndex("by_startAt", (q) =>
        q
          .gte("startAt", now - LOOKBACK_MS)
          .lte("startAt", now + FORWARD_MS),
      )
      .order("asc")
      .take(200);
    return events
      .filter((event) => isPubliclyListableEvent(event))
      .map((event) => ({
        eventId: event._id,
        title: event.title,
        startAt: event.startAt,
        endAt: event.endAt,
        publicEventUrl: buildPublicEventUrl(String(event._id), SITE_URL),
      }));
  },
});

export const getByEventId = query({
  args: { eventId: v.id("events") },
  returns: v.union(publicEventCardValue, v.null()),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) return null;
    if (!isPublicSiteListableVisibility(event.visibility) || !isPublicListableEventStatus(event.status)) {
      return null;
    }
    const design = await ctx.db
      .query("eventMarketingDesigns")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(20);
    const visible = design
      .filter((row) => isWebsiteVisibleDesign(row))
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];

    let venueAddress: string | undefined;
    let googleMapsUrl: string | undefined;
    if (event.venueId) {
      const venue = await ctx.db.get(event.venueId);
      if (venue) {
        venueAddress = venue.address ?? undefined;
        googleMapsUrl = venue.googleMapsUrl ?? undefined;
      }
    }

    return mapPublicEventCard(ctx, event, visible ?? null, venueAddress, googleMapsUrl);
  },
});
