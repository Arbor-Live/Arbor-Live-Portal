import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: { activeOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const capabilities = args.activeOnly
      ? await ctx.db
          .query("capabilityDefinitions")
          .withIndex("by_active", (q) => q.eq("active", true))
          .collect()
      : await ctx.db.query("capabilityDefinitions").collect();

    return capabilities.sort((a, b) => {
      const orderA = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return a.label.localeCompare(b.label);
    });
  },
});

export const create = mutation({
  args: {
    key: v.string(),
    label: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("capabilityDefinitions")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (existing) throw new Error("Capability key already exists.");

    const now = Date.now();
    return await ctx.db.insert("capabilityDefinitions", {
      key: args.key.trim().toLowerCase(),
      label: args.label.trim(),
      description: args.description?.trim(),
      category: args.category?.trim().toLowerCase(),
      sortOrder: args.sortOrder,
      active: args.active ?? true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("capabilityDefinitions"),
    label: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Capability definition not found.");

    await ctx.db.patch(args.id, {
      label: args.label?.trim() ?? existing.label,
      description: args.description?.trim() ?? existing.description,
      category: args.category?.trim().toLowerCase() ?? existing.category,
      sortOrder: args.sortOrder ?? existing.sortOrder,
      active: args.active ?? existing.active,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("capabilityDefinitions") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Capability definition not found.");
    await ctx.db.delete(args.id);
  },
});
