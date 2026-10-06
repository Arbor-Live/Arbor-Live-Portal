import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import {
  createRingSession,
  getRingClipUrl,
  listRingCameras,
  parseRingRefreshToken,
  refreshRingAuth,
  RingAuthError,
  RingRequestError,
  searchRingClips,
  type RingCamera,
  type RingClip,
} from "./lib/ringClient";
import { appError } from "./lib/errors";
import { RING_CLIP_RETENTION_MS } from "./ringCamera";

const DAY_MS = 24 * 60 * 60 * 1000;
/** How far back a fresh connection loads clips. */
const BACKFILL_DAYS = 30;
/** Each sync re-reads this much before the last one, so clips Ring finished late still land. */
const SYNC_OVERLAP_MS = 2 * 60 * 60 * 1000;
/** Thumbnails fetched per sync, newest first; a backfill leaves older clips without one. */
const THUMBNAILS_PER_SYNC = 100;
const UPSERT_BATCH = 200;
/** Refresh the access token this long before Ring expires it. */
const TOKEN_MARGIN_MS = 2 * 60 * 1000;

type Connection = Doc<"ringConnection">;
type RingCall<T> = (accessToken: string, hardwareId: string) => Promise<T>;

function newHardwareId() {
  return crypto.randomUUID();
}

/** Refresh the access token, store the rotated refresh token, and open a Ring session. */
async function refreshAccess(ctx: ActionCtx, connection: Connection): Promise<string> {
  const credentials = parseRingRefreshToken(connection.refreshToken, () => connection.hardwareId);
  const auth = await refreshRingAuth(fetch, credentials, Date.now());
  const won = await ctx.runMutation(internal.ringCamera.saveAuth, {
    expectedRefreshToken: connection.refreshToken,
    refreshToken: auth.refreshToken,
    accessToken: auth.accessToken,
    accessTokenExpiresAt: auth.expiresAt,
  });
  if (!won) {
    // Another action rotated the token first; use what it stored.
    const latest = await ctx.runQuery(internal.ringCamera.getConnection, {});
    if (latest?.accessToken) return latest.accessToken;
  }
  await createRingSession(fetch, auth.accessToken, connection.hardwareId);
  return auth.accessToken;
}

/** Run a Ring call with a valid token, retrying once on a 401, and record auth failures. */
async function withRing<T>(ctx: ActionCtx, call: RingCall<T>): Promise<T> {
  const connection = await ctx.runQuery(internal.ringCamera.getConnection, {});
  if (!connection) throw new Error("Ring isn't connected.");
  if (connection.status === "error") {
    throw new Error(connection.lastError ?? "Reconnect Ring to keep syncing.");
  }
  try {
    const fresh =
      connection.accessToken && (connection.accessTokenExpiresAt ?? 0) > Date.now() + TOKEN_MARGIN_MS;
    const accessToken = fresh && connection.accessToken ? connection.accessToken : await refreshAccess(ctx, connection);
    try {
      return await call(accessToken, connection.hardwareId);
    } catch (error) {
      if (!(error instanceof RingRequestError) || error.status !== 401) throw error;
      const latest = await ctx.runQuery(internal.ringCamera.getConnection, {});
      return await call(await refreshAccess(ctx, latest ?? connection), connection.hardwareId);
    }
  } catch (error) {
    if (error instanceof RingAuthError) {
      await ctx.runMutation(internal.ringCamera.markError, { message: error.message, needsReconnect: true });
    }
    throw error;
  }
}

function pickCamera(cameras: RingCamera[], deviceId: number | undefined) {
  return cameras.find((camera) => camera.deviceId === deviceId) ?? cameras[0];
}

async function storeThumbnail(ctx: ActionCtx, url: string): Promise<Id<"_storage"> | undefined> {
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    return await ctx.storage.store(await response.blob());
  } catch {
    return undefined;
  }
}

