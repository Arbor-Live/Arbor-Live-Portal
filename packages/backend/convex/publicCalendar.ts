import { v } from "convex/values";
import { internalQuery, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { resolveStoredR2AssetUrl } from "./inventoryR2";
import { buildPublicEventUrl, isPublicListableEventStatus } from "./lib/publicEvents";
import { isPublicSiteListableVisibility } from "./lib/eventVisibility";
import { loadEventHostDisplay } from "./lib/hostOrgs";
import {
  buildCalendarDescription,
  type PublicCalendarEvent,
} from "./lib/publicCalendar";
import { SITE_URL } from "./email/constants";

/**
 * Upper bound on feed size. Arbor runs ~300 events/year but only a subset is
 * public and in-window; a full public season is well under this. If it is ever
 * hit, the feed is still correct — this only caps unbounded growth.
 */
const CALENDAR_EVENT_LIMIT = 500;

/** How far ahead the subscribable feed looks. */
const CALENDAR_HORIZON_DAYS = 180;

/**
 * How far back the feed looks. Clients cache events they have already seen, but
 * a freshly added (or late-polling) subscription should still pick up a show
 * that just happened, and a multi-day event stays visible through its run. One
 * week comfortably covers a show plus its load-out.
 */
const CALENDAR_LOOKBACK_DAYS = 7;

type CalendarFeedEvent = PublicCalendarEvent & {
  posterImageUrl?: string;
  venueName?: string;
  hostLabel?: string;
};

async function loadVisibleDesignsByEventId(ctx: QueryCtx) {
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
  const byEventId = new Map<string, Doc<"eventMarketingDesigns">>();
  for (const design of [...published, ...ready]) {
    if (design.status !== "published" && design.status !== "ready") continue;
    const existing = byEventId.get(design.eventId);
    if (!existing || design.updatedAt > existing.updatedAt) {
      byEventId.set(design.eventId, design);
    }
  }
  return byEventId;
}

/**
 * Public events in the feed window (the last `CALENDAR_LOOKBACK_DAYS` through
 * the next `CALENDAR_HORIZON_DAYS`), shaped for the calendar feed: show window,
 * venue, address, maps link, event page, and a plain-text description. Mirrors
 * the visibility rules in `publicEvents.ts` so the calendar never lists
 * something the website hides.
 */
export async function loadPublicCalendarEvents(
  ctx: QueryCtx,
  now: number,
): Promise<CalendarFeedEvent[]> {
  const windowStart = now - CALENDAR_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const horizon = now + CALENDAR_HORIZON_DAYS * 24 * 60 * 60 * 1000;
  const events = await ctx.db
    .query("events")
    .withIndex("by_startAt", (q) => q.gte("startAt", windowStart))
    .order("asc")
    .take(CALENDAR_EVENT_LIMIT);

  const visible = events
    .filter(
      (event) =>
        isPublicSiteListableVisibility(event.visibility) &&
        isPublicListableEventStatus(event.status) &&
        event.startAt <= horizon,
    )
    .slice(0, CALENDAR_EVENT_LIMIT);

  const designsByEventId = await loadVisibleDesignsByEventId(ctx);

  return await Promise.all(
    visible.map(async (event): Promise<CalendarFeedEvent> => {
      const design = designsByEventId.get(event._id) ?? null;
      const hostDisplay = await loadEventHostDisplay(ctx, event);
      const eventUrl = buildPublicEventUrl(String(event._id), SITE_URL);

      let venueName = event.venueName;
      let venueAddress: string | undefined;
      let googleMapsUrl: string | undefined;
      if (event.venueId) {
        const venue = await ctx.db.get(event.venueId);
        if (venue) {
          venueName = venueName || venue.name;
          venueAddress = venue.address ?? undefined;
          googleMapsUrl = venue.googleMapsUrl ?? undefined;
        }
      }

      const posterImageUrl = design?.imageUrl
        ? ((await resolveStoredR2AssetUrl(design.imageUrl)) ?? undefined)
        : undefined;

      const location = [venueName, venueAddress].filter(Boolean).join(", ");

      return {
        uid: `arbor-event-${event._id}@arborlive.stanford.edu`,
        title: event.title,
        startAt: event.startAt,
        endAt: event.endAt,
        location: location || undefined,
        url: eventUrl,
        mapsUrl: googleMapsUrl,
        description: buildCalendarDescription({
          caption: design?.caption,
          hostLabel: hostDisplay.hostLabel,
          venueAddress,
          eventUrl,
        }),
        updatedAt: event.updatedAt,
        posterImageUrl,
        venueName: venueName || undefined,
        hostLabel: hostDisplay.hostLabel,
      };
    }),
  );
}

/** Internal feed payload for the ICS HTTP route. */
export const getFeedEvents = internalQuery({
  args: { now: v.number() },
  returns: v.array(
    v.object({
      uid: v.string(),
      title: v.string(),
      startAt: v.number(),
      endAt: v.number(),
      location: v.optional(v.string()),
      url: v.optional(v.string()),
      mapsUrl: v.optional(v.string()),
      description: v.optional(v.string()),
      updatedAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const events = await loadPublicCalendarEvents(ctx, args.now);
    return events.map((event) => ({
      uid: event.uid,
      title: event.title,
      startAt: event.startAt,
      endAt: event.endAt,
      location: event.location,
      url: event.url,
      mapsUrl: event.mapsUrl,
      description: event.description,
      updatedAt: event.updatedAt,
    }));
  },
});

/** Public summary used by the "Subscribe to calendar" UI. */
export const getFeedInfo = query({
  args: {},
  returns: v.object({
    /** Site-relative feed path; the web app owns the public URL. */
    feedPath: v.string(),
  }),
  handler: async () => ({
    // Served by the Next app, which proxies the Convex HTTP feed so the
    // shareable link is on our own domain.
    feedPath: "/events/calendar.ics",
  }),
});
