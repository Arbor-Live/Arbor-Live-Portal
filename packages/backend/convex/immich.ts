import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, mutation, query } from "./_generated/server";
import {
  canUploadToAlbum,
  getAlbumLinkForBand,
  getAlbumLinkForEvent,
  requireAssetAccess,
  requireBandAlbumAccess,
  requireEventMediaAccess,
} from "./lib/immichAccess";
import { buildImmichAlbumUrl, getImmichPublicBaseUrl } from "./lib/immichClient";
import {
  immichAssetTypeValue,
  mediaAssetPageValidator,
  paginateAlbumAssets,
} from "./lib/immichAssets";
import { requireArborInternalContext, requireAuth, requireBandContext } from "./lib/auth";
import type { BackfillRunResult } from "./immichActions";

const entityTypeValue = v.union(v.literal("band"), v.literal("event"));

const albumLinkValidator = v.object({
  albumLinkId: v.id("immichAlbumLinks"),
  immichAlbumId: v.string(),
  albumName: v.string(),
  albumUrl: v.optional(v.string()),
});

function toAlbumLink(row: {
  _id: Id<"immichAlbumLinks">;
  immichAlbumId: string;
  albumName: string;
  shareUrl?: string;
}) {
  return {
    albumLinkId: row._id,
    immichAlbumId: row.immichAlbumId,
    albumName: row.albumName,
    albumUrl: row.shareUrl ?? buildImmichAlbumUrl(row.immichAlbumId),
  };
}

export const getBandMediaAlbum = query({
  args: { eventId: v.optional(v.id("events")) },
  returns: v.union(albumLinkValidator, v.null()),
  handler: async (ctx, args) => {
    const context = await requireBandContext(ctx);
    await requireBandAlbumAccess(ctx, context.organizationId);

    if (args.eventId) {
      await requireEventMediaAccess(ctx, args.eventId);
      const albumLink = await getAlbumLinkForEvent(ctx, args.eventId);
      return albumLink ? toAlbumLink(albumLink) : null;
    }

    const albumLink = await getAlbumLinkForBand(ctx, context.organizationId);
    return albumLink ? toAlbumLink(albumLink) : null;
  },
});

export const listBandMediaAssets = query({
  args: {
    eventId: v.optional(v.id("events")),
    paginationOpts: paginationOptsValidator,
  },
  returns: mediaAssetPageValidator,
  handler: async (ctx, args) => {
    const context = await requireBandContext(ctx);
    await requireBandAlbumAccess(ctx, context.organizationId);

    let albumLink;
    if (args.eventId) {
      await requireEventMediaAccess(ctx, args.eventId);
      albumLink = await getAlbumLinkForEvent(ctx, args.eventId);
    } else {
      albumLink = await getAlbumLinkForBand(ctx, context.organizationId);
    }
    return await paginateAlbumAssets(ctx, albumLink, args.paginationOpts);
  },
});

export const getEventMediaAlbum = query({
  args: { eventId: v.id("events") },
  returns: v.union(albumLinkValidator, v.null()),
  handler: async (ctx, args) => {
    await requireEventMediaAccess(ctx, args.eventId);
    const albumLink = await getAlbumLinkForEvent(ctx, args.eventId);
    return albumLink ? toAlbumLink(albumLink) : null;
  },
});

export const listEventMediaAssets = query({
  args: {
    eventId: v.id("events"),
    paginationOpts: paginationOptsValidator,
  },
  returns: mediaAssetPageValidator,
  handler: async (ctx, args) => {
    await requireEventMediaAccess(ctx, args.eventId);
    const albumLink = await getAlbumLinkForEvent(ctx, args.eventId);
    return await paginateAlbumAssets(ctx, albumLink, args.paginationOpts);
  },
});

