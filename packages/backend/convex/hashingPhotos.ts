import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { checklistFor, requireOnHash, requireRunning } from "./hashingLive";
import { formatStoredR2Asset, resolveStoredR2AssetUrl } from "./inventoryR2";
import { findAuthUsersByIds, getUserId, requireAdminOrOperations } from "./lib/auth";
import { appError } from "./lib/errors";
import { lineIdOf, type ChecklistAreaView } from "./lib/hashing";
import { HASHING_CHECKLIST_SEED } from "./lib/hashingChecklistSeed";
import { latestChecklist, loadHashDate, loadPendingPhotos, requireHashingViewer } from "./lib/hashingData";
import { hashPhotoLevelValue, type ChecklistTree, type HashPhotoLevel } from "./lib/hashingValues";
import { HASH_REFERENCE_KEY_PREFIX, parseStoredR2Asset, R2_ASSET_PREFIX } from "./lib/inventoryUpload";
import { releaseR2KeysIfUnreferenced } from "./lib/r2Lifecycle";

/** Approved photos shown on a hash. A closet of ~140 rows with a few photos each stays far under it. */
const APPROVED_TAKE = 500;
/** What one person can have waiting at once, so a stuck queue can't be flooded. */
const MAX_PENDING_PER_USER = 20;

const photoStatusValue = v.union(v.literal("pending"), v.literal("approved"));

/** Newest first, so past the cap it's the oldest photos that drop off, never a fresh approval. */
async function loadApproved(ctx: QueryCtx) {
  const rows = await ctx.db
    .query("hashReferencePhotos")
    .withIndex("by_status", (q) => q.eq("status", "approved"))
    .order("desc")
    .take(APPROVED_TAKE);
  if (rows.length === APPROVED_TAKE) {
    console.warn(`hashReferencePhotos: ${APPROVED_TAKE} approved photos reached; older ones are not shown.`);
  }
  return rows;
}

function nameOf(userByKey: Awaited<ReturnType<typeof findAuthUsersByIds>>, userId: string) {
  const user = userByKey.get(userId);
  return user?.name || user?.email || "Crew";
}

function hasTarget(areas: ChecklistAreaView[], level: HashPhotoLevel, targetId: string) {
  if (level === "area") return areas.some((area) => area.id === targetId);
  if (level === "kit") return areas.some((area) => area.kits.some((kit) => kit.id === targetId));
  return areas.some((area) =>
    [...area.kits.flatMap((kit) => kit.rows), ...area.finalChecks].some((row) => lineIdOf(row.itemKey) === targetId),
  );
}

/**
 * Approved photos for everyone, plus the viewer's own waiting ones. Kept apart from
 * `hashingLive.get` so a tick never re-resolves the image URLs.
 */