async function syncClips(ctx: ActionCtx) {
  const connection = await ctx.runQuery(internal.ringCamera.getConnection, {});
  if (!connection || connection.status === "error") return { added: 0 };
  const now = Date.now();
  const from = connection.syncedThrough ? connection.syncedThrough - SYNC_OVERLAP_MS : now - BACKFILL_DAYS * DAY_MS;

  const { camera, clips } = await withRing(ctx, async (accessToken, hardwareId) => {
    const camera = pickCamera(await listRingCameras(fetch, accessToken, hardwareId), connection.camera?.deviceId);
    if (!camera) throw new RingRequestError("This Ring account has no cameras.", 404);
    // One day per request, so a long backfill never hits a page limit.
    const clips: RingClip[] = [];
    for (let start = from; start < now; start += DAY_MS) {
      clips.push(
        ...(await searchRingClips(fetch, accessToken, hardwareId, {
          deviceId: camera.deviceId,
          from: start,
          to: Math.min(start + DAY_MS, now),
        })),
      );
    }
    return { camera, clips };
  });

  const known = new Set<string>();
  for (let index = 0; index < clips.length; index += UPSERT_BATCH) {
    const ids = clips.slice(index, index + UPSERT_BATCH).map((clip) => clip.dingId);
    for (const id of await ctx.runQuery(internal.ringCamera.knownDingIds, { dingIds: ids })) known.add(id);
  }
  const fresh = clips.filter((clip) => !known.has(clip.dingId));
  const withThumbnail = new Set(
    [...fresh]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, THUMBNAILS_PER_SYNC)
      .map((clip) => clip.dingId),
  );

  const rows = [];
  for (const clip of clips) {
    const { thumbnailUrl, ...row } = clip;
    const thumbnailStorageId =
      thumbnailUrl && withThumbnail.has(clip.dingId) ? await storeThumbnail(ctx, thumbnailUrl) : undefined;
    rows.push({ ...row, thumbnailStorageId });
  }
  for (let index = 0; index < rows.length; index += UPSERT_BATCH) {
    await ctx.runMutation(internal.ringCamera.upsertClips, { clips: rows.slice(index, index + UPSERT_BATCH) });
  }
  await ctx.runMutation(internal.ringCamera.recordSync, { camera, syncedThrough: now });
  await ctx.runMutation(internal.ringCamera.pruneOldClips, { before: now - RING_CLIP_RETENTION_MS });
  return { added: fresh.length };
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Ring sync failed.";
}

/** Public actions: Ring failures carry messages written for the admin, so pass them through. */
async function userFacing<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ConvexError) throw error;
    return appError(error instanceof RingAuthError ? "RING_RECONNECT" : "RING_ERROR", messageOf(error));
  }
}

/** Cron: pull new clips. Transient failures are recorded and retried next run. */
export const sync = internalAction({
  args: {},
  handler: async (ctx) => {
    try {
      await syncClips(ctx);
    } catch (error) {
      if (!(error instanceof RingAuthError)) {
        await ctx.runMutation(internal.ringCamera.markError, { message: messageOf(error), needsReconnect: false });
      }
      console.error("Ring sync failed", error);
    }
    return null;
  },
});

/** Admin: connect (or reconnect) with a refresh token from `ring-auth-cli`. */
export const connect = action({
  args: { refreshToken: v.string() },
  handler: async (ctx, args): Promise<{ cameraName: string }> => {
    const userId: string = await ctx.runQuery(internal.ringCamera.assertCameraAdmin, {});
    return await userFacing(async () => {
      const credentials = parseRingRefreshToken(args.refreshToken, newHardwareId);
      const auth = await refreshRingAuth(fetch, credentials, Date.now());
      await createRingSession(fetch, auth.accessToken, credentials.hardwareId);
      const current = await ctx.runQuery(internal.ringCamera.getConnection, {});
      const camera = pickCamera(
        await listRingCameras(fetch, auth.accessToken, credentials.hardwareId),
        current?.camera?.deviceId,
      );
      if (!camera) throw new Error("This Ring account has no cameras.");
      await ctx.runMutation(internal.ringCamera.saveConnection, {
        refreshToken: auth.refreshToken,
        hardwareId: credentials.hardwareId,
        accessToken: auth.accessToken,
        accessTokenExpiresAt: auth.expiresAt,
        camera,
        connectedByUserId: userId,
      });
      await ctx.scheduler.runAfter(0, internal.ringCameraActions.sync, {});
      return { cameraName: camera.name };
    });
  },
});

/** Admin: check for new clips now. */
export const syncNow = action({
  args: {},
  handler: async (ctx): Promise<{ added: number }> => {
    await ctx.runQuery(internal.ringCamera.assertCameraAdmin, {});
    return await userFacing(() => syncClips(ctx));
  },
});

/** Admin: a short-lived MP4 link for one clip. Fetched on play because Ring's links expire. */
export const getClipVideoUrl = action({
  args: { clipId: v.id("ringClips") },
  handler: async (ctx, args): Promise<string> => {
    await ctx.runQuery(internal.ringCamera.assertCameraAdmin, {});
    const clip = await ctx.runQuery(internal.ringCamera.getClip, { clipId: args.clipId });
    if (!clip) return appError("RING_CLIP_GONE", "This clip is no longer available.");
    return await userFacing(() =>
      withRing(ctx, (accessToken, hardwareId) => getRingClipUrl(fetch, accessToken, hardwareId, clip.dingId)),
    );
  },
});
