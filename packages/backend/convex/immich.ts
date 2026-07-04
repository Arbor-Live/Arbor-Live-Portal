import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import {
  canUploadToAlbum,
  getAlbumLinkForBand,
  getAlbumLinkForEvent,
  getAlbumLinkIdsForEntity,
  requireAssetAccess,
  requireBandAlbumAccess,
  requireEventMediaAccess,
} from "./lib/immichAccess";
import { buildImmichAlbumUrl, buildSharedAssetUrl, getImmichPublicBaseUrl } from "./lib/immichClient";
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

function toMediaAsset(row: Doc<"immichAssetRecords">, shareKey: string) {
  return {
    immichAssetId: row.immichAssetId,
    originalFileName: row.originalFileName,
    type: row.type,
    createdAt: row.createdAt,
    thumbnailUrl: buildSharedAssetUrl(row.immichAssetId, "thumbnail", shareKey),
    originalUrl: buildSharedAssetUrl(row.immichAssetId, "original", shareKey),
    playbackUrl:
      row.type === "VIDEO"
        ? buildSharedAssetUrl(row.immichAssetId, "playback", shareKey)
        : undefined,
  };
}

async function listAssetsForAlbumLinks(
  ctx: QueryCtx,
  albumLinkIds: Id<"immichAlbumLinks">[],
  shareKey?: string,
) {
  if (!shareKey) return [];
  const seen = new Set<string>();
  const assets = [];
  for (const albumLinkId of albumLinkIds) {
    const rows = await ctx.db
      .query("immichAssetRecords")
      .withIndex("by_albumLinkId", (q) => q.eq("albumLinkId", albumLinkId))
      .take(500);
    for (const row of rows) {
      if (seen.has(row.immichAssetId)) continue;
      seen.add(row.immichAssetId);
      assets.push(toMediaAsset(row, shareKey));
    }
  }
  return assets.sort((a, b) => b.createdAt - a.createdAt);
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
        album: toAlbumLink(albumLink),
        assets: await listAssetsForAlbumLinks(
          ctx,
          await getAlbumLinkIdsForEntity(ctx, "event", args.eventId),
          albumLink.sharedLinkKey,
        ),
      };
    }

    const albumLink = await getAlbumLinkForBand(ctx, context.organizationId);
    if (!albumLink) {
      return { album: null, assets: [] };
    }
    return {
      album: toAlbumLink(albumLink),
      assets: await listAssetsForAlbumLinks(
        ctx,
        await getAlbumLinkIdsForEntity(ctx, "band", context.organizationId),
        albumLink.sharedLinkKey,
      ),
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
      album: toAlbumLink(albumLink),
      assets: await listAssetsForAlbumLinks(
        ctx,
        await getAlbumLinkIdsForEntity(ctx, "event", args.eventId),
        albumLink.sharedLinkKey,
      ),
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
      albumUrl: buildImmichAlbumUrl(albumLink.immichAlbumId),
    };
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

export const refreshAlbumMedia = mutation({
  args: { albumLinkId: v.id("immichAlbumLinks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const albumLink = await ctx.db.get(args.albumLinkId);
    if (!albumLink) throw new Error("Album not found.");
    await canUploadToAlbum(ctx, albumLink);
    await ctx.scheduler.runAfter(0, internal.immichActions.syncAlbumAssets, {
      albumLinkId: args.albumLinkId,
    });
    return null;
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
    const existing = await ctx.db
      .query("immichAssetRecords")
      .withIndex("by_immichAssetId", (q) => q.eq("immichAssetId", args.immichAssetId))
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
