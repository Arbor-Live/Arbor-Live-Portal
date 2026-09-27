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
 * Resumable and bounded. Each invocation mirrors at most
 * `MAX_ASSETS_PER_RUN` assets, walking up to `MAX_EVENTS_PER_RUN` events, and
 * returns an opaque event `cursor` plus (when it stopped mid-event) an
 * `assetCursor` scoped to `assetCursorEventId`. Pass all three back unchanged
 * to continue; re-run until `isDone` is true. Bounding total assets keeps a
 * single invocation inside Convex's action time limit so the operator always
 * gets a cursor for the work that finished.
 */
const MAX_EVENTS_PER_RUN = 25;
/**
 * 200 assets ≈ a few Immich PUTs per second for well under a minute — orders of
 * magnitude inside the 10-minute action limit. Raise it only with a measurement;
 * the point is that a single invocation always finishes and returns a cursor.
 */
const MAX_ASSETS_PER_RUN = 200;

type BackfillArgs = {
  cursor?: string | null;
  assetCursor?: string | null;
  assetCursorEventId?: Id<"events"> | null;
};

type BackfillResult = {
  eventsScanned: number;
  assetsMirrored: number;
  failedArtistMirrors: number;
  nextCursor: string | null;
  assetCursor: string | null;
  assetCursorEventId: Id<"events"> | null;
  isDone: boolean;
};

/** Shape returned by `runBackfillArtistAlbumMirror` (see `immich.ts`). */
export type BackfillRunResult = BackfillResult;

export const backfillArtistAlbumMirror = internalAction({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    assetCursor: v.optional(v.union(v.string(), v.null())),
    assetCursorEventId: v.optional(v.union(v.id("events"), v.null())),
  },
  returns: v.object({
    eventsScanned: v.number(),
    assetsMirrored: v.number(),
    failedArtistMirrors: v.number(),
    nextCursor: v.union(v.string(), v.null()),
    assetCursor: v.union(v.string(), v.null()),
    assetCursorEventId: v.union(v.id("events"), v.null()),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args: BackfillArgs): Promise<BackfillResult> => {
    const page: {
      targets: Array<Id<"events">>;
      nextCursor: string | null;
      isDone: boolean;
    } = await ctx.runQuery(internal.immichDb.listEventMirrorBackfillTargetsInternal, {
      cursor: args.cursor ?? null,
      limit: MAX_EVENTS_PER_RUN,
    });

    let assetsMirrored = 0;
    let failedArtistMirrors = 0;
    let eventsScanned = 0;
    let resumeAssetCursor = args.assetCursor ?? null;
    let resumeEventId = args.assetCursorEventId ?? null;

    // A resumed page re-reads every target up to and including the event we
    // stopped in. Skip the ones already fully processed so the run advances.
    // If that event is no longer a target (album unlinked or participation
    // removed between runs), fall back to scanning the whole page rather than
    // skipping it entirely.
    const resumeEventIsTarget =
      resumeEventId !== null && page.targets.includes(resumeEventId);
    let skippingToResumeEvent = resumeEventIsTarget;

    for (const eventId of page.targets) {
      if (skippingToResumeEvent) {
        if (eventId !== resumeEventId) continue;
        skippingToResumeEvent = false;
      }
      // Resume mid-event only for the event the previous run stopped on; after
      // that, every event starts from its first asset page.
      let cursor: string | null = resumeEventId === eventId ? resumeAssetCursor : null;
      eventsScanned += 1;

      // Resolve the event's artist albums once per event, not per asset: each
      // ensure is an Immich GET/POST, so doing it inside the asset loop turned
      // one event into (assets × artists) Immich calls.
      const artistAlbums = await resolveEventArtistAlbums(ctx, eventId);

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
          const failed = await mirrorAssetIntoAlbums(ctx, artistAlbums, asset);
          assetsMirrored += 1;
          failedArtistMirrors += failed;
        }

        // Check the cap at page boundaries, never mid-page: the resume cursor
        // (`assetsPage.nextCursor`) points past the whole page, so returning it
        // while assets remain unprocessed would silently skip them.
        if (assetsMirrored >= MAX_ASSETS_PER_RUN && !assetsPage.isDone) {
          // Stop inside the current event. Reopen this event's target page
          // (args.cursor) so `assetCursorEventId` is present on resume; the
          // `skippingToResumeEvent` fast-forward skips this page's done events.
          return {
            eventsScanned,
            assetsMirrored,
            failedArtistMirrors,
            nextCursor: args.cursor ?? null,
            assetCursor: assetsPage.nextCursor,
            assetCursorEventId: eventId,
            isDone: false,
          };
        }

        cursor = assetsPage.nextCursor;
        isDone = assetsPage.isDone;
      }
      resumeAssetCursor = null;
      resumeEventId = null;
    }

    return {
      eventsScanned,
      assetsMirrored,
      failedArtistMirrors,
      nextCursor: page.nextCursor,
      assetCursor: null,
      assetCursorEventId: null,
      isDone: page.isDone,
    };
  },
});

