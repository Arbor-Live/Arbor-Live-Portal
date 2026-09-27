"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import {
  addAssetsToImmichAlbum,
  buildImmichShareUrl,
  createImmichAlbum,
  createImmichAlbumSharedLink,
  immichAlbumExists,
  isImmichConfigured,
  listImmichAlbumAssets,
} from "./lib/immichClient";
import { albumLinkResultValidator } from "./lib/immichValidators";

const entityTypeValue = v.union(v.literal("band"), v.literal("event"));

type AlbumLinkResult = {
  albumLinkId: Id<"immichAlbumLinks">;
  immichAlbumId: string;
  albumName: string;
};

async function ensureSharedLinkForAlbum(
  ctx: ActionCtx,
  args: {
    albumLinkId: Id<"immichAlbumLinks">;
    immichAlbumId: string;
    description?: string;
  },
) {
  const link = await ctx.runQuery(internal.immichDb.getAlbumLinkByIdInternal, {
    albumLinkId: args.albumLinkId,
  });
  if (link?.sharedLinkKey && link.shareUrl) {
    return;
  }

  const shared = await createImmichAlbumSharedLink({
    albumId: args.immichAlbumId,
    description: args.description,
  });
  const shareUrl = buildImmichShareUrl(shared.key);
  if (!shareUrl) {
    throw new Error("Immich public URL is not configured.");
  }

  await ctx.runMutation(internal.immichDb.saveSharedLinkInternal, {
    albumLinkId: args.albumLinkId,
    sharedLinkId: shared.id,
    sharedLinkKey: shared.key,
    shareUrl,
  });
}

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
    const albumStillExists = await immichAlbumExists(existing.immichAlbumId);
    if (albumStillExists) {
      await ensureSharedLinkForAlbum(ctx, {
        albumLinkId: existing._id,
        immichAlbumId: existing.immichAlbumId,
        description: args.description ?? args.albumName,
      });
      return {
        albumLinkId: existing._id,
        immichAlbumId: existing.immichAlbumId,
        albumName: existing.albumName,
      };
    }
    await ctx.runMutation(internal.immichDb.deleteAlbumLinkInternal, {
      albumLinkId: existing._id,
    });
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

  // Concurrent ensures can race on create; insert keeps the first link. Always
  // attach the share URL to the winning link's Immich album, not our local create.
  const link: {
    immichAlbumId: string;
    albumName: string;
    shareUrl?: string;
  } | null = await ctx.runQuery(internal.immichDb.getAlbumLinkByIdInternal, {
    albumLinkId,
  });
  if (!link) {
    throw new Error("Immich album link missing after insert.");
  }

  await ensureSharedLinkForAlbum(ctx, {
    albumLinkId,
    immichAlbumId: link.immichAlbumId,
    description: args.description ?? args.albumName,
  });

  return {
    albumLinkId,
    immichAlbumId: link.immichAlbumId,
    albumName: link.albumName,
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

/**
 * Create/link the event Immich album when Immich is configured.
 * Failures are swallowed so email / portal paths can continue without a share URL.
 */
export const ensureEventAlbumBestEffort = internalAction({
  args: { eventId: v.id("events") },
  returns: v.union(
    v.null(),
    v.object({
      shareUrl: v.optional(v.string()),
      error: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args): Promise<{ shareUrl?: string; error?: string } | null> => {
    if (!isImmichConfigured()) return null;
    const meta: { title: string; venueName?: string } | null = await ctx.runQuery(
      internal.immichDb.getEventAlbumEnsureMetaInternal,
      { eventId: args.eventId },
    );
    if (!meta) return null;
    try {
      const ensured = await ensureAlbumCore(ctx, {
        entityType: "event",
        entityId: args.eventId,
        albumName: `Event: ${meta.title}`,
        description: meta.venueName ? `${meta.title} at ${meta.venueName}` : meta.title,
      });
      const link: { shareUrl?: string } | null = await ctx.runQuery(
        internal.immichDb.getAlbumLinkByIdInternal,
        { albumLinkId: ensured.albumLinkId },
      );
      return { shareUrl: link?.shareUrl };
    } catch (error) {
      // Immich is optional, but callers still need to know the album is missing.
      const message = error instanceof Error ? error.message : "Immich album ensure failed.";
      console.error(
        `[immichActions] ensureEventAlbumBestEffort failed for event ${args.eventId}: ${message}`,
      );
      return { error: message };
    }
  },
});

export const syncAlbumAssets = internalAction({
  args: { albumLinkId: v.id("immichAlbumLinks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const link = await ctx.runQuery(internal.immichDb.getAlbumLinkByIdInternal, {
      albumLinkId: args.albumLinkId,
    });
    if (!link) return null;

    const assets = await listImmichAlbumAssets(link.immichAlbumId);
    for (const asset of assets) {
      await ctx.runMutation(internal.immichDb.recordAssetInternal, {
        albumLinkId: args.albumLinkId,
        immichAssetId: asset.id,
        originalFileName: asset.originalFileName,
        type: asset.type,
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

/**
 * Backfill: copy every asset already in an event album into each linked
 * artist's album. Runs after the feature shipped so existing event media shows
 * up in artist albums, which only got mirrored uploads from then on.
 *
 * Resumable via an opaque Convex cursor over the event table. Each event's
 * album is drained page by page in the same invocation, so a large album is
 * never truncated. The cursor comes back in the result and must be passed to
 * the next invocation unchanged; re-run until `isDone` is true.
 */
const MAX_EVENTS_PER_RUN = 25;

export const backfillArtistAlbumMirror = internalAction({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.object({
    eventsScanned: v.number(),
    assetsMirrored: v.number(),
    nextCursor: v.union(v.string(), v.null()),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args): Promise<{
    eventsScanned: number;
    assetsMirrored: number;
    nextCursor: string | null;
    isDone: boolean;
  }> => {
    const page: {
      targets: Array<Id<"events">>;
      nextCursor: string | null;
      isDone: boolean;
    } = await ctx.runQuery(internal.immichDb.listEventMirrorBackfillTargetsInternal, {
      cursor: args.cursor ?? null,
      limit: MAX_EVENTS_PER_RUN,
    });

    let assetsMirrored = 0;
    let eventsScanned = 0;

    for (const eventId of page.targets) {
      eventsScanned += 1;
      let cursor: string | null = null;
      let isDone = false;
      while (!isDone) {
        const assetsPage: {
          assets: Array<{
            immichAssetId: string;
            originalFileName: string;
            type: "IMAGE" | "VIDEO";
          }>;
          nextCursor: string | null;
          isDone: boolean;
        } = await ctx.runQuery(internal.immichDb.listEventAlbumAssetsPageInternal, {
          eventId,
          cursor,
        });

        for (const asset of assetsPage.assets) {
          try {
            await mirrorEventAssetToArtistAlbums(ctx, { eventId, ...asset });
            assetsMirrored += 1;
          } catch (error) {
            console.error(
              `Backfill: failed to mirror asset ${asset.immichAssetId} for event ${eventId}`,
              error,
            );
          }
        }

        cursor = assetsPage.nextCursor;
        isDone = assetsPage.isDone;
      }
    }

    return {
      eventsScanned,
      assetsMirrored,
      nextCursor: page.nextCursor,
      isDone: page.isDone,
    };
  },
});

/**
 * An asset uploaded to an event also belongs in each linked artist's album, so
 * an artist's album is the one place with all of their photos. Best-effort per
 * artist: the event album copy is already saved, so one bad artist album must
 * not fail the others.
 */
async function mirrorEventAssetToArtistAlbums(
  ctx: ActionCtx,
  args: {
    eventId: Id<"events">;
    immichAssetId: string;
    originalFileName: string;
    type: "IMAGE" | "VIDEO";
  },
) {
  const artists: Array<{ organizationId: string; displayName: string }> = await ctx.runQuery(
    internal.immichDb.listEventArtistOrgsInternal,
    { eventId: args.eventId },
  );

  for (const artist of artists) {
    try {
      const album = await ensureAlbumCore(ctx, {
        entityType: "band",
        entityId: artist.organizationId,
        albumName: `Band: ${artist.displayName}`,
        description: `Arbor Live Portal band album for ${artist.displayName}`,
      });
      await addAssetsToImmichAlbum(album.immichAlbumId, [args.immichAssetId]);
      await ctx.runMutation(internal.immichDb.recordAssetInternal, {
        albumLinkId: album.albumLinkId,
        immichAssetId: args.immichAssetId,
        originalFileName: args.originalFileName,
        type: args.type,
      });
    } catch (error) {
      console.error(
        `Failed to mirror asset ${args.immichAssetId} into artist album ${artist.organizationId}`,
        error,
      );
    }
  }
}

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

    // Mirror before the event-album resync: syncAlbumAssets can fail on an
    // Immich hiccup, and scheduled actions are not retried, so mirroring first
    // keeps the artist albums in step with the asset we just recorded.
    if (link.entityType === "event") {
      await mirrorEventAssetToArtistAlbums(ctx, {
        eventId: link.entityId as Id<"events">,
        immichAssetId: args.immichAssetId,
        originalFileName: args.originalFileName,
        type: args.type,
      });
    }

    await ctx.runAction(internal.immichActions.syncAlbumAssets, {
      albumLinkId: args.albumLinkId,
    });
    return null;
  },
});
