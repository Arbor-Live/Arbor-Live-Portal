import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireArborInternalContext, requireAuth } from "./lib/auth";
import { normalizeOptionalAssetReference } from "./lib/inventoryUpload";
import {
  collectKeysFromEventArtifact,
  releaseReplacedR2Reference,
  releaseR2Keys,
} from "./lib/r2Lifecycle";
import { resolveStoredR2AssetUrl } from "./inventoryR2";

const artifactTypeValue = v.union(
  v.literal("note"),
  v.literal("instruction"),
  v.literal("document"),
  v.literal("pull_list"),
);

export const listByEvent = query({
  args: { eventId: v.id("events"), artifactType: v.optional(artifactTypeValue) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const rows = args.artifactType
      ? await ctx.db
          .query("eventArtifacts")
          .withIndex("by_eventId_and_artifactType", (q) =>
            q.eq("eventId", args.eventId).eq("artifactType", args.artifactType!),
          )
          .take(500)
      : await ctx.db
          .query("eventArtifacts")
          .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
          .take(500);

    const sorted = rows.sort((a, b) => b.updatedAt - a.updatedAt);
    return Promise.all(
      sorted.map(async (row) => ({
        ...row,
        fileUrl: row.linkUrl ? await resolveStoredR2AssetUrl(row.linkUrl) : undefined,
      })),
    );
  },
});

export const create = mutation({
  args: {
    eventId: v.id("events"),
    artifactType: artifactTypeValue,
    title: v.string(),
    markdown: v.optional(v.string()),
    linkUrl: v.optional(v.string()),
    storageFileId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const now = Date.now();
    return await ctx.db.insert("eventArtifacts", {
      eventId: args.eventId,
      artifactType: args.artifactType,
      title: args.title.trim(),
      markdown: args.markdown?.trim() || undefined,
      linkUrl: normalizeOptionalAssetReference(args.linkUrl),
      storageFileId: args.storageFileId,
      version: 1,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("eventArtifacts"),
    title: v.optional(v.string()),
    markdown: v.optional(v.string()),
    linkUrl: v.optional(v.string()),
    storageFileId: v.optional(v.id("_storage")),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Artifact not found.");
    const nextLinkUrl =
      args.linkUrl === undefined
        ? existing.linkUrl
        : normalizeOptionalAssetReference(args.linkUrl);
    await ctx.db.patch(args.id, {
      title: args.title?.trim() ?? existing.title,
      markdown: args.markdown?.trim() ?? existing.markdown,
      linkUrl: nextLinkUrl,
      storageFileId: args.storageFileId ?? existing.storageFileId,
      active: args.active ?? existing.active,
      version: existing.version + 1,
      updatedAt: Date.now(),
    });
    await releaseReplacedR2Reference(ctx, existing.linkUrl, nextLinkUrl);
  },
});

export const remove = mutation({
  args: { id: v.id("eventArtifacts") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Artifact not found.");
    await releaseR2Keys(ctx, collectKeysFromEventArtifact(existing));
    await ctx.db.delete(args.id);
  },
});