export const getUploadConfig = query({
  args: {
    targetType: entityTypeValue,
    targetId: v.string(),
  },
  returns: v.object({
    albumLinkId: v.id("immichAlbumLinks"),
    immichPublicUrl: v.string(),
    uploadUrl: v.string(),
    shareKey: v.string(),
  }),
  handler: async (ctx, args) => {
    const albumLink =
      args.targetType === "band"
        ? await getAlbumLinkForBand(ctx, args.targetId)
        : await getAlbumLinkForEvent(ctx, args.targetId as Id<"events">);
    if (!albumLink) {
      throw new Error("Album not found. Refresh the page to prepare the album.");
    }
    await canUploadToAlbum(ctx, albumLink);
    if (!albumLink.sharedLinkKey) {
      throw new Error("Album upload is not ready yet. Refresh the page.");
    }
    const immichPublicUrl = getImmichPublicBaseUrl();
    if (!immichPublicUrl) {
      throw new Error("Immich public URL is not configured.");
    }
    return {
      albumLinkId: albumLink._id,
      immichPublicUrl,
      uploadUrl: `${immichPublicUrl}/api/assets`,
      shareKey: albumLink.sharedLinkKey,
    };
  },
});

export const recordUploadedAsset = mutation({
  args: {
    albumLinkId: v.id("immichAlbumLinks"),
    immichAssetId: v.string(),
    originalFileName: v.string(),
    type: immichAssetTypeValue,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const albumLink = await ctx.db.get(args.albumLinkId);
    if (!albumLink) throw new Error("Album not found.");
    await canUploadToAlbum(ctx, albumLink);
    const existing = await ctx.db
      .query("immichAssetRecords")
      .withIndex("by_albumLinkId_and_immichAssetId", (q) =>
        q.eq("albumLinkId", args.albumLinkId).eq("immichAssetId", args.immichAssetId),
      )
      .first();
    if (existing) return null;
    await ctx.db.insert("immichAssetRecords", {
      albumLinkId: args.albumLinkId,
      immichAssetId: args.immichAssetId,
      originalFileName: args.originalFileName,
      type: args.type,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.immichActions.addUploadedAssetToAlbum, {
      albumLinkId: args.albumLinkId,
      immichAssetId: args.immichAssetId,
      originalFileName: args.originalFileName,
      type: args.type,
    });
    return null;
  },
});
export const runBackfillAlbums = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await requireArborInternalContext(ctx);
    await ctx.scheduler.runAfter(0, internal.immichActions.backfillAllAlbums, {});
    await ctx.scheduler.runAfter(0, internal.immichDb.dedupeAllAlbumLinksInternal, {});
    return null;
  },
});

/**
 * Backfill the artist-album mirror for event media uploaded before the mirror
 * shipped.
 *
 * Deliberately an `internalAction`: it is runnable from `convex run` and the
 * Convex dashboard without a user identity, and access is gated by the deploy
 * key (the same authority that can deploy or run any internal function). That
 * avoids the public-action auth dead end — `convex run` sends no identity, so a
 * user-gated entry point could not be invoked at all from the CLI or dashboard.
 *
 * Runs one bounded page inline and returns it, so the operator sees progress
 * and can pass the cursors back to continue until `isDone`. See docs/immich.md.
 */
export const runBackfillArtistAlbumMirror = internalAction({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    assetCursor: v.optional(v.union(v.string(), v.null())),
    assetCursorEventId: v.optional(v.union(v.id("events"), v.null())),
  },
  returns: v.object({
    eventsScanned: v.number(),
    assetsMirrored: v.number(),
    nextCursor: v.union(v.string(), v.null()),
    assetCursor: v.union(v.string(), v.null()),
    assetCursorEventId: v.union(v.id("events"), v.null()),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args): Promise<BackfillRunResult> => {
    return await ctx.runAction(internal.immichActions.backfillArtistAlbumMirror, {
      cursor: args.cursor ?? null,
      assetCursor: args.assetCursor ?? null,
      assetCursorEventId: args.assetCursorEventId ?? null,
    });
  },
});

/** One-shot, fire-and-forget kickoff of the artist-album mirror backfill. */
export const startBackfillArtistAlbumMirror = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.immich.runBackfillArtistAlbumMirror, {});
    return null;
  },
});