/**
 * Each linked artist album for an event, with the album created/verified once.
 * Shared by the backfill and the per-upload mirror so an event's assets reuse
 * one round of album resolution.
 */
async function resolveEventArtistAlbums(
  ctx: ActionCtx,
  eventId: Id<"events">,
): Promise<Array<{ albumLinkId: Id<"immichAlbumLinks">; immichAlbumId: string }>> {
  const artists: Array<{ organizationId: string; displayName: string }> = await ctx.runQuery(
    internal.immichDb.listEventArtistOrgsInternal,
    { eventId },
  );
  const albums: Array<{ albumLinkId: Id<"immichAlbumLinks">; immichAlbumId: string }> = [];
  for (const artist of artists) {
    const album = await ensureAlbumCore(ctx, {
      entityType: "band",
      entityId: artist.organizationId,
      albumName: `Band: ${artist.displayName}`,
      description: `Arbor Live Portal band album for ${artist.displayName}`,
    });
    albums.push({ albumLinkId: album.albumLinkId, immichAlbumId: album.immichAlbumId });
  }
  return albums;
}

/**
 * Add one already-uploaded asset to each resolved artist album and record it.
 * Best-effort per artist: the event album copy is already saved, so one bad
 * artist album must not fail the others. Returns how many artist albums failed
 * so callers can report an incomplete mirror instead of silently claiming
 * success.
 */
async function mirrorAssetIntoAlbums(
  ctx: ActionCtx,
  albums: Array<{ albumLinkId: Id<"immichAlbumLinks">; immichAlbumId: string }>,
  asset: { immichAssetId: string; originalFileName: string; type: "IMAGE" | "VIDEO" },
): Promise<number> {
  let failed = 0;
  for (const album of albums) {
    try {
      await addAssetsToImmichAlbum(album.immichAlbumId, [asset.immichAssetId]);
      await ctx.runMutation(internal.immichDb.recordAssetInternal, {
        albumLinkId: album.albumLinkId,
        immichAssetId: asset.immichAssetId,
        originalFileName: asset.originalFileName,
        type: asset.type,
      });
    } catch (error) {
      failed += 1;
      console.error(
        `Failed to mirror asset ${asset.immichAssetId} into artist album ${album.albumLinkId}`,
        error,
      );
    }
  }
  return failed;
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
      const eventId = link.entityId as Id<"events">;
      const artistAlbums = await resolveEventArtistAlbums(ctx, eventId);
      const failed = await mirrorAssetIntoAlbums(ctx, artistAlbums, {
        immichAssetId: args.immichAssetId,
        originalFileName: args.originalFileName,
        type: args.type,
      });
      if (failed > 0) {
        // No retry here (scheduled actions aren't retried) — surface it so a
        // stuck artist album is visible rather than a silent success.
        console.error(
          `Event asset ${args.immichAssetId} failed to mirror into ${failed} artist album(s); re-run the backfill to catch up.`,
        );
      }
    }

    await ctx.runAction(internal.immichActions.syncAlbumAssets, {
      albumLinkId: args.albumLinkId,
    });
    return null;
  },
});
