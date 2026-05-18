import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin, requireAuth } from "./lib/auth";

function normalizeKey(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export const list = query({
  args: { activeOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const rows = args.activeOnly
      ? await ctx.db.query("invoiceFeeDefinitions").withIndex("by_active", (q) => q.eq("active", true)).take(300)
      : await ctx.db.query("invoiceFeeDefinitions").take(300);
    return rows.sort((a, b) => {
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
    defaultAmountUsd: v.optional(v.number()),
    active: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const key = normalizeKey(args.key);
    if (!key) throw new Error("Fee key is required.");
    const existing = await ctx.db.query("invoiceFeeDefinitions").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (existing) throw new Error("Fee key already exists.");
    const now = Date.now();
    return await ctx.db.insert("invoiceFeeDefinitions", {
      key,
      label: args.label.trim(),
      description: args.description?.trim() || undefined,
      defaultAmountUsd: args.defaultAmountUsd,
      active: args.active ?? true,
      sortOrder: args.sortOrder,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("invoiceFeeDefinitions"),
    label: v.optional(v.string()),
    description: v.optional(v.string()),
    defaultAmountUsd: v.optional(v.number()),
    active: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Fee definition not found.");
    await ctx.db.patch(args.id, {
      label: args.label?.trim() ?? existing.label,
      description: args.description?.trim() ?? existing.description,
      defaultAmountUsd: args.defaultAmountUsd ?? existing.defaultAmountUsd,
      active: args.active ?? existing.active,
      sortOrder: args.sortOrder ?? existing.sortOrder,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("invoiceFeeDefinitions") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Fee definition not found.");
    await ctx.db.delete(args.id);
  },
});
