import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin, requireAuth } from "./lib/auth";

const settingsKey = "default";

export const get = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const existing = await ctx.db.query("invoiceSettings").withIndex("by_key", (q) => q.eq("key", settingsKey)).unique();
    return (
      existing ?? {
        key: settingsKey,
        crewNormalRateUsd: 0,
        crewLeadRateUsd: 0,
        crewOtRateUsd: 0,
        crewCostBufferPercent: 0,
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
    crewLeadRateUsd: v.optional(v.number()),
    crewOtRateUsd: v.optional(v.number()),
    crewCostBufferPercent: v.optional(v.number()),
    termsAndConditionsMarkdown: v.optional(v.string()),
    termsVersion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const existing = await ctx.db.query("invoiceSettings").withIndex("by_key", (q) => q.eq("key", settingsKey)).unique();
    if (!existing) {
      return await ctx.db.insert("invoiceSettings", {
        key: settingsKey,
        crewNormalRateUsd: args.crewNormalRateUsd,
        crewLeadRateUsd: args.crewLeadRateUsd,
        crewOtRateUsd: args.crewOtRateUsd,
        crewCostBufferPercent: args.crewCostBufferPercent,
        termsAndConditionsMarkdown: args.termsAndConditionsMarkdown?.trim() || "",
        termsVersion: args.termsVersion?.trim() || "v1",
        updatedAt: now,
      });
    }
    await ctx.db.patch(existing._id, {
      crewNormalRateUsd: args.crewNormalRateUsd ?? existing.crewNormalRateUsd,
      crewLeadRateUsd: args.crewLeadRateUsd ?? existing.crewLeadRateUsd,
      crewOtRateUsd: args.crewOtRateUsd ?? existing.crewOtRateUsd,
      crewCostBufferPercent: args.crewCostBufferPercent ?? existing.crewCostBufferPercent,
      termsAndConditionsMarkdown:
        args.termsAndConditionsMarkdown?.trim() ?? existing.termsAndConditionsMarkdown,
      termsVersion: args.termsVersion?.trim() ?? existing.termsVersion,
      updatedAt: now,
    });
    return existing._id;
  },
});
