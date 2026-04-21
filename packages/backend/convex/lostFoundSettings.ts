import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const get = query({
  args: {},
  handler: async (ctx) => {
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
