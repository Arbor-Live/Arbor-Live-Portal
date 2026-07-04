"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import {
  addAssetsToImmichAlbum,
  createImmichAlbum,
  getImmichAlbum,
  type ImmichAssetType,
} from "./lib/immichClient";
import { albumLinkResultValidator } from "./lib/immichValidators";

const entityTypeValue = v.union(v.literal("band"), v.literal("event"));

type AlbumLinkResult = {
  albumLinkId: Id<"immichAlbumLinks">;
  immichAlbumId: string;
  albumName: string;
};

async function ensureAlbumCore(
  ctx: ActionCtx,
  args: {
    entityType: "band" | "event";
    entityId: string;
    albumName: string;
    description?: string;
  },
): Promise<AlbumLinkResult> {
  const existing = await ctx.runQuery(internal.immichDb.getAlbumLinkInternal, {
    entityType: args.entityType,
    entityId: args.entityId,
  });
  if (existing) {
    return {
      albumLinkId: existing._id,
      immichAlbumId: existing.immichAlbumId,
      albumName: existing.albumName,
    };
  }

  const created = await createImmichAlbum({
    albumName: args.albumName,
    description: args.description,
  });

  const albumLinkId: Id<"immichAlbumLinks"> = await ctx.runMutation(
    internal.immichDb.insertAlbumLinkInternal,
    {
      entityType: args.entityType,
      entityId: args.entityId,
      immichAlbumId: created.id,
      albumName: args.albumName,
    },
  );

  return {
    albumLinkId,
    immichAlbumId: created.id,
    albumName: args.albumName,
  };
}

export const ensureAlbum = internalAction({
  args: {
    entityType: entityTypeValue,
    entityId: v.string(),
    albumName: v.string(),
    description: v.optional(v.string()),
  },
  returns: albumLinkResultValidator,
  handler: async (ctx, args) => ensureAlbumCore(ctx, args),
});

export const syncAlbumAssets = internalAction({
  args: { albumLinkId: v.id("immichAlbumLinks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const link = await ctx.runQuery(internal.immichDb.getAlbumLinkByIdInternal, {
      albumLinkId: args.albumLinkId,
    });
    if (!link) return null;

    const album = await getImmichAlbum(link.immichAlbumId);
    const assets = album.assets ?? [];
    for (const asset of assets) {
      await ctx.runMutation(internal.immichDb.recordAssetInternal, {
        albumLinkId: args.albumLinkId,
        immichAssetId: asset.id,
        originalFileName: asset.originalFileName,
        type: asset.type as ImmichAssetType,
      });
    }
    return null;
  },
});

export const backfillAllAlbums = internalAction({
  args: {},
  returns: v.object({
    bandAlbums: v.number(),
    eventAlbums: v.number(),
  }),
  handler: async (ctx) => {
    const targets = await ctx.runQuery(internal.immichDb.listBackfillTargetsInternal, {});
    let bandAlbums = 0;
    let eventAlbums = 0;

    for (const band of targets.bands) {
      await ensureAlbumCore(ctx, {
        entityType: "band",
        entityId: band.organizationId,
        albumName: `Band: ${band.displayName}`,
        description: `Arbor Live Portal band album for ${band.displayName}`,
      });
      bandAlbums += 1;
    }

    for (const event of targets.events) {
      await ensureAlbumCore(ctx, {
        entityType: "event",
        entityId: event.eventId,
        albumName: `Event: ${event.title}`,
        description: event.venueName
          ? `${event.title} at ${event.venueName}`
          : event.title,
      });
      eventAlbums += 1;
    }

    return { bandAlbums, eventAlbums };
  },
});

export const addUploadedAssetToAlbum = internalAction({
  args: {
    albumLinkId: v.id("immichAlbumLinks"),
    immichAssetId: v.string(),
    originalFileName: v.string(),
    type: v.union(v.literal("IMAGE"), v.literal("VIDEO")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const link = await ctx.runQuery(internal.immichDb.getAlbumLinkByIdInternal, {
      albumLinkId: args.albumLinkId,
    });
    if (!link) throw new Error("Album link not found.");
    await addAssetsToImmichAlbum(link.immichAlbumId, [args.immichAssetId]);
    await ctx.runMutation(internal.immichDb.recordAssetInternal, {
      albumLinkId: args.albumLinkId,
      immichAssetId: args.immichAssetId,
      originalFileName: args.originalFileName,
      type: args.type,
    });
    return null;
  },
});
