import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const groupTypeValue = v.union(
  v.literal("vso"),
  v.literal("house"),
  v.literal("department"),
  v.literal("individual"),
);

const staleCutoffMs = 365 * 24 * 60 * 60 * 1000;

export const list = query({
  args: {
    activeOnly: v.optional(v.boolean()),
    includeStale: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const rows = args.activeOnly
      ? await ctx.db.query("invoiceGroups").withIndex("by_active", (q) => q.eq("active", true)).take(500)
      : await ctx.db.query("invoiceGroups").take(500);
    const cutoff = Date.now() - staleCutoffMs;
    const filtered = rows.filter((row) => {
      if (args.includeStale) return true;
      return !row.lastUsedAt || row.lastUsedAt >= cutoff;
    });
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    type: groupTypeValue,
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const name = args.name.trim();
    if (!name) throw new Error("Group name is required.");
    return await ctx.db.insert("invoiceGroups", {
      name,
      type: args.type,
      active: args.active ?? true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("invoiceGroups"),
    name: v.optional(v.string()),
    type: v.optional(groupTypeValue),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Group not found.");
    const nextName = args.name?.trim();
    await ctx.db.patch(args.id, {
      name: nextName ? nextName : existing.name,
      type: args.type ?? existing.type,
      active: args.active ?? existing.active,
      updatedAt: Date.now(),
    });
  },
});

export const archive = mutation({
  args: { id: v.id("invoiceGroups") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Group not found.");
    await ctx.db.patch(args.id, { active: false, updatedAt: Date.now() });
  },
});
