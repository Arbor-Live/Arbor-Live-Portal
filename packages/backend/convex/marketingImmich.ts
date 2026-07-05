import { v } from "convex/values";
import { internal } from "./_generated/api";
import { query } from "./_generated/server";
import { isImmichConfigured } from "./lib/immichClient";

export const isLibraryAvailable = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    try {
      await ctx.runQuery(internal.marketingPosts.assertAdminInternal, {});
    } catch {
      return false;
    }
    return isImmichConfigured();
  },
});
