import { v } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { resolveStoredR2AssetUrl } from "./inventoryR2";
import {
  buildPublicEventUrl,
  isPublicListableEventStatus,
  isUpcomingEvent,
  isWithinDays,
} from "./lib/publicEvents";
import { isPublicSiteListableVisibility } from "./lib/eventVisibility";
import { SITE_URL } from "./email/constants";

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
  host: v.optional(v.string()),
  posterImageUrl: v.optional(v.string()),
  caption: v.optional(v.string()),
  publicEventUrl: v.string(),
  additionalLinks: v.array(publicEventLinkValue),
});

type DesignDoc = Doc<"eventMarketingDesigns">;

async function mapPublicEventCard(
  ctx: QueryCtx,
  event: Doc<"events">,
  design?: DesignDoc | null,
) {
  const posterImageUrl = design?.imageUrl
    ? ((await resolveStoredR2AssetUrl(design.imageUrl)) ?? undefined)
    : undefined;
  const publicEventUrl = buildPublicEventUrl(String(event._id), SITE_URL);
  return {
    eventId: event._id,
    title: event.title,
    startAt: event.startAt,
    endAt: event.endAt,
    venueName: event.venueName,
    host: event.host,
    posterImageUrl,
    caption: design?.caption,
    publicEventUrl,
    additionalLinks: design?.additionalLinks ?? [],
  };
}

async function loadPublishedDesignsByEventId(ctx: QueryCtx) {
  const designs = await ctx.db
    .query("eventMarketingDesigns")
    .withIndex("by_status", (q) => q.eq("status", "published"))
    .take(500);
  const byEventId = new Map<string, DesignDoc>();
  for (const design of designs) {
    const existing = byEventId.get(design.eventId);
    if (!existing || design.updatedAt > existing.updatedAt) {
      byEventId.set(design.eventId, design);
    }
  }
  return byEventId;
}

async function listPublicUpcomingEvents(ctx: QueryCtx, now: number) {
  const events = await ctx.db.query("events").withIndex("by_startAt").order("asc").take(300);
  return events.filter(
    (event) =>
      isPublicSiteListableVisibility(event.visibility) &&
      isPublicListableEventStatus(event.status) &&
      isUpcomingEvent(event.startAt, now),
  );
}

export const listUpcoming = query({
  args: { now: v.number() },
  returns: v.array(publicEventCardValue),
  handler: async (ctx, args) => {
    const events = await listPublicUpcomingEvents(ctx, args.now);
    const designsByEventId = await loadPublishedDesignsByEventId(ctx);
    return Promise.all(
      events.map((event) =>
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
    const designsByEventId = await loadPublishedDesignsByEventId(ctx);
    return Promise.all(
      events.map((event) =>
        mapPublicEventCard(ctx, event, designsByEventId.get(event._id) ?? null),
      ),
    );
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
    const published = design
      .filter((row) => row.status === "published")
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    return mapPublicEventCard(ctx, event, published ?? null);
  },
});
