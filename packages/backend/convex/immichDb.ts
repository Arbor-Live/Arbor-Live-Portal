import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { components } from "./_generated/api";
import { requireBandContext } from "./lib/auth";
import { requireEventMediaAccess as requireEventMediaAccessFromImmich } from "./lib/immichAccess";
import { dedupeAlbumLinksForEntity, getCanonicalAlbumLink } from "./lib/immichAlbumLinks";

const entityTypeValue = v.union(v.literal("band"), v.literal("event"));
const assetTypeValue = v.union(v.literal("IMAGE"), v.literal("VIDEO"));

function formatPacificDate(ms: number) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(ms));
}

async function resolveBandDisplayName(ctx: QueryCtx | MutationCtx, organizationId: string) {
  const profile = await ctx.db
    .query("organizationProfiles")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .unique();
  if (profile?.displayName) return profile.displayName;
  const orgRows = (await ctx.runQuery(components.betterAuth.adapter.findMany, {
    model: "organization",
    paginationOpts: { cursor: null, numItems: 500 },
  })) as { page?: Array<{ id?: string; _id?: string; name?: string }> } | null;
  const org = (orgRows?.page ?? []).find(
    (row) => (row.id ?? row._id) === organizationId,
  );
  return org?.name ?? "Band";
}

