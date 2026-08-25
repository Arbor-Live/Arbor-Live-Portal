import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { inventoryR2, resolveStoredR2AssetUrl } from "./inventoryR2";
import {
  buildEventPosterObjectKey,
  normalizeOptionalAssetReference,
  parseStoredR2Asset,
  validateMarketingHeroUploadRequest,
} from "./lib/inventoryUpload";
import { listEventsByInvoiceId } from "./lib/invoiceEvents";
import { schedulePublicEventsSiteRevalidation } from "./lib/scheduleSiteRevalidation";
import { enforceRateLimit, HOUR_MS } from "./rateLimit";

const PUBLIC_CLIENT_ACTOR = "public-client";

const portalValue = v.union(v.literal("request"), v.literal("quote"));

const posterStateValue = v.object({
  eligible: v.boolean(),
  eventId: v.optional(v.id("events")),
  eventTitle: v.optional(v.string()),
  posterImageUrl: v.optional(v.string()),
  /** draft | ready (on website) | published (website + Instagram approved) */
  status: v.optional(v.union(v.literal("draft"), v.literal("ready"), v.literal("published"))),
  onWebsite: v.boolean(),
  instagramPublished: v.boolean(),
});

async function loadDesignForEvent(ctx: QueryCtx | MutationCtx, eventId: Id<"events">) {
  return (
    await ctx.db
      .query("eventMarketingDesigns")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .take(1)
  )[0] as Doc<"eventMarketingDesigns"> | undefined;
}

async function resolveEventByRequestToken(ctx: QueryCtx | MutationCtx, token: string) {
  const request = await ctx.db
    .query("eventRequests")
    .withIndex("by_publicToken", (q) => q.eq("publicToken", token))
    .unique();
  if (!request) return null;

  const eventId = request.convertedEventId ?? request.convertedEventIds?.[0];
  if (eventId) {
    const event = await ctx.db.get(eventId);
    if (event) return { event, request };
  }

  if (request.linkedInvoiceId) {
    const linkedEvents = await listEventsByInvoiceId(ctx, request.linkedInvoiceId);
    const event = linkedEvents[0];
    if (event) return { event, request };
  }

  return { event: null, request };
}

async function resolveEventByQuoteToken(ctx: QueryCtx | MutationCtx, token: string) {
  const invoice = await ctx.db
    .query("invoices")
    .withIndex("by_publicApprovalToken", (q) => q.eq("publicApprovalToken", token))
    .unique();
  if (!invoice) return null;
  if (invoice.sourceEventRequestId) return null;
  if (invoice.publicApprovalTokenExpiresAt && invoice.publicApprovalTokenExpiresAt < Date.now()) {
    return null;
  }
  if (invoice.status === "void") return null;

  const linkedEvents = await listEventsByInvoiceId(ctx, invoice._id);
  const event = linkedEvents[0] ?? null;
  return { event, invoice };
}

async function resolveEventForPortal(
  ctx: QueryCtx | MutationCtx,
  portal: "request" | "quote",
  token: string,
) {
  if (portal === "request") {
    const resolved = await resolveEventByRequestToken(ctx, token);
    if (!resolved) throw new Error("Request not found.");
    if (!resolved.event) {
      throw new Error("Poster upload is available once your event has been created.");
    }
    return resolved.event;
  }

  const resolved = await resolveEventByQuoteToken(ctx, token);
  if (!resolved) throw new Error("Quote not found.");
  if (!resolved.event) {
    throw new Error("Poster upload is available once your event has been linked.");
  }
  return resolved.event;
}

