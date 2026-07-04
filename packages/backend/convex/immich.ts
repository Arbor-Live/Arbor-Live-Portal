import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import {
  canUploadToAlbum,
  getAlbumLinkForBand,
  getAlbumLinkForEvent,
  requireAssetAccess,
  requireBandAlbumAccess,
  requireEventMediaAccess,
} from "./lib/immichAccess";
import { buildImmichProxyUrl } from "./lib/immichClient";
import { requireArborInternalContext, requireAuth, requireBandContext } from "./lib/auth";

const entityTypeValue = v.union(v.literal("band"), v.literal("event"));
const assetTypeValue = v.union(v.literal("IMAGE"), v.literal("VIDEO"));

const mediaAssetValidator = v.object({
  immichAssetId: v.string(),
  originalFileName: v.string(),
  type: assetTypeValue,
  createdAt: v.number(),
  thumbnailUrl: v.string(),
  originalUrl: v.string(),
  playbackUrl: v.optional(v.string()),
});

const albumLinkValidator = v.object({
  albumLinkId: v.id("immichAlbumLinks"),
  immichAlbumId: v.string(),
  albumName: v.string(),
});

function toMediaAsset(row: Doc<"immichAssetRecords">) {
  return {
    immichAssetId: row.immichAssetId,
    originalFileName: row.originalFileName,
    type: row.type,
    createdAt: row.createdAt,
    thumbnailUrl: buildImmichProxyUrl(row.immichAssetId, "thumbnail"),
    originalUrl: buildImmichProxyUrl(row.immichAssetId, "original"),
    playbackUrl: row.type === "VIDEO" ? buildImmichProxyUrl(row.immichAssetId, "playback") : undefined,
  };
}

async function listAssetsForAlbumLink(ctx: { db: QueryCtx["db"] }, albumLinkId: Id<"immichAlbumLinks">) {
  const rows = await ctx.db
    .query("immichAssetRecords")
    .withIndex("by_albumLinkId", (q) => q.eq("albumLinkId", albumLinkId))
    .take(500);
  return rows.sort((a, b) => b.createdAt - a.createdAt).map(toMediaAsset);
}

export const listBandMedia = query({
  args: { eventId: v.optional(v.id("events")) },
  returns: v.object({
    album: v.union(albumLinkValidator, v.null()),
    assets: v.array(mediaAssetValidator),
  }),
  handler: async (ctx, args) => {
    const context = await requireBandContext(ctx);
    await requireBandAlbumAccess(ctx, context.organizationId);

    if (args.eventId) {
      await requireEventMediaAccess(ctx, args.eventId);
      const albumLink = await getAlbumLinkForEvent(ctx, args.eventId);
      if (!albumLink) {
        return { album: null, assets: [] };
      }
      return {
        album: {
          albumLinkId: albumLink._id,
          immichAlbumId: albumLink.immichAlbumId,
          albumName: albumLink.albumName,
        },
        assets: await listAssetsForAlbumLink(ctx, albumLink._id),
      };
    }

    const albumLink = await getAlbumLinkForBand(ctx, context.organizationId);
    if (!albumLink) {
      return { album: null, assets: [] };
    }
    return {
      album: {
        albumLinkId: albumLink._id,
        immichAlbumId: albumLink.immichAlbumId,
        albumName: albumLink.albumName,
      },
      assets: await listAssetsForAlbumLink(ctx, albumLink._id),
    };
  },
});

export const listEventMedia = query({
  args: { eventId: v.id("events") },
  returns: v.object({
    album: v.union(albumLinkValidator, v.null()),
    assets: v.array(mediaAssetValidator),
  }),
  handler: async (ctx, args) => {
    await requireEventMediaAccess(ctx, args.eventId);
    const albumLink = await getAlbumLinkForEvent(ctx, args.eventId);
    if (!albumLink) {
      return { album: null, assets: [] };
    }
    return {
      album: {
        albumLinkId: albumLink._id,
        immichAlbumId: albumLink.immichAlbumId,
        albumName: albumLink.albumName,
      },
      assets: await listAssetsForAlbumLink(ctx, albumLink._id),
    };
  },
});

export const verifyAssetAccess = query({
  args: { immichAssetId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    try {
      await requireAssetAccess(ctx, args.immichAssetId);
      return true;
    } catch {
      return false;
    }
  },
});

export const getUploadTarget = query({
  args: {
    targetType: entityTypeValue,
    targetId: v.string(),
  },
  returns: v.union(albumLinkValidator, v.null()),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const albumLink =
      args.targetType === "band"
        ? await getAlbumLinkForBand(ctx, args.targetId)
        : await getAlbumLinkForEvent(ctx, args.targetId as Id<"events">);
    if (!albumLink) return null;
    await canUploadToAlbum(ctx, albumLink);
    return {
      albumLinkId: albumLink._id,
      immichAlbumId: albumLink.immichAlbumId,
      albumName: albumLink.albumName,
    };
  },
});

export const recordUploadedAsset = mutation({
  args: {
    albumLinkId: v.id("immichAlbumLinks"),
    immichAssetId: v.string(),
    originalFileName: v.string(),
    type: assetTypeValue,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const albumLink = await ctx.db.get(args.albumLinkId);
    if (!albumLink) throw new Error("Album not found.");
    await canUploadToAlbum(ctx, albumLink);
    await ctx.db.insert("immichAssetRecords", {
      albumLinkId: args.albumLinkId,
      immichAssetId: args.immichAssetId,
      originalFileName: args.originalFileName,
      type: args.type,
      createdAt: Date.now(),
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
    return null;
  },
});
