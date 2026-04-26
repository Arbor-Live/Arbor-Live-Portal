import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: { activeOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const rows = args.activeOnly
      ? await ctx.db.query("invoiceTerms").withIndex("by_active", (q) => q.eq("active", true)).take(200)
      : await ctx.db.query("invoiceTerms").take(200);
    return rows.sort((a, b) => a.label.localeCompare(b.label));
  },
});

export const create = mutation({
  args: {
    label: v.string(),
    version: v.string(),
    markdown: v.string(),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("invoiceTerms", {
      label: args.label.trim(),
      version: args.version.trim(),
      markdown: args.markdown.trim(),
      active: args.active ?? true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("invoiceTerms"),
    label: v.optional(v.string()),
    version: v.optional(v.string()),
    markdown: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Terms not found.");
    await ctx.db.patch(args.id, {
      label: args.label?.trim() ?? existing.label,
      version: args.version?.trim() ?? existing.version,
      markdown: args.markdown?.trim() ?? existing.markdown,
      active: args.active ?? existing.active,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("invoiceTerms") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Terms not found.");
    await ctx.db.delete(args.id);
  },
});