async function serializePosterState(
  ctx: QueryCtx,
  event: Doc<"events"> | null,
): Promise<{
  eligible: boolean;
  eventId?: Id<"events">;
  eventTitle?: string;
  posterImageUrl?: string;
  status?: "draft" | "ready" | "published";
  onWebsite: boolean;
  instagramPublished: boolean;
}> {
  if (!event) {
    return { eligible: false, onWebsite: false, instagramPublished: false };
  }
  const design = await loadDesignForEvent(ctx, event._id);
  const status = design?.status;
  const onWebsite = status === "ready" || status === "published";
  const posterImageUrl = design?.imageUrl
    ? ((await resolveStoredR2AssetUrl(design.imageUrl)) ?? undefined)
    : undefined;
  return {
    eligible: true,
    eventId: event._id,
    eventTitle: event.title,
    posterImageUrl,
    status,
    onWebsite,
    instagramPublished: status === "published",
  };
}

function assertPosterKeyBelongsToEvent(imageUrl: string, eventId: Id<"events">) {
  const parsed = parseStoredR2Asset(imageUrl);
  if (!parsed || parsed.kind !== "r2") {
    throw new Error("Invalid poster upload.");
  }
  const prefix = `events/${eventId}/poster/`;
  if (!parsed.key.startsWith(prefix)) {
    throw new Error("Invalid poster upload.");
  }
}

export const getByRequestToken = query({
  args: { token: v.string() },
  returns: posterStateValue,
  handler: async (ctx, args) => {
    const resolved = await resolveEventByRequestToken(ctx, args.token);
    if (!resolved) {
      return { eligible: false, onWebsite: false, instagramPublished: false };
    }
    return await serializePosterState(ctx, resolved.event);
  },
});

export const getByQuoteToken = query({
  args: { token: v.string() },
  returns: posterStateValue,
  handler: async (ctx, args) => {
    const resolved = await resolveEventByQuoteToken(ctx, args.token);
    if (!resolved) {
      return { eligible: false, onWebsite: false, instagramPublished: false };
    }
    return await serializePosterState(ctx, resolved.event);
  },
});

export const generateUploadUrl = mutation({
  args: {
    portal: portalValue,
    token: v.string(),
    fileName: v.string(),
    contentType: v.string(),
    contentLength: v.number(),
    uploadId: v.string(),
  },
  returns: v.object({
    key: v.string(),
    url: v.string(),
  }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, `posterUploadUrl:${args.portal}:${args.token}`, {
      limit: 30,
      windowMs: HOUR_MS,
    });
    const event = await resolveEventForPortal(ctx, args.portal, args.token);
    const uploadId = args.uploadId.trim();
    if (!uploadId) throw new Error("Upload id is required.");

    validateMarketingHeroUploadRequest({
      fileName: args.fileName,
      contentType: args.contentType,
      contentLength: args.contentLength,
    });

    const key = buildEventPosterObjectKey({
      eventId: String(event._id),
      fileName: args.fileName,
      uploadId,
    });
    return await inventoryR2.generateUploadUrl(key);
  },
});

export const save = mutation({
  args: {
    portal: portalValue,
    token: v.string(),
    imageUrl: v.string(),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, `posterSave:${args.portal}:${args.token}`, {
      limit: 20,
      windowMs: HOUR_MS,
    });
    const event = await resolveEventForPortal(ctx, args.portal, args.token);
    const imageUrl = normalizeOptionalAssetReference(args.imageUrl);
    if (!imageUrl) throw new Error("Poster image is required.");
    assertPosterKeyBelongsToEvent(imageUrl, event._id);

    const now = Date.now();
    const existing = await loadDesignForEvent(ctx, event._id);
    if (existing) {
      const nextStatus = existing.status === "published" ? "published" : "ready";
      await ctx.db.patch(existing._id, {
        imageUrl,
        status: nextStatus,
        updatedAt: now,
        ...(nextStatus === "ready" ? { lastError: undefined } : {}),
      });
    } else {
      await ctx.db.insert("eventMarketingDesigns", {
        eventId: event._id,
        imageUrl,
        status: "ready",
        createdByUserId: PUBLIC_CLIENT_ACTOR,
        createdAt: now,
        updatedAt: now,
      });
    }

    await schedulePublicEventsSiteRevalidation(ctx, String(event._id));
    return { ok: true as const };
  },
});
