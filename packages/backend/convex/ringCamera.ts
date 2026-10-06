import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { getUserId, isPortalAdmin, requireAuth } from "./lib/auth";

/** Clips (and their thumbnails) older than this are pruned. */
export const RING_CLIP_RETENTION_MS = 60 * 24 * 60 * 60 * 1000;

const clipKindValue = v.union(v.literal("motion"), v.literal("ding"), v.literal("live"), v.literal("other"));

const cameraValue = v.object({
  deviceId: v.number(),
  name: v.string(),
  locationId: v.string(),
  model: v.string(),
  batteryPercent: v.optional(v.number()),
  online: v.optional(v.boolean()),
});

/**
 * Camera footage is Arbor-staff only: the membership-derived portal admin
 * check, not the Better Auth role cache that artist org admins also carry.
 */
async function requireCameraAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await requireAuth(ctx);
  const userId = getUserId(user);
  if (!(await isPortalAdmin(ctx, userId))) {
    throw new Error("Admin access required.");
  }
  return userId;
}

async function getConnectionRow(ctx: QueryCtx | MutationCtx) {
  return await ctx.db.query("ringConnection").first();
}

/**
 * A sync belongs to the connection row and camera it started with. Reconnecting
 * the same camera keeps both; disconnecting or switching cameras (another Ring
 * account) makes its results stale.
 */
const syncOriginValue = v.object({ connectionId: v.id("ringConnection"), deviceId: v.number() });

async function isCurrentSync(
  ctx: MutationCtx,
  origin: { connectionId: Id<"ringConnection">; deviceId: number },
) {
  const connection = await getConnectionRow(ctx);
  return connection?._id === origin.connectionId && connection.camera?.deviceId === origin.deviceId;
}

async function toClipRow(ctx: QueryCtx, clip: Doc<"ringClips">) {
  return {
    _id: clip._id,
    kind: clip.kind,
    createdAt: clip.createdAt,
    durationSec: clip.durationSec ?? null,
    personDetected: clip.personDetected,
    thumbnailUrl: clip.thumbnailStorageId ? await ctx.storage.getUrl(clip.thumbnailStorageId) : null,
  };
}

/** Connection status and the camera header. Never returns the token. */
export const getOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireCameraAdmin(ctx);
    const connection = await getConnectionRow(ctx);
    if (!connection) return null;
    const latest = await ctx.db.query("ringClips").withIndex("by_createdAt").order("desc").first();
    return {
      status: connection.status,
      lastError: connection.lastError ?? null,
      camera: connection.camera ?? null,
      lastSyncedAt: connection.lastSyncedAt ?? null,
      latestClip: latest ? await toClipRow(ctx, latest) : null,
    };
  },
});

/** Clips newest first, optionally of one kind and from before an instant ("jump to date"). */
export const listClips = query({
  args: {
    paginationOpts: paginationOptsValidator,
    kind: v.optional(clipKindValue),
    before: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCameraAdmin(ctx);
    const { kind, before } = args;
    const clips = kind
      ? ctx.db
          .query("ringClips")
          .withIndex("by_kind_and_createdAt", (q) =>
            before === undefined ? q.eq("kind", kind) : q.eq("kind", kind).lt("createdAt", before),
          )
      : ctx.db
          .query("ringClips")
          .withIndex("by_createdAt", (q) => (before === undefined ? q : q.lt("createdAt", before)));
    const result = await clips.order("desc").paginate(args.paginationOpts);
    return { ...result, page: await Promise.all(result.page.map((clip) => toClipRow(ctx, clip))) };
  },
});

/** Forget the Ring sign-in. Synced clips stay until they age out. */
export const disconnect = mutation({
  args: {},
  handler: async (ctx) => {
    await requireCameraAdmin(ctx);
    const connection = await getConnectionRow(ctx);
    if (connection) await ctx.db.delete("ringConnection", connection._id);
    return null;
  },
});

/** For actions: throws unless the caller is a portal admin. */
export const assertCameraAdmin = internalQuery({
  args: {},
  handler: async (ctx) => await requireCameraAdmin(ctx),
});

export const getConnection = internalQuery({
  args: {},
  handler: async (ctx) => await getConnectionRow(ctx),
});

export const getClip = internalQuery({
  args: { clipId: v.id("ringClips") },
  handler: async (ctx, args) => await ctx.db.get("ringClips", args.clipId),
});

