import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/auth";

/**
 * Public-facing marketing feature flags. The read query is intentionally
 * unauthenticated (no `requireAuth`) so the public Open Mic form can decide
 * whether to show the Arbor Live intro slide before deciding to render it for
 * anonymous visitors — mirroring `publicMarketing.ts`.
 */
export const get = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      openMicMarketingBoost: v.boolean(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const settings = await ctx.db.query("marketingSettings").first();
    if (!settings) return null;
    return {
      openMicMarketingBoost: settings.openMicMarketingBoost,
      updatedAt: settings.updatedAt,
    };
  },
});

/**
 * Admin-only update. Insert-if-absent / patch-if-present singleton pattern
 * (same as `lostFoundSettings.update`). Only fields passed are touched.
 */
export const update = mutation({
  args: {
    openMicMarketingBoost: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const existing = await ctx.db.query("marketingSettings").first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        openMicMarketingBoost:
          args.openMicMarketingBoost ?? existing.openMicMarketingBoost,
        updatedAt: now,
      });
      return null;
    }
    await ctx.db.insert("marketingSettings", {
      openMicMarketingBoost: args.openMicMarketingBoost ?? false,
      updatedAt: now,
    });
    return null;
  },
});