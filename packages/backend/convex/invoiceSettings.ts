import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const settingsKey = "default";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("invoiceSettings").withIndex("by_key", (q) => q.eq("key", settingsKey)).unique();
    return (
      existing ?? {
        key: settingsKey,
        crewNormalRateUsd: 0,
        crewOtRateUsd: 0,
        updatedAt: Date.now(),
      }
    );
  },
});

export const update = mutation({
  args: {
    crewNormalRateUsd: v.optional(v.number()),
    crewOtRateUsd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db.query("invoiceSettings").withIndex("by_key", (q) => q.eq("key", settingsKey)).unique();
    if (!existing) {
      return await ctx.db.insert("invoiceSettings", {
        key: settingsKey,
        crewNormalRateUsd: args.crewNormalRateUsd,
        crewOtRateUsd: args.crewOtRateUsd,
        updatedAt: now,
      });
    }
    await ctx.db.patch(existing._id, {
      crewNormalRateUsd: args.crewNormalRateUsd ?? existing.crewNormalRateUsd,
      crewOtRateUsd: args.crewOtRateUsd ?? existing.crewOtRateUsd,
      updatedAt: now,
    });
    return existing._id;
  },
});