export const saveConnection = internalMutation({
  args: {
    refreshToken: v.string(),
    hardwareId: v.string(),
    accessToken: v.string(),
    accessTokenExpiresAt: v.number(),
    camera: cameraValue,
    connectedByUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await getConnectionRow(ctx);
    // A different camera starts its sync over; the same one carries on.
    const syncedThrough =
      existing?.camera?.deviceId === args.camera.deviceId ? existing.syncedThrough : undefined;
    const row = {
      ...args,
      status: "connected" as const,
      syncedThrough,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    if (existing) await ctx.db.replace("ringConnection", existing._id, row);
    else await ctx.db.insert("ringConnection", row);
    // Clips from another camera (a different Ring account) don't belong on this page.
    if (syncedThrough === undefined) {
      await ctx.scheduler.runAfter(0, internal.ringCamera.removeOtherCameraClips, {
        deviceId: args.camera.deviceId,
        cursor: null,
      });
    }
    return null;
  },
});

/**
 * Store a rotated token, unless another action already rotated it (Ring
 * replaces the refresh token on every use). Returns whether this one won.
 */
export const saveAuth = internalMutation({
  args: {
    expectedRefreshToken: v.string(),
    refreshToken: v.string(),
    accessToken: v.string(),
    accessTokenExpiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const connection = await getConnectionRow(ctx);
    if (!connection || connection.refreshToken !== args.expectedRefreshToken) return false;
    await ctx.db.patch("ringConnection", connection._id, {
      refreshToken: args.refreshToken,
      accessToken: args.accessToken,
      accessTokenExpiresAt: args.accessTokenExpiresAt,
      updatedAt: Date.now(),
    });
    return true;
  },
});

/** `needsReconnect` flips the page to the reconnect prompt; otherwise the error is shown and syncing retries. */
export const markError = internalMutation({
  args: { message: v.string(), needsReconnect: v.boolean() },
  handler: async (ctx, args) => {
    const connection = await getConnectionRow(ctx);
    if (!connection) return null;
    await ctx.db.patch("ringConnection", connection._id, {
      lastError: args.message,
      ...(args.needsReconnect ? { status: "error" as const, accessToken: undefined } : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const recordSync = internalMutation({
  args: { origin: syncOriginValue, camera: cameraValue, syncedThrough: v.number() },
  handler: async (ctx, args) => {
    const connection = await getConnectionRow(ctx);
    if (!connection || !(await isCurrentSync(ctx, args.origin))) return null;
    const now = Date.now();
    // The saved camera left the account and the sync fell back to another one.
    if (args.camera.deviceId !== args.origin.deviceId) {
      await ctx.scheduler.runAfter(0, internal.ringCamera.removeOtherCameraClips, {
        deviceId: args.camera.deviceId,
        cursor: null,
      });
    }
    await ctx.db.patch("ringConnection", connection._id, {
      camera: args.camera,
      syncedThrough: args.syncedThrough,
      lastSyncedAt: now,
      status: "connected",
      lastError: undefined,
      updatedAt: now,
    });
    return null;
  },
});

/** Which of these Ring clips are already stored (so sync only fetches new thumbnails). */
export const knownDingIds = internalQuery({
  args: { dingIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const known: string[] = [];
    for (const dingId of args.dingIds) {
      const row = await ctx.db
        .query("ringClips")
        .withIndex("by_dingId", (q) => q.eq("dingId", dingId))
        .first();
      if (row) known.push(dingId);
    }
    return known;
  },
});

export const upsertClips = internalMutation({
  args: {
    origin: syncOriginValue,
    clips: v.array(
      v.object({
        dingId: v.string(),
        deviceId: v.number(),
        kind: clipKindValue,
        rawKind: v.string(),
        createdAt: v.number(),
        durationSec: v.optional(v.number()),
        personDetected: v.boolean(),
        thumbnailStorageId: v.optional(v.id("_storage")),
      }),
    ),
  },
  handler: async (ctx, args) => {
    // Ring was disconnected or switched to another camera while this sync ran:
    // drop the batch and its thumbnails.
    if (!(await isCurrentSync(ctx, args.origin))) {
      for (const clip of args.clips) {
        if (clip.thumbnailStorageId) await ctx.storage.delete(clip.thumbnailStorageId);
      }
      return null;
    }
    for (const clip of args.clips) {
      const existing = await ctx.db
        .query("ringClips")
        .withIndex("by_dingId", (q) => q.eq("dingId", clip.dingId))
        .first();
      if (!existing) {
        await ctx.db.insert("ringClips", clip);
        continue;
      }
      // A concurrent sync stored a thumbnail first; drop the duplicate.
      if (clip.thumbnailStorageId && existing.thumbnailStorageId) {
        await ctx.storage.delete(clip.thumbnailStorageId);
      }
      // Ring finishes processing after the first sync: duration fills in later.
      const patch = {
        durationSec: clip.durationSec ?? existing.durationSec,
        personDetected: clip.personDetected || existing.personDetected,
        thumbnailStorageId: existing.thumbnailStorageId ?? clip.thumbnailStorageId,
      };
      // Every sync re-reads a short overlap; skip clips that didn't change.
      if (
        patch.durationSec !== existing.durationSec ||
        patch.personDetected !== existing.personDetected ||
        patch.thumbnailStorageId !== existing.thumbnailStorageId
      ) {
        await ctx.db.patch("ringClips", existing._id, patch);
      }
    }
    return null;
  },
});

const PRUNE_BATCH = 200;

export const pruneOldClips = internalMutation({
  args: { before: v.number() },
  handler: async (ctx, args) => {
    const old = await ctx.db
      .query("ringClips")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", args.before))
      .take(PRUNE_BATCH);
    for (const clip of old) {
      if (clip.thumbnailStorageId) await ctx.storage.delete(clip.thumbnailStorageId);
      await ctx.db.delete("ringClips", clip._id);
    }
    if (old.length === PRUNE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.ringCamera.pruneOldClips, args);
    }
    return null;
  },
});

/** Delete clips recorded by any camera other than `deviceId`, a page at a time. */
export const removeOtherCameraClips = internalMutation({
  args: { deviceId: v.number(), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("ringClips")
      .withIndex("by_createdAt")
      .paginate({ numItems: PRUNE_BATCH, cursor: args.cursor });
    for (const clip of page.page) {
      if (clip.deviceId === args.deviceId) continue;
      if (clip.thumbnailStorageId) await ctx.storage.delete(clip.thumbnailStorageId);
      await ctx.db.delete("ringClips", clip._id);
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.ringCamera.removeOtherCameraClips, {
        deviceId: args.deviceId,
        cursor: page.continueCursor,
      });
    }
    return null;
  },
});
