import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const staleCutoffMs = 365 * 24 * 60 * 60 * 1000;

export const list = query({
  args: {
    groupId: v.optional(v.id("invoiceGroups")),
    activeOnly: v.optional(v.boolean()),
    includeStale: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const base = args.groupId
      ? await ctx.db
          .query("invoiceContacts")
          .withIndex("by_groupId", (q) => q.eq("groupId", args.groupId))
          .take(500)
      : args.activeOnly
        ? await ctx.db.query("invoiceContacts").withIndex("by_active", (q) => q.eq("active", true)).take(500)
        : await ctx.db.query("invoiceContacts").take(500);
    const cutoff = Date.now() - staleCutoffMs;
    return base
      .filter((row) => {
        if (args.activeOnly && !row.active) return false;
        if (args.includeStale) return true;
        return !row.lastUsedAt || row.lastUsedAt >= cutoff;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const create = mutation({
  args: {
    groupId: v.optional(v.id("invoiceGroups")),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const name = args.name.trim();
    if (!name) throw new Error("Contact name is required.");
    return await ctx.db.insert("invoiceContacts", {
      groupId: args.groupId,
      name,
      email: args.email?.trim() || undefined,
      phone: args.phone?.trim() || undefined,
      active: args.active ?? true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("invoiceContacts"),
    groupId: v.optional(v.id("invoiceGroups")),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Contact not found.");
    const name = args.name?.trim();
    await ctx.db.patch(args.id, {
      groupId: args.groupId ?? existing.groupId,
      name: name || existing.name,
      email: args.email?.trim() ?? existing.email,
      phone: args.phone?.trim() ?? existing.phone,
      active: args.active ?? existing.active,
      updatedAt: Date.now(),
    });
  },
});

export const archive = mutation({
  args: { id: v.id("invoiceContacts") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Contact not found.");
    await ctx.db.patch(args.id, { active: false, updatedAt: Date.now() });
  },
});
