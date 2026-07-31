import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { listEventsByInvoiceId } from "./lib/invoiceEvents";
import { enforceRateLimit, HOUR_MS } from "./rateLimit";

const portalValue = v.union(v.literal("request"), v.literal("quote"));

type Portal = "request" | "quote";

async function resolveInvoiceAndEvent(
  ctx: QueryCtx | MutationCtx,
  portal: Portal,
  token: string,
): Promise<{ invoice: Doc<"invoices">; event: Doc<"events"> } | null> {
  let invoice: Doc<"invoices"> | null = null;

  if (portal === "request") {
    const request = await ctx.db
      .query("eventRequests")
      .withIndex("by_publicToken", (q) => q.eq("publicToken", token))
      .unique();
    if (!request?.linkedInvoiceId) return null;
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

  const linkedEvents = await listEventsByInvoiceId(ctx, invoice._id);
  const linkedEvent = linkedEvents[0];
  if (!linkedEvent) return null;

  return { invoice, event: linkedEvent };
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
    }),
  ),
  handler: async (ctx, args) => {
    const resolved = await resolveInvoiceAndEvent(ctx, args.portal, args.token);
    if (!resolved) return null;

    const existing = await ctx.db
      .query("eventFeedback")
      .withIndex("by_invoiceId", (q) => q.eq("invoiceId", resolved.invoice._id))
      .first();

    const albumLink = await ctx.db
      .query("immichAlbumLinks")
      .withIndex("by_entityType_and_entityId", (q) =>
        q.eq("entityType", "event").eq("entityId", resolved.event._id),
      )
      .unique();

    return {
      submitted: Boolean(existing),
      eventEnded: resolved.event.endAt < Date.now(),
      eventTitle: resolved.event.title,
      albumShareUrl: albumLink?.shareUrl,
    };
  },
});

/** Submit post-event feedback from the booking request / event quote portals. */
export const submitByToken = mutation({
  args: {
    portal: portalValue,
    token: v.string(),
    rating: v.number(),
    comments: v.string(),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, `eventFeedback:${args.token}`, { limit: 5, windowMs: HOUR_MS });

    const resolved = await resolveInvoiceAndEvent(ctx, args.portal, args.token);
    if (!resolved) throw new Error("Feedback is not available for this event.");

    if (resolved.event.endAt >= Date.now()) {
      throw new Error("Feedback opens once the event has ended.");
    }

    if (!Number.isInteger(args.rating) || args.rating < 1 || args.rating > 5) {
      throw new Error("Please provide a rating between 1 and 5.");
    }

    const comments = args.comments.trim();
    if (!comments) throw new Error("Please share a few words about your experience.");

    const existing = await ctx.db
      .query("eventFeedback")
      .withIndex("by_invoiceId", (q) => q.eq("invoiceId", resolved.invoice._id))
      .first();
    if (existing) throw new Error("You have already submitted feedback for this event.");

    const now = Date.now();
    await ctx.db.insert("eventFeedback", {
      eventId: resolved.event._id,
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
