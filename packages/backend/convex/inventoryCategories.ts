import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const DEFAULT_CATEGORIES = [
  { key: "sound", label: "Sound", sortOrder: 10 },
  { key: "lighting", label: "Lighting", sortOrder: 20 },
  { key: "staging_rigging", label: "Staging & Rigging", sortOrder: 30 },
  { key: "misc", label: "Misc", sortOrder: 40 },
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
    const now = Date.now();
    for (const category of DEFAULT_CATEGORIES) {
      const existing = await ctx.db
        .query("inventoryCategories")
        .withIndex("by_key", (q) => q.eq("key", category.key))
        .unique();
      if (existing) continue;
      await ctx.db.insert("inventoryCategories", {
        ...category,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

export const create = mutation({
  args: {
    key: v.string(),
    label: v.string(),
    sortOrder: v.optional(v.number()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
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
    sortOrder: v.optional(v.number()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Category not found.");

    await ctx.db.patch(args.id, {
      label: args.label?.trim() ?? existing.label,
      sortOrder: args.sortOrder ?? existing.sortOrder,
      active: args.active ?? existing.active,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("inventoryCategories") },
  handler: async (ctx, args) => {
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
