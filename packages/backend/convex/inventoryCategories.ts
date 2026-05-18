import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin, requireAuth } from "./lib/auth";

const publicBucketValue = v.union(
  v.literal("lighting"),
  v.literal("sound"),
  v.literal("environmental"),
  v.literal("staging"),
  v.literal("misc"),
);

const DEFAULT_CATEGORIES = [
  { key: "sound", label: "Sound", sortOrder: 10, publicBucket: "sound" as const },
  { key: "lighting", label: "Lighting", sortOrder: 20, publicBucket: "lighting" as const },
  { key: "staging_rigging", label: "Staging & Rigging", sortOrder: 30, publicBucket: "staging" as const },
  { key: "misc", label: "Misc", sortOrder: 40, publicBucket: "misc" as const },
  { key: "speakers", label: "Speakers", sortOrder: 50, publicBucket: "sound" as const },
  { key: "lighting_fixtures", label: "Lighting Fixtures", sortOrder: 60, publicBucket: "lighting" as const },
  { key: "sound_cables_snakes", label: "Sound Cables+Snakes", sortOrder: 70, publicBucket: "sound" as const },
  {
    key: "microphones_audio_inputs",
    label: "Microphones/Audio Inputs",
    sortOrder: 80,
    publicBucket: "sound" as const,
  },
  { key: "control_surfaces", label: "Control Surfaces", sortOrder: 90, publicBucket: "sound" as const },
  { key: "stands", label: "Stands", sortOrder: 100, publicBucket: "staging" as const },
  { key: "misc_equipment", label: "Misc Equipment", sortOrder: 110, publicBucket: "misc" as const },
  { key: "lighting_cables", label: "Lighting Cables", sortOrder: 120, publicBucket: "lighting" as const },
  { key: "network", label: "Network", sortOrder: 130, publicBucket: "sound" as const },
  { key: "power", label: "Power", sortOrder: 140, publicBucket: "staging" as const },
  { key: "monitoring", label: "Monitoring", sortOrder: 150, publicBucket: "sound" as const },
  { key: "hospitality", label: "Hospitality", sortOrder: 160, publicBucket: "staging" as const },
  { key: "organizers", label: "Organizers", sortOrder: 170, publicBucket: "staging" as const },
  { key: "road_case", label: "Road Case", sortOrder: 180, publicBucket: "staging" as const },
  { key: "environmentals", label: "Environmentals", sortOrder: 190, publicBucket: "environmental" as const },
  { key: "instruments", label: "Instruments", sortOrder: 200, publicBucket: "sound" as const },
  { key: "dollies", label: "Dollies", sortOrder: 210, publicBucket: "staging" as const },
  { key: "video_photo", label: "Video & Photo", sortOrder: 220, publicBucket: "staging" as const },
  { key: "wireless_dmx", label: "Wireless DMX", sortOrder: 230, publicBucket: "lighting" as const },
] as const;

function normalizeKey(key: string) {
  return key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export const list = query({
  args: { activeOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const categories = args.activeOnly
      ? await ctx.db
          .query("inventoryCategories")
          .withIndex("by_active", (q) => q.eq("active", true))
          .collect()
      : await ctx.db.query("inventoryCategories").collect();

    return categories.sort((a, b) => {
      const orderA = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return a.label.localeCompare(b.label);
    });
  },
});

export const ensureDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const now = Date.now();
    for (const category of DEFAULT_CATEGORIES) {
      const existing = await ctx.db
        .query("inventoryCategories")
        .withIndex("by_key", (q) => q.eq("key", category.key))
        .unique();
      if (!existing) {
        await ctx.db.insert("inventoryCategories", {
          ...category,
          active: true,
          createdAt: now,
          updatedAt: now,
        });
        continue;
      }

      if (existing.publicBucket !== category.publicBucket) {
        await ctx.db.patch(existing._id, {
          publicBucket: category.publicBucket,
          updatedAt: now,
        });
      }
    }
  },
});

export const create = mutation({
  args: {
    key: v.string(),
    label: v.string(),
    publicBucket: v.optional(publicBucketValue),
    sortOrder: v.optional(v.number()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const key = normalizeKey(args.key);
    if (!key) throw new Error("Category key is required.");

    const existing = await ctx.db
      .query("inventoryCategories")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (existing) throw new Error("Category key already exists.");

    const now = Date.now();
    return await ctx.db.insert("inventoryCategories", {
      key,
      label: args.label.trim(),
      publicBucket: args.publicBucket,
      sortOrder: args.sortOrder,
      active: args.active ?? true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("inventoryCategories"),
    label: v.optional(v.string()),
    publicBucket: v.optional(v.union(publicBucketValue, v.null())),
    sortOrder: v.optional(v.number()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Category not found.");

    const nextPublicBucket =
      args.publicBucket === undefined
        ? existing.publicBucket
        : args.publicBucket === null
          ? undefined
          : args.publicBucket;

    await ctx.db.patch(args.id, {
      label: args.label?.trim() ?? existing.label,
      publicBucket: nextPublicBucket,
      sortOrder: args.sortOrder ?? existing.sortOrder,
      active: args.active ?? existing.active,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("inventoryCategories") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Category not found.");

    const linkedType = await ctx.db
      .query("inventoryTypes")
      .withIndex("by_category", (q) => q.eq("category", existing.key))
      .first();
    if (linkedType) throw new Error("Cannot delete category while it is used by inventory types.");

    await ctx.db.delete(args.id);
  },
});
