import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin, requireAuth } from "./lib/auth";

export const get = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.db.query("lostFoundSettings").first();
  },
});

export const update = mutation({
  args: {
    instructions: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    infoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const existing = await ctx.db.query("lostFoundSettings").first();
    const now = Date.now();
    const payload = {
      instructions: args.instructions?.trim() || undefined,
      contactEmail: args.contactEmail?.trim() || undefined,
      infoUrl: args.infoUrl?.trim() || undefined,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("lostFoundSettings", payload);
  },
});