export const getAlbumLinkInternal = internalQuery({
  args: {
    entityType: entityTypeValue,
    entityId: v.string(),
  },
  returns: v.union(
    v.object({
      _id: v.id("immichAlbumLinks"),
      immichAlbumId: v.string(),
      albumName: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const row = await getCanonicalAlbumLink(ctx, args.entityType, args.entityId);
    if (!row) return null;
    return { _id: row._id, immichAlbumId: row.immichAlbumId, albumName: row.albumName };
  },
});

export const getAlbumLinkByIdInternal = internalQuery({
  args: { albumLinkId: v.id("immichAlbumLinks") },
  returns: v.union(
    v.object({
      _id: v.id("immichAlbumLinks"),
      immichAlbumId: v.string(),
      albumName: v.string(),
      entityType: entityTypeValue,
      entityId: v.string(),
      sharedLinkId: v.optional(v.string()),
      sharedLinkKey: v.optional(v.string()),
      shareUrl: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.albumLinkId);
    if (!row) return null;
    return {
      _id: row._id,
      immichAlbumId: row.immichAlbumId,
      albumName: row.albumName,
      entityType: row.entityType,
      entityId: row.entityId,
      sharedLinkId: row.sharedLinkId,
      sharedLinkKey: row.sharedLinkKey,
      shareUrl: row.shareUrl,
    };
  },
});

export const saveSharedLinkInternal = internalMutation({
  args: {
    albumLinkId: v.id("immichAlbumLinks"),
    sharedLinkId: v.string(),
    sharedLinkKey: v.string(),
    shareUrl: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.albumLinkId, {
      sharedLinkId: args.sharedLinkId,
      sharedLinkKey: args.sharedLinkKey,
      shareUrl: args.shareUrl,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const deleteAlbumLinkInternal = internalMutation({
  args: { albumLinkId: v.id("immichAlbumLinks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const assets = await ctx.db
      .query("immichAssetRecords")
      .withIndex("by_albumLinkId", (q) => q.eq("albumLinkId", args.albumLinkId))
      .take(500);
    for (const asset of assets) {
      await ctx.db.delete(asset._id);
    }
    await ctx.db.delete(args.albumLinkId);
    return null;
  },
});

export const insertAlbumLinkInternal = internalMutation({
  args: {
    entityType: entityTypeValue,
    entityId: v.string(),
    immichAlbumId: v.string(),
    albumName: v.string(),
  },
  returns: v.id("immichAlbumLinks"),
  handler: async (ctx, args) => {
    const existing = await getCanonicalAlbumLink(ctx, args.entityType, args.entityId);
    if (existing) {
      await dedupeAlbumLinksForEntity(ctx, args.entityType, args.entityId);
      return existing._id;
    }

    const now = Date.now();
    return await ctx.db.insert("immichAlbumLinks", {
      entityType: args.entityType,
      entityId: args.entityId,
      immichAlbumId: args.immichAlbumId,
      albumName: args.albumName,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const recordAssetInternal = internalMutation({
  args: {
    albumLinkId: v.id("immichAlbumLinks"),
    immichAssetId: v.string(),
    originalFileName: v.string(),
    type: assetTypeValue,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
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
    return null;
  },
});

export const listBackfillTargetsInternal = internalQuery({
  args: {},
  returns: v.object({
    bands: v.array(
      v.object({
        organizationId: v.string(),
        displayName: v.string(),
      }),
    ),
    events: v.array(
      v.object({
        eventId: v.string(),
        title: v.string(),
        venueName: v.optional(v.string()),
      }),
    ),
  }),
  handler: async (ctx) => {
    const profiles = await ctx.db
      .query("organizationProfiles")
      .withIndex("by_organizationType", (q) => q.eq("organizationType", "band"))
      .take(500);
    const events = await ctx.db.query("events").withIndex("by_createdAt").take(500);
    const bands = [];
    for (const profile of profiles) {
      bands.push({
        organizationId: profile.organizationId,
        displayName: profile.displayName ?? "Band",
      });
    }
    return {
      bands,
      events: events.map((event) => ({
        eventId: event._id,
        title: `${event.title} — ${formatPacificDate(event.startAt)}`,
        venueName: event.venueName,
      })),
    };
  },
});

export const getActiveBandContextInternal = internalQuery({
  args: {},
  returns: v.union(
    v.object({
      organizationId: v.string(),
      organizationName: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    try {
      const context = await requireBandContext(ctx);
      return {
        organizationId: context.organizationId,
        organizationName: context.organizationName,
      };
    } catch {
      return null;
    }
  },
});

export const getBandDisplayNameInternal = internalQuery({
  args: { organizationId: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    return await resolveBandDisplayName(ctx, args.organizationId);
  },
});

/**
 * Artist organizations on an event's lineup — the albums that event media
 * should also flow into so each artist has one central album.
 */
export const listEventArtistOrgsInternal = internalQuery({
  args: { eventId: v.id("events") },
  returns: v.array(
    v.object({
      organizationId: v.string(),
      displayName: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const participations = await ctx.db
      .query("eventBandParticipations")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(50);
    const seen = new Set<string>();
    const artists: Array<{ organizationId: string; displayName: string }> = [];
    for (const row of participations) {
      if (seen.has(row.organizationId)) continue;
      seen.add(row.organizationId);
      artists.push({
        organizationId: row.organizationId,
        displayName: await resolveBandDisplayName(ctx, row.organizationId),
      });
    }
    return artists;
  },
});

export const getEventMetaInternal = internalQuery({
  args: { eventId: v.id("events") },
  returns: v.union(
    v.object({
      title: v.string(),
      venueName: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    await requireEventMediaAccessFromImmich(ctx, args.eventId);
    const event = await ctx.db.get(args.eventId);
    if (!event) return null;
    return {
      title: `${event.title} — ${formatPacificDate(event.startAt)}`,
      venueName: event.venueName,
    };
  },
});

/**
 * Page of events that have event media to mirror into artist albums. Newest
 * first, keyed off `_creationTime`, so re-running with the returned cursor
 * walks the whole table. Only events with at least one mirror row and a lineup
 * are worth scanning; the mirror step skips events with no participations.
 */
export const listEventMirrorBackfillTargetsInternal = internalQuery({
  args: { cursor: v.number(), limit: v.number() },
  returns: v.object({
    targets: v.array(v.id("events")),
    nextCursor: v.union(v.number(), v.null()),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("events")
      .order("desc")
      .paginate({ numItems: args.limit, cursor: args.cursor === 0 ? null : String(args.cursor) });

    const targets: Id<"events">[] = [];
    for (const event of events.page) {
      const albumLink = await ctx.db
        .query("immichAlbumLinks")
        .withIndex("by_entityType_and_entityId", (q) =>
          q.eq("entityType", "event").eq("entityId", event._id),
        )
        .first();
      if (!albumLink) continue;
      const participation = await ctx.db
        .query("eventBandParticipations")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .first();
      if (!participation) continue;
      targets.push(event._id);
    }

    return {
      targets,
      nextCursor: events.isDone ? null : Number(events.continueCursor),
      isDone: events.isDone,
    };
  },
});

/** Asset rows already mirrored for an event album (no Immich calls). */
export const listEventAlbumAssetsInternal = internalQuery({
  args: { eventId: v.id("events") },
  returns: v.array(
    v.object({
      immichAssetId: v.string(),
      originalFileName: v.string(),
      type: assetTypeValue,
    }),
  ),
  handler: async (ctx, args) => {
    const albumLink = await getCanonicalAlbumLink(ctx, "event", args.eventId);
    if (!albumLink) return [];
    const rows = await ctx.db
      .query("immichAssetRecords")
      .withIndex("by_albumLinkId", (q) => q.eq("albumLinkId", albumLink._id))
      .take(500);
    return rows.map((row) => ({
      immichAssetId: row.immichAssetId,
      originalFileName: row.originalFileName,
      type: row.type,
    }));
  },
});

/** Auth-free naming meta for cron / email ensure-on-send paths. */
export const getEventAlbumEnsureMetaInternal = internalQuery({
  args: { eventId: v.id("events") },
  returns: v.union(
    v.object({
      title: v.string(),
      venueName: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) return null;
    return {
      title: `${event.title} — ${formatPacificDate(event.startAt)}`,
      venueName: event.venueName,
    };
  },
});

export const dedupeAllAlbumLinksInternal = internalMutation({
  args: {},
  returns: v.object({ dedupedEntities: v.number() }),
  handler: async (ctx) => {
    const links = await ctx.db.query("immichAlbumLinks").take(2000);
    const byKey = new Map<string, Array<(typeof links)[number]>>();
    for (const link of links) {
      const key = `${link.entityType}:${link.entityId}`;
      const group = byKey.get(key) ?? [];
      group.push(link);
      byKey.set(key, group);
    }

    let dedupedEntities = 0;
    for (const [key, group] of byKey) {
      if (group.length <= 1) continue;
      const [entityType, entityId] = key.split(":") as ["band" | "event", string];
      await dedupeAlbumLinksForEntity(ctx, entityType, entityId);
      dedupedEntities += 1;
    }
    return { dedupedEntities };
  },
});
