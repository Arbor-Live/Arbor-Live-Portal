import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { resolveInvoiceAndEvents } from "./eventFeedback";
import { getCanonicalAlbumLink } from "./lib/immichAlbumLinks";
import { getImmichPublicBaseUrl } from "./lib/immichClient";
import {
  immichAssetTypeValue,
  mediaAssetPageValidator,
  paginateAlbumAssets,
} from "./lib/immichAssets";
import { enforceRateLimit, HOUR_MS } from "./rateLimit";

const portalValue = v.union(v.literal("request"), v.literal("quote"));

type Portal = "request" | "quote";

/** Public tokens may cycle through many files per upload session. */
const PUBLIC_UPLOAD_LIMIT = 500;

/**
 * Resolve a public portal token to one ended event (the album day). Media is
 * post-event only, matching the feedback / album flow. Returns null when the
 * token is invalid or the requested day has not ended.
 */
async function resolveEndedPortalEvent(
  ctx: QueryCtx | MutationCtx,
  portal: Portal,
  token: string,
  eventId?: Id<"events">,
): Promise<Doc<"events"> | null> {
  const resolved = await resolveInvoiceAndEvents(ctx, portal, token);
  if (!resolved) return null;
  const now = Date.now();
  if (eventId) {
    const event = resolved.events.find((candidate) => candidate._id === eventId);
    return event && event.endAt < now ? event : null;
  }
  return resolved.events.find((event) => event.endAt < now) ?? null;
}

/** Upload target for a public portal album; null until the album is ready. */
export const getMediaUploadConfigByToken = query({
  args: {
    portal: portalValue,
    token: v.string(),
    eventId: v.optional(v.id("events")),
  },
  returns: v.union(
    v.null(),
    v.object({
      albumLinkId: v.id("immichAlbumLinks"),
      immichPublicUrl: v.string(),
      uploadUrl: v.string(),
      shareKey: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const event = await resolveEndedPortalEvent(ctx, args.portal, args.token, args.eventId);
    if (!event) return null;
    const albumLink = await getCanonicalAlbumLink(ctx, "event", event._id);
    if (!albumLink?.sharedLinkKey) return null;
    const immichPublicUrl = getImmichPublicBaseUrl();
    if (!immichPublicUrl) return null;
    return {
      albumLinkId: albumLink._id,
      immichPublicUrl,
      uploadUrl: `${immichPublicUrl}/api/assets`,
      shareKey: albumLink.sharedLinkKey,
    };
  },
});

/**
 * Register a file that a public portal client uploaded straight to Immich via
 * the album share key. Recording it here is what drives the artist-album
 * mirror, so public uploads stay in sync without a manual sync step.
 */
export const recordMediaUploadByToken = mutation({
  args: {
    portal: portalValue,
    token: v.string(),
    eventId: v.id("events"),
    immichAssetId: v.string(),
    originalFileName: v.string(),
    type: immichAssetTypeValue,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await resolveEndedPortalEvent(ctx, args.portal, args.token, args.eventId);
    if (!event) throw new Error("Media upload is not available for this event.");

    const albumLink = await getCanonicalAlbumLink(ctx, "event", event._id);
    if (!albumLink) throw new Error("The album is not ready yet. Refresh and try again.");

    await enforceRateLimit(ctx, `publicMediaUpload:${args.portal}:${args.token}`, {
      limit: PUBLIC_UPLOAD_LIMIT,
      windowMs: HOUR_MS,
    });

    const existing = await ctx.db
      .query("immichAssetRecords")
      .withIndex("by_albumLinkId_and_immichAssetId", (q) =>
        q.eq("albumLinkId", albumLink._id).eq("immichAssetId", args.immichAssetId),
      )
      .first();
    if (existing) return null;

    await ctx.db.insert("immichAssetRecords", {
      albumLinkId: albumLink._id,
      immichAssetId: args.immichAssetId,
      originalFileName: args.originalFileName,
      type: args.type,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.immichActions.addUploadedAssetToAlbum, {
      albumLinkId: albumLink._id,
      immichAssetId: args.immichAssetId,
      originalFileName: args.originalFileName,
      type: args.type,
    });
    return null;
  },
});

/** Paginated gallery for a public portal album day. */
export const listEventMediaAssetsByToken = query({
  args: {
    portal: portalValue,
    token: v.string(),
    eventId: v.id("events"),
    paginationOpts: paginationOptsValidator,
  },
  returns: mediaAssetPageValidator,
  handler: async (ctx, args) => {
    const event = await resolveEndedPortalEvent(ctx, args.portal, args.token, args.eventId);
    if (!event) {
      return { page: [], isDone: true, continueCursor: "" };
    }
    const albumLink = await getCanonicalAlbumLink(ctx, "event", event._id);
    return await paginateAlbumAssets(ctx, albumLink, args.paginationOpts);
  },
});
