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
        termsAndConditionsMarkdown: "",
        termsVersion: "v1",
        updatedAt: Date.now(),
      }
    );
  },
});

export const update = mutation({
  args: {
    crewNormalRateUsd: v.optional(v.number()),
    crewOtRateUsd: v.optional(v.number()),
    termsAndConditionsMarkdown: v.optional(v.string()),
    termsVersion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db.query("invoiceSettings").withIndex("by_key", (q) => q.eq("key", settingsKey)).unique();
    if (!existing) {
      return await ctx.db.insert("invoiceSettings", {
        key: settingsKey,
        crewNormalRateUsd: args.crewNormalRateUsd,
        crewOtRateUsd: args.crewOtRateUsd,
        termsAndConditionsMarkdown: args.termsAndConditionsMarkdown?.trim() || "",
        termsVersion: args.termsVersion?.trim() || "v1",
        updatedAt: now,
      });
    }
    await ctx.db.patch(existing._id, {
      crewNormalRateUsd: args.crewNormalRateUsd ?? existing.crewNormalRateUsd,
      crewOtRateUsd: args.crewOtRateUsd ?? existing.crewOtRateUsd,
      termsAndConditionsMarkdown:
        args.termsAndConditionsMarkdown?.trim() ?? existing.termsAndConditionsMarkdown,
      termsVersion: args.termsVersion?.trim() ?? existing.termsVersion,
      updatedAt: now,
    });
    return existing._id;
  },
});
