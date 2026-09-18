import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { PORTAL_TIMEZONE } from "@arbor/format";
import {
  buildPublicEventUrl,
  isOpenMicSignupOpen,
  isPublicListableEventStatus,
  isUpcomingEvent,
} from "./publicEvents";
import { isPublicSiteListableVisibility } from "./eventVisibility";
import { loadEventHostDisplay } from "./hostOrgs";
import { resolveStoredR2AssetUrl } from "../inventoryR2";

/** How far ahead the newsletter looks. Monday send covers Mon–Sun. */
export const NEWSLETTER_WINDOW_DAYS = 7;

/**
 * Upper bound on events per send. Arbor runs ~300 events/year but only a small
 * subset is public and falls in any given week; a campus week realistically has
 * a handful. 40 is well past normal traffic — if a week ever exceeds it, that is
 * a signal worth seeing, not a silent truncation, so we surface a count.
 */
export const NEWSLETTER_MAX_EVENTS = 40;

export type WeekEvent = {
  title: string;
  whenLabel: string;
  venueName?: string;
  hostLabel?: string;
  posterImageUrl?: string;
  caption?: string;
  eventUrl: string;
  openMicSignupUrl?: string;
};

export type BuiltWeek = {
  weekLabel: string;
  events: WeekEvent[];
};

function websiteVisibleDesign(design: Doc<"eventMarketingDesigns">) {
  return design.status === "published" || design.status === "ready";
}

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
    if (!websiteVisibleDesign(design)) continue;
    const existing = byEventId.get(design.eventId);
    if (!existing || design.updatedAt > existing.updatedAt) {
      byEventId.set(design.eventId, design);
    }
  }
  return byEventId;
}

/** Inclusive "May 5 – May 11" label for the send window in portal time. */
export function weekLabelFor(now: number, days: number = NEWSLETTER_WINDOW_DAYS) {
  return `${monthDayLabel(now)} – ${monthDayLabel(
    now + days * 24 * 60 * 60 * 1000,
  )}`;
}

/** "May 5" in portal time — no weekday/year, which the newsletter header omits. */
function monthDayLabel(ms: number) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PORTAL_TIMEZONE,
    month: "short",
    day: "numeric",
  }).format(new Date(ms));
}

/** "Fri, May 9 · 7:00 PM" — weekday-anchored so readers can scan by day. */
function eventWhenLabel(ms: number) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PORTAL_TIMEZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
    .format(new Date(ms))
    .replace(/, (\d)/, " $1");
}

/**
 * Build the newsletter body: public, upcoming events inside the window with
 * poster, host, and Open Mic sign-up links resolved. Mirrors `publicEvents.ts`
 * list/filter logic so the email and the website never disagree about what is
 * happening.
 */
export async function buildThisWeekAtArbor(
  ctx: QueryCtx,
  now: number,
): Promise<BuiltWeek> {
  const windowEnd = now + NEWSLETTER_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const scanLimit = 500;

  const events = await ctx.db
    .query("events")
    .withIndex("by_startAt", (q) => q.gte("startAt", now))
    .order("asc")
    .take(scanLimit);

  const inWindow = events
    .filter(
      (event) =>
        isPublicSiteListableVisibility(event.visibility) &&
        isPublicListableEventStatus(event.status) &&
        isUpcomingEvent(event.startAt, now) &&
        event.startAt <= windowEnd,
    )
    .slice(0, NEWSLETTER_MAX_EVENTS);

  const designsByEventId = await loadVisibleDesignsByEventId(ctx);

  const built = await Promise.all(
    inWindow.map(async (event): Promise<WeekEvent> => {
      const design = designsByEventId.get(event._id) ?? null;
      const posterImageUrl = design?.imageUrl
        ? ((await resolveStoredR2AssetUrl(design.imageUrl)) ?? undefined)
        : undefined;
      const hostDisplay = await loadEventHostDisplay(ctx, event);

      let venueName = event.venueName;
      if (!venueName && event.venueId) {
        const venue = await ctx.db.get(event.venueId);
        venueName = venue?.name ?? undefined;
      }

      return {
        title: event.title,
        whenLabel: eventWhenLabel(event.startAt),
        venueName: venueName || undefined,
        hostLabel: hostDisplay.hostLabel,
        posterImageUrl,
        caption: design?.caption,
        eventUrl: buildPublicEventUrl(String(event._id), process.env.SITE_URL ?? ""),
        openMicSignupUrl: isOpenMicSignupOpen(event, now)
          ? `${process.env.SITE_URL ?? ""}/open-mic`
          : undefined,
      };
    }),
  );

  return { weekLabel: weekLabelFor(now), events: built };
}
