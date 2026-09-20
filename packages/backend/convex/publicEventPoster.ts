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
import { listEventsLinkedToRequest } from "./lib/bookingDayLoad";
import {
  MAX_ADDITIONAL_LINKS,
  linksIncludePartiful,
  marketingDesignLinkValue,
  normalizeMarketingLinks,
  normalizePartifulCohostUrl,
} from "./lib/marketingLinks";
import { schedulePublicEventsSiteRevalidation } from "./lib/scheduleSiteRevalidation";
import { enforceRateLimit, HOUR_MS } from "./rateLimit";
import { releaseReplacedR2Reference } from "./lib/r2Lifecycle";
import { isRequestPublicTokenExpired } from "./lib/requestToken";

const PUBLIC_CLIENT_ACTOR = "public-client";

const portalValue = v.union(v.literal("request"), v.literal("quote"));

const designLinkInputValue = marketingDesignLinkValue;

const marketingDesignStatusValue = v.union(
  v.literal("draft"),
  v.literal("ready"),
  v.literal("published"),
);

const posterDayValue = v.object({
  eventId: v.id("events"),
  eventTitle: v.string(),
  startAt: v.number(),
  venueName: v.optional(v.string()),
  posterImageUrl: v.optional(v.string()),
  caption: v.optional(v.string()),
  additionalLinks: v.array(designLinkInputValue),
  partifulCohostUrl: v.optional(v.string()),
  /** draft | ready (on website) | published (website + Instagram approved) */
  status: v.optional(marketingDesignStatusValue),
  visibility: v.union(v.literal("public"), v.literal("internal"), v.literal("informational")),
  onWebsite: v.boolean(),
  instagramPublished: v.boolean(),
});

const posterStateValue = v.object({
  eligible: v.boolean(),
  /** One entry per linked event day, ordered by start time. */
  days: v.array(posterDayValue),
});

const CAPTION_MAX_CHARS = 4000;

async function loadDesignForEvent(ctx: QueryCtx | MutationCtx, eventId: Id<"events">) {
  return (
    await ctx.db
      .query("eventMarketingDesigns")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .take(1)
  )[0] as Doc<"eventMarketingDesigns"> | undefined;
}

async function isRequestQuoteVoided(
  ctx: QueryCtx | MutationCtx,
  request: Doc<"eventRequests">,
) {
  if (!request.linkedInvoiceId) return false;
  const invoice = await ctx.db.get(request.linkedInvoiceId);
  return invoice?.status === "void";
}

type PosterPortalTarget = {
  events: Doc<"events">[];
  voided: boolean;
};

async function resolveRequestPosterTarget(
  ctx: QueryCtx | MutationCtx,
  token: string,
): Promise<PosterPortalTarget | null> {
  const request = await ctx.db
    .query("eventRequests")
    .withIndex("by_publicToken", (q) => q.eq("publicToken", token))
    .unique();
  if (!request) return null;
  if (isRequestPublicTokenExpired(request)) return null;
  if (await isRequestQuoteVoided(ctx, request)) {
    return { events: [], voided: true };
  }
  return { events: await listEventsLinkedToRequest(ctx, request), voided: false };
}

async function resolveQuotePosterTarget(
  ctx: QueryCtx | MutationCtx,
  token: string,
): Promise<PosterPortalTarget | null> {
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

  return { events: await listEventsByInvoiceId(ctx, invoice._id), voided: false };
}

async function resolvePosterPortalTarget(
  ctx: QueryCtx | MutationCtx,
  portal: "request" | "quote",
  token: string,
): Promise<PosterPortalTarget | null> {
  return portal === "request"
    ? resolveRequestPosterTarget(ctx, token)
    : resolveQuotePosterTarget(ctx, token);
}

async function requirePosterPortalEvents(
  ctx: QueryCtx | MutationCtx,
  portal: "request" | "quote",
  token: string,
): Promise<Doc<"events">[]> {
  const target = await resolvePosterPortalTarget(ctx, portal, token);
  if (!target) {
    throw new Error(portal === "request" ? "Request not found." : "Quote not found.");
  }
  if (target.voided) {
    throw new Error("Poster upload is unavailable for a voided quote.");
  }
  if (target.events.length === 0) {
    throw new Error(
      portal === "request"
        ? "Poster upload is available once your event has been created."
        : "Poster upload is available once your event has been linked.",
    );
  }
  return target.events;
}

async function serializePosterDay(ctx: QueryCtx, event: Doc<"events">) {
  const design = await loadDesignForEvent(ctx, event._id);
  const status = design?.status;
  const onWebsite = status === "ready" || status === "published";
  const posterImageUrl = design?.imageUrl
    ? ((await resolveStoredR2AssetUrl(design.imageUrl)) ?? undefined)
    : undefined;
  return {
    eventId: event._id,
    eventTitle: event.title,
    startAt: event.startAt,
    venueName: event.venueName,
    posterImageUrl,
    caption: design?.caption?.trim() || undefined,
    additionalLinks: design?.additionalLinks ?? [],
    partifulCohostUrl: design?.partifulCohostUrl,
    status,
    visibility: event.visibility,
    onWebsite,
    instagramPublished: status === "published",
  };
}

