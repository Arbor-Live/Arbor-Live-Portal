import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { listEventsLinkedToInvoice } from "./lib/invoiceEvents";
import { getCanonicalAlbumLink } from "./lib/immichAlbumLinks";
import { isRequestPublicTokenExpired } from "./lib/requestToken";
import { enforceRateLimit, HOUR_MS } from "./rateLimit";

const portalValue = v.union(v.literal("request"), v.literal("quote"));

type Portal = "request" | "quote";

/** Sibling day-events on a booking; well past a festival weekend. */
const FEEDBACK_DAYS_CAP = 50;

const feedbackDayValue = v.object({
  eventId: v.id("events"),
  eventTitle: v.string(),
  startAt: v.number(),
  endAt: v.number(),
  ended: v.boolean(),
  submitted: v.boolean(),
  albumShareUrl: v.optional(v.string()),
});

async function resolveInvoiceAndEvents(
  ctx: QueryCtx | MutationCtx,
  portal: Portal,
  token: string,
): Promise<{ invoice: Doc<"invoices">; events: Doc<"events">[] } | null> {
  let invoice: Doc<"invoices"> | null = null;

  if (portal === "request") {
    const request = await ctx.db
      .query("eventRequests")
      .withIndex("by_publicToken", (q) => q.eq("publicToken", token))
      .unique();
    if (!request?.linkedInvoiceId) return null;
    if (isRequestPublicTokenExpired(request)) return null;
    invoice = await ctx.db.get(request.linkedInvoiceId);
    if (!invoice || invoice.status === "void" || !invoice.clientReviewReadyAt) return null;
  } else {
    invoice = await ctx.db
      .query("invoices")
      .withIndex("by_publicApprovalToken", (q) => q.eq("publicApprovalToken", token))
      .unique();
    if (!invoice || invoice.status === "void") return null;
    if (invoice.sourceEventRequestId) return null;
    if (invoice.publicApprovalTokenExpiresAt && invoice.publicApprovalTokenExpiresAt < Date.now()) {
      return null;
    }
  }

  const events = await listEventsLinkedToInvoice(ctx, invoice._id);
  if (events.length === 0) return null;

  return { invoice, events };
}

function pickFeedbackEvent(
  events: Doc<"events">[],
  eventId: Id<"events"> | undefined,
  now: number,
): Doc<"events"> {
  const ended = events.filter((event) => event.endAt < now);
  if (ended.length === 0) {
    throw new Error("Feedback opens once the event has ended.");
  }
  if (!eventId) return ended[0]!;
  const requested = events.find((event) => event._id === eventId);
  if (!requested) throw new Error("Feedback is not available for this event.");
  if (requested.endAt >= now) {
    throw new Error("Feedback opens once the event has ended.");
  }
  return requested;
}

/** Post-event feedback availability for the booking request / event quote portals. */
export const getStatusByToken = query({
  args: { portal: portalValue, token: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      submitted: v.boolean(),
      eventEnded: v.boolean(),
      eventTitle: v.optional(v.string()),
      albumShareUrl: v.optional(v.string()),
      days: v.array(feedbackDayValue),
    }),
  ),
  handler: async (ctx, args) => {
    const resolved = await resolveInvoiceAndEvents(ctx, args.portal, args.token);
    if (!resolved) return null;

    const now = Date.now();
    const feedbackRows = await ctx.db
      .query("eventFeedback")
      .withIndex("by_invoiceId", (q) => q.eq("invoiceId", resolved.invoice._id))
      .take(FEEDBACK_DAYS_CAP);
    const submittedEventIds = new Set(feedbackRows.map((row) => row.eventId));

    const days = await Promise.all(
      resolved.events.map(async (event) => {
        const albumLink = await getCanonicalAlbumLink(ctx, "event", event._id);
        return {
          eventId: event._id,
          eventTitle: event.title,
          startAt: event.startAt,
          endAt: event.endAt,
          ended: event.endAt < now,
          submitted: submittedEventIds.has(event._id),
          albumShareUrl: albumLink?.shareUrl,
        };
      }),
    );

    const endedDays = days.filter((day) => day.ended);
    const pendingDay = endedDays.find((day) => !day.submitted);
    const albumDay = endedDays.find((day) => day.albumShareUrl) ?? endedDays[0];

    return {
      submitted: endedDays.length > 0 && endedDays.every((day) => day.submitted),
      eventEnded: endedDays.length > 0,
      eventTitle: pendingDay?.eventTitle ?? endedDays[0]?.eventTitle ?? days[0]?.eventTitle,
      albumShareUrl: albumDay?.albumShareUrl,
      days,
    };
  },
});

/** Auth-free target for public album ensure-on-view (ended events only). */
export const resolveAlbumEnsureTargetByToken = internalQuery({
  args: {
    portal: portalValue,
    token: v.string(),
    eventId: v.optional(v.id("events")),
  },
  returns: v.union(
    v.null(),
    v.object({
      eventId: v.id("events"),
    }),
  ),
  handler: async (ctx, args) => {
    const resolved = await resolveInvoiceAndEvents(ctx, args.portal, args.token);
    if (!resolved) return null;
    const now = Date.now();
    if (args.eventId) {
      const event = resolved.events.find((candidate) => candidate._id === args.eventId);
      if (!event || event.endAt >= now) return null;
      return { eventId: event._id };
    }
    const ended = resolved.events.find((event) => event.endAt < now);
    return ended ? { eventId: ended._id } : null;
  },
});

/** Submit post-event feedback from the booking request / event quote portals. */
export const submitByToken = mutation({
  args: {
    portal: portalValue,
    token: v.string(),
    rating: v.number(),
    comments: v.string(),
    eventId: v.optional(v.id("events")),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, `eventFeedback:${args.token}`, { limit: 5, windowMs: HOUR_MS });

    const resolved = await resolveInvoiceAndEvents(ctx, args.portal, args.token);
    if (!resolved) throw new Error("Feedback is not available for this event.");

    const now = Date.now();
    const event = pickFeedbackEvent(resolved.events, args.eventId, now);

    if (!Number.isInteger(args.rating) || args.rating < 1 || args.rating > 5) {
      throw new Error("Please provide a rating between 1 and 5.");
    }

    const comments = args.comments.trim();
    if (!comments) throw new Error("Please share a few words about your experience.");

    const existing = await ctx.db
      .query("eventFeedback")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .first();
    if (existing) throw new Error("You have already submitted feedback for this event.");

    await ctx.db.insert("eventFeedback", {
      eventId: event._id,
      invoiceId: resolved.invoice._id,
      sourceToken: args.token,
      portal: args.portal,
      rating: args.rating,
      comments,
      submittedAt: now,
      createdAt: now,
    });

    return { ok: true as const };
  },
});
