import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { components } from "./_generated/api";
import { requireBandContext } from "./lib/auth";
import { requireEventMediaAccess as requireEventMediaAccessFromImmich } from "./lib/immichAccess";

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
    const row = await ctx.db
      .query("immichAlbumLinks")
      .withIndex("by_entityType_and_entityId", (q) =>
        q.eq("entityType", args.entityType).eq("entityId", args.entityId),
      )
      .unique();
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
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.albumLinkId);
    if (!row) return null;
    return row;
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
      .withIndex("by_immichAssetId", (q) => q.eq("immichAssetId", args.immichAssetId))
      .unique();
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
