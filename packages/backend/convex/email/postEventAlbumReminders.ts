import { addPacificCalendarDays, pacificDateKey } from "@arbor/format";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { ensurePostMortemFeedbackRow, postMortemUrl } from "../postMortemFeedback";
import { resolvePortalTokenForInvoice } from "../lib/paymentProof";
import {
  EVENT_TIMEZONE,
  SITE_URL,
  formatEventDateRange,
  publicQuoteUrl,
  reminderDayKey,
  requestTrackingUrl,
  subjectForTemplate,
} from "./constants";
import { enqueueEmail } from "./enqueue";
import { getEventCrewRecipients, getEventLeadRecipients } from "./recipients";
import { getCanonicalAlbumLink } from "../lib/immichAlbumLinks";

/** Days after an event ends before we send the post-event emails. */
const DAYS_AFTER_EVENT = 1;
/** Safety margin for multi-day events when scanning by startAt. */
const START_AT_LOOKBACK_DAYS = 30;

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Daily cron: for events whose Pacific end date was exactly `DAYS_AFTER_EVENT`
 * days ago, schedule album-ensure + post-event emails. Client, day-of lead /
 * event manager, and remaining crew recipients are resolved in
 * `enqueueForEvent`.
 */
export const run = internalMutation({
  args: {},
  returns: v.object({ scheduledCount: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const todayKey = reminderDayKey(now, EVENT_TIMEZONE);
    const targetInstant = addPacificCalendarDays(now, -DAYS_AFTER_EVENT, EVENT_TIMEZONE);
    const targetDayKey = pacificDateKey(targetInstant, EVENT_TIMEZONE);

    const windowStart = targetInstant - START_AT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
    const windowEnd = targetInstant + 24 * 60 * 60 * 1000;

    const candidates = await ctx.db
      .query("events")
      .withIndex("by_startAt", (q) => q.gte("startAt", windowStart).lte("startAt", windowEnd))
      .take(500);

    let scheduledCount = 0;

    for (const event of candidates) {
      const timezone = event.timezone || EVENT_TIMEZONE;
      if (pacificDateKey(event.endAt, timezone) !== targetDayKey) continue;
      if (!event.invoiceId) continue;

      await ctx.scheduler.runAfter(0, internal.email.postEventAlbumReminderActions.deliverForEvent, {
        eventId: event._id,
        todayKey,
      });
      scheduledCount += 1;
    }

    return { scheduledCount };
  },
});

export const enqueueForEvent = internalMutation({
  args: {
    eventId: v.id("events"),
    todayKey: v.string(),
  },
  returns: v.object({ enqueuedCount: v.number() }),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event?.invoiceId) return { enqueuedCount: 0 };

    const invoice = await ctx.db.get(event.invoiceId);
    if (!invoice) return { enqueuedCount: 0 };

    const timezone = event.timezone || EVENT_TIMEZONE;
    const albumLink = await getCanonicalAlbumLink(ctx, "event", event._id);
    // Internal recipients upload through the portal; only clients get the raw
    // Immich share link (they have no dashboard account).
    const eventMediaUrl = `${SITE_URL}/dashboard/events/${event._id}/media`;

    let enqueuedCount = 0;

    // Client: only when we can resolve an email address. A missing client
    // email must not block the internal lead/crew emails below.
    let clientEmail = invoice.clientEmail?.trim().toLowerCase();
    let recipientName = invoice.clientContactName ?? undefined;

    const requestId = invoice.sourceEventRequestId ?? event.sourceEventRequestId;
    if (!clientEmail && requestId) {
      const request = await ctx.db.get(requestId);
      if (request) {
        clientEmail = request.email?.trim().toLowerCase();
        recipientName = recipientName ?? `${request.firstName} ${request.lastName}`.trim();
      }
    }

    if (clientEmail && isValidEmail(clientEmail)) {
      const portal = await resolvePortalTokenForInvoice(ctx, invoice);
      const feedbackFormUrl = portal
        ? `${portal.portal === "request" ? requestTrackingUrl(portal.token) : publicQuoteUrl(portal.token)}#feedback`
        : undefined;

      await enqueueEmail(ctx, {
        template: "post_event_album",
        to: clientEmail,
        subject: subjectForTemplate("post_event_album", event.title),
        eventId: event._id,
        idempotencyKey: `post_event_album:${event._id}:${args.todayKey}`,
        payload: {
          recipientName,
          eventTitle: event.title,
          venueName: event.venueName,
          dateRangeLabel: formatEventDateRange(event.startAt, event.endAt, timezone),
          albumShareUrl: albumLink?.shareUrl,
          feedbackFormUrl,
        },
      });
      enqueuedCount += 1;
    }

    const leads = await getEventLeadRecipients(ctx, event._id);
    const leadEmails = new Set(leads.map((lead) => lead.email));
    for (const lead of leads) {
      if (!lead.userId) continue;
      const row = await ensurePostMortemFeedbackRow(ctx, event._id, lead.userId);
      await enqueueEmail(ctx, {
        template: "post_event_album",
        to: lead.email,
        subject: `Your event media: ${event.title}`,
        eventId: event._id,
        idempotencyKey: `post_event_album:lead:${event._id}:${lead.userId}:${args.todayKey}`,
        payload: {
          recipientName: lead.name,
          eventTitle: event.title,
          venueName: event.venueName,
          dateRangeLabel: formatEventDateRange(event.startAt, event.endAt, timezone),
          eventMediaUrl,
          audience: "lead",
          postMortemUrl: postMortemUrl(row.token),
        },
      });
      enqueuedCount += 1;
    }

    // Rest of the crew: the media email only, no post-mortem or client
    // feedback form. Exclude leads by email so a lead stored under a different
    // id format doesn't also get the crew email.
    const crew = await getEventCrewRecipients(ctx, event._id);
    for (const member of crew) {
      if (leadEmails.has(member.email)) continue;
      await enqueueEmail(ctx, {
        template: "post_event_album",
        to: member.email,
        subject: `Your event media: ${event.title}`,
        eventId: event._id,
        idempotencyKey: `post_event_album:crew:${event._id}:${member.email}:${args.todayKey}`,
        payload: {
          recipientName: member.name,
          eventTitle: event.title,
          venueName: event.venueName,
          dateRangeLabel: formatEventDateRange(event.startAt, event.endAt, timezone),
          eventMediaUrl,
          audience: "crew",
        },
      });
      enqueuedCount += 1;
    }

    return { enqueuedCount };
  },
});