export const forHash = query({
  args: { hashDateId: v.id("hashDates") },
  returns: v.object({
    canReview: v.boolean(),
    photos: v.array(
      v.object({
        _id: v.id("hashReferencePhotos"),
        level: hashPhotoLevelValue,
        targetId: v.string(),
        url: v.string(),
        status: photoStatusValue,
        byName: v.string(),
        mine: v.boolean(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const viewer = await requireHashingViewer(ctx);
    if (!(await ctx.db.get("hashDates", args.hashDateId))) return { canReview: viewer.canManage, photos: [] };

    const [approved, mine] = await Promise.all([
      loadApproved(ctx),
      ctx.db
        .query("hashReferencePhotos")
        .withIndex("by_submittedBy_and_status", (q) => q.eq("submittedBy", viewer.userId).eq("status", "pending"))
        .take(MAX_PENDING_PER_USER),
    ]);
    const rows = [...approved, ...mine].sort((a, b) => a._creationTime - b._creationTime);
    const userByKey = await findAuthUsersByIds(ctx, [...new Set(rows.map((row) => row.submittedBy))]);

    const photos = await Promise.all(
      rows.map(async (row) => {
        const url = await resolveStoredR2AssetUrl(formatStoredR2Asset(row.r2Key));
        if (!url) return [];
        return [
          {
            _id: row._id,
            level: row.level,
            targetId: row.targetId,
            url,
            status: row.status,
            byName: nameOf(userByKey, row.submittedBy),
            mine: row.submittedBy === viewer.userId,
          },
        ];
      }),
    );
    return { canReview: viewer.canManage, photos: photos.flat() };
  },
});

/** Anyone who could tick this hash. It waits in the queue and only its sender sees it until ops approve it. */
export const submit = mutation({
  args: {
    hashDateId: v.id("hashDates"),
    level: hashPhotoLevelValue,
    targetId: v.string(),
    photo: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await loadHashDate(ctx, args.hashDateId);
    requireRunning(row);
    const { userId } = await requireOnHash(ctx, row);

    const parsed = args.photo.trim().startsWith(R2_ASSET_PREFIX) ? parseStoredR2Asset(args.photo) : null;
    if (parsed?.kind !== "r2" || !parsed.key.startsWith(HASH_REFERENCE_KEY_PREFIX)) {
      appError("HASH_PHOTO_INVALID", "That isn't a photo uploaded for a hash.");
    }

    if (!hasTarget(await checklistFor(ctx, row), args.level, args.targetId)) {
      appError("HASH_PHOTO_UNKNOWN_TARGET", "That isn't on this hash's checklist.");
    }

    const waiting = await ctx.db
      .query("hashReferencePhotos")
      .withIndex("by_submittedBy_and_status", (q) => q.eq("submittedBy", userId).eq("status", "pending"))
      .take(MAX_PENDING_PER_USER);
    if (waiting.length >= MAX_PENDING_PER_USER) {
      appError(
        "HASH_PHOTO_TOO_MANY_PENDING",
        `You have ${MAX_PENDING_PER_USER} photos waiting for review. Wait for those first.`,
      );
    }

    await ctx.db.insert("hashReferencePhotos", {
      status: "pending",
      level: args.level,
      targetId: args.targetId,
      r2Key: parsed.key,
      submittedBy: userId,
      hashDateId: row._id,
    });
    return null;
  },
});

/** Titles for where a photo goes, from the current checklist. A removed target reads as removed. */
function labelsOf(tree: ChecklistTree) {
  const areaName = new Map(tree.areas.map((area) => [area.id, area.name]));
  const kitName = new Map(tree.kits.map((kit) => [kit.id, kit.name]));
  const itemById = new Map<string, { text: string; where: string }>();
  const remember = (id: string, text: string, where: string) => {
    if (!itemById.has(id)) itemById.set(id, { text, where });
  };
  for (const kit of tree.kits) for (const item of kit.items) remember(item.id, item.text, kit.name);
  for (const area of tree.areas) {
    for (const placement of area.placements) {
      const where = kitName.get(placement.kitId) ?? area.name;
      for (const item of placement.extraItems) remember(item.id, item.text, where);
    }
    for (const check of area.finalChecks) remember(check.id, check.text, area.name);
  }
  return (level: HashPhotoLevel, targetId: string): { title: string; context?: string } => {
    if (level === "area") return { title: areaName.get(targetId) ?? "Removed area" };
    if (level === "kit") return { title: kitName.get(targetId) ?? "Removed kit" };
    const item = itemById.get(targetId);
    return item ? { title: item.text, context: item.where } : { title: "Removed item" };
  };
}

export const listPending = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("hashReferencePhotos"),
      url: v.string(),
      level: hashPhotoLevelValue,
      title: v.string(),
      context: v.optional(v.string()),
      byName: v.string(),
      dateKey: v.optional(v.string()),
      approvedCount: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requireAdminOrOperations(ctx);
    const [pending, approved, latest] = await Promise.all([
      loadPendingPhotos(ctx),
      loadApproved(ctx),
      latestChecklist(ctx),
    ]);
    const labelOf = labelsOf(latest ?? HASHING_CHECKLIST_SEED);
    const approvedCount = new Map<string, number>();
    for (const photo of approved) {
      const key = `${photo.level}:${photo.targetId}`;
      approvedCount.set(key, (approvedCount.get(key) ?? 0) + 1);
    }
    const [userByKey, hashes] = await Promise.all([
      findAuthUsersByIds(ctx, [...new Set(pending.map((photo) => photo.submittedBy))]),
      Promise.all([...new Set(pending.map((photo) => photo.hashDateId))].map((id) => ctx.db.get("hashDates", id))),
    ]);
    const dateKeyByHash = new Map(hashes.flatMap((hash) => (hash ? [[hash._id, hash.dateKey] as const] : [])));

    const rows = await Promise.all(
      pending.map(async (photo) => {
        const url = await resolveStoredR2AssetUrl(formatStoredR2Asset(photo.r2Key));
        if (!url) return [];
        return [
          {
            _id: photo._id,
            url,
            level: photo.level,
            ...labelOf(photo.level, photo.targetId),
            byName: nameOf(userByKey, photo.submittedBy),
            dateKey: dateKeyByHash.get(photo.hashDateId),
            approvedCount: approvedCount.get(`${photo.level}:${photo.targetId}`) ?? 0,
          },
        ];
      }),
    );
    return rows.flat();
  },
});

/** Idempotent. A photo already rejected or removed is gone, so there is nothing to approve. */
export const approve = mutation({
  args: { photoId: v.id("hashReferencePhotos") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAdminOrOperations(ctx);
    const photo = await ctx.db.get("hashReferencePhotos", args.photoId);
    if (!photo || photo.status === "approved") return null;
    await ctx.db.patch("hashReferencePhotos", photo._id, {
      status: "approved",
      reviewedBy: getUserId(user),
      reviewedAt: Date.now(),
    });
    return null;
  },
});

/** A rejected photo is deleted, and its file with it. */
export const reject = mutation({
  args: { photoId: v.id("hashReferencePhotos") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdminOrOperations(ctx);
    const photo = await ctx.db.get("hashReferencePhotos", args.photoId);
    if (!photo) return null;
    if (photo.status === "approved") {
      appError("HASH_PHOTO_APPROVED", "This photo was already approved. Remove it instead.");
    }
    await ctx.db.delete("hashReferencePhotos", photo._id);
    await releaseR2KeysIfUnreferenced(ctx, [photo.r2Key]);
    return null;
  },
});

export const remove = mutation({
  args: { photoId: v.id("hashReferencePhotos") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdminOrOperations(ctx);
    const photo = await ctx.db.get("hashReferencePhotos", args.photoId);
    if (!photo) return null;
    if (photo.status === "pending") {
      appError("HASH_PHOTO_PENDING", "This photo hasn't been approved yet. Reject it instead.");
    }
    await ctx.db.delete("hashReferencePhotos", photo._id);
    await releaseR2KeysIfUnreferenced(ctx, [photo.r2Key]);
    return null;
  },
});
