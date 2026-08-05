import { addPacificCalendarDays, pacificDateKey } from "@arbor/format";
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { ensurePostMortemFeedbackRow, postMortemUrl } from "../postMortemFeedback";
import { resolvePortalTokenForInvoice } from "../lib/paymentProof";
import {
  EVENT_TIMEZONE,
  formatEventDateRange,
  publicQuoteUrl,
  reminderDayKey,
  requestTrackingUrl,
  subjectForTemplate,
} from "./constants";
import { enqueueEmail } from "./enqueue";
import { getEventLeadRecipients } from "./recipients";

/** Days after an event ends before we send the "share your photos" reminder. */
const DAYS_AFTER_EVENT = 7;
/** Safety margin for multi-day events when scanning by startAt. */
const START_AT_LOOKBACK_DAYS = 30;

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Daily cron: for events whose Pacific end date was exactly `DAYS_AFTER_EVENT`
 * days ago, email the client asking them to add their own photos/videos to
 * the event's shared album (and telling them ours are on the way). Also sends
 * the day-of lead and event manager their media email with a post-mortem
 * feedback form link.
 */
export const run = internalMutation({
  args: {},
  returns: v.object({ enqueuedCount: v.number() }),
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

    let enqueuedCount = 0;

    for (const event of candidates) {
      const timezone = event.timezone || EVENT_TIMEZONE;
      if (pacificDateKey(event.endAt, timezone) !== targetDayKey) continue;
      if (!event.invoiceId) continue;

      const invoice = await ctx.db.get(event.invoiceId);
      if (!invoice) continue;

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

      if (!clientEmail || !isValidEmail(clientEmail)) continue;

      const albumLink = await ctx.db
        .query("immichAlbumLinks")
        .withIndex("by_entityType_and_entityId", (q) =>
          q.eq("entityType", "event").eq("entityId", event._id),
        )
        .unique();

      const portal = await resolvePortalTokenForInvoice(ctx, invoice);
      const feedbackFormUrl = portal
        ? `${portal.portal === "request" ? requestTrackingUrl(portal.token) : publicQuoteUrl(portal.token)}#feedback`
        : undefined;

      await enqueueEmail(ctx, {
        template: "post_event_album",
        to: clientEmail,
        subject: subjectForTemplate("post_event_album", event.title),
        eventId: event._id,
        idempotencyKey: `post_event_album:${event._id}:${todayKey}`,
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

      // Internal post-mortem: the day-of lead (and event manager) get the same
      // media email, plus a link to their post-event review form.
      const leads = await getEventLeadRecipients(ctx, event._id);
      for (const lead of leads) {
        if (!lead.userId) continue;
        const row = await ensurePostMortemFeedbackRow(ctx, event._id, lead.userId);
        await enqueueEmail(ctx, {
          template: "post_event_album",
          to: lead.email,
          subject: `Your event media: ${event.title}`,
          eventId: event._id,
          idempotencyKey: `post_event_album:lead:${event._id}:${lead.userId}:${todayKey}`,
          payload: {
            recipientName: lead.name,
            eventTitle: event.title,
            venueName: event.venueName,
            dateRangeLabel: formatEventDateRange(event.startAt, event.endAt, timezone),
            albumShareUrl: albumLink?.shareUrl,
            audience: "lead",
            postMortemUrl: postMortemUrl(row.token),
          },
        });
        enqueuedCount += 1;
      }
    }

    return { enqueuedCount };
  },
});