async function serializePosterState(ctx: QueryCtx, events: Doc<"events">[]) {
  if (events.length === 0) {
    return { eligible: false as const, days: [] };
  }
  return {
    eligible: true as const,
    days: await Promise.all(events.map((event) => serializePosterDay(ctx, event))),
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
    const target = await resolveRequestPosterTarget(ctx, args.token);
    return await serializePosterState(ctx, target?.events ?? []);
  },
});

export const getByQuoteToken = query({
  args: { token: v.string() },
  returns: posterStateValue,
  handler: async (ctx, args) => {
    const target = await resolveQuotePosterTarget(ctx, args.token);
    return await serializePosterState(ctx, target?.events ?? []);
  },
});

export const generateUploadUrl = mutation({
  args: {
    portal: portalValue,
    token: v.string(),
    eventId: v.id("events"),
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
    const events = await requirePosterPortalEvents(ctx, args.portal, args.token);
    const event = events.find((candidate) => candidate._id === args.eventId);
    if (!event) throw new Error("Event not found for this request.");
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
    eventId: v.id("events"),
    imageUrl: v.optional(v.string()),
    caption: v.optional(v.string()),
    additionalLinks: v.optional(v.array(designLinkInputValue)),
    partifulCohostUrl: v.optional(v.string()),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, `posterSave:${args.portal}:${args.token}`, {
      limit: 20,
      windowMs: HOUR_MS,
    });
    const events = await requirePosterPortalEvents(ctx, args.portal, args.token);
    const event = events.find((candidate) => candidate._id === args.eventId);
    if (!event) throw new Error("Event not found for this request.");
    const hasImage = args.imageUrl !== undefined;
    const hasCaption = args.caption !== undefined;
    const hasLinks = args.additionalLinks !== undefined;
    const hasCohost = args.partifulCohostUrl !== undefined;
    if (!hasImage && !hasCaption && !hasLinks && !hasCohost) {
      throw new Error("Provide a poster image, description, and/or links to save.");
    }

    let nextImageUrl: string | undefined;
    if (hasImage) {
      nextImageUrl = normalizeOptionalAssetReference(args.imageUrl);
      if (!nextImageUrl) throw new Error("Poster image is required.");
      assertPosterKeyBelongsToEvent(nextImageUrl, event._id);
    }

    let nextCaption: string | undefined;
    if (hasCaption) {
      const trimmed = args.caption!.trim();
      if (trimmed.length > CAPTION_MAX_CHARS) {
        throw new Error(`Description must be ${CAPTION_MAX_CHARS} characters or fewer.`);
      }
      nextCaption = trimmed || undefined;
    }

    const nextLinks = hasLinks
      ? normalizeMarketingLinks(args.additionalLinks, MAX_ADDITIONAL_LINKS)
      : undefined;

    const now = Date.now();
    const existing = await loadDesignForEvent(ctx, event._id);
    const effectiveLinks = hasLinks ? (nextLinks ?? []) : (existing?.additionalLinks ?? []);
    const hasPartiful = linksIncludePartiful(effectiveLinks);
    let nextCohost: string | undefined;
    if (!hasPartiful) {
      nextCohost = undefined;
    } else if (hasCohost) {
      nextCohost = normalizePartifulCohostUrl(args.partifulCohostUrl);
    }
    const shouldWriteCohost = !hasPartiful || hasCohost;

    if (existing) {
      const nextStatus = existing.status === "published" ? "published" : "ready";
      await ctx.db.patch(existing._id, {
        ...(hasImage ? { imageUrl: nextImageUrl } : {}),
        ...(hasCaption ? { caption: nextCaption } : {}),
        ...(hasLinks ? { additionalLinks: nextLinks } : {}),
        ...(shouldWriteCohost ? { partifulCohostUrl: nextCohost } : {}),
        status: nextStatus,
        updatedAt: now,
        ...(nextStatus === "ready" ? { lastError: undefined } : {}),
      });
      if (hasImage) {
        await releaseReplacedR2Reference(ctx, existing.imageUrl, nextImageUrl);
      }
    } else {
      await ctx.db.insert("eventMarketingDesigns", {
        eventId: event._id,
        imageUrl: nextImageUrl,
        caption: nextCaption,
        additionalLinks: nextLinks,
        partifulCohostUrl: nextCohost,
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

/**
 * Host-controlled public visibility for a linked event. Only toggles between
 * `public` and `internal`; the public site lists events whose visibility is
 * public.
 */
export const setVisibility = mutation({
  args: {
    portal: portalValue,
    token: v.string(),
    eventId: v.id("events"),
    visibility: v.union(v.literal("public"), v.literal("internal")),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, `posterVisibility:${args.portal}:${args.token}`, {
      limit: 30,
      windowMs: HOUR_MS,
    });
    const events = await requirePosterPortalEvents(ctx, args.portal, args.token);
    const event = events.find((candidate) => candidate._id === args.eventId);
    if (!event) throw new Error("Event not found for this request.");

    await ctx.db.patch(event._id, {
      visibility: args.visibility,
      updatedAt: Date.now(),
    });
    await schedulePublicEventsSiteRevalidation(ctx, String(event._id));
    return { ok: true as const };
  },
});
