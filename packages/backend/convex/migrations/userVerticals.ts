import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { legacyTeamsToMembership } from "../lib/userVerticals";

/**
 * Backfill verticals + disciplines from legacy teams on userAdminProfiles.
 * Run until remaining is 0:
 *   npx convex run migrations/userVerticals:backfillUserVerticals
 */
export const backfillUserVerticals = internalMutation({
  args: { limit: v.optional(v.number()) },
  returns: v.object({
    migrated: v.number(),
    remaining: v.number(),
  }),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 100, 200));
    const profiles = await ctx.db.query("userAdminProfiles").withIndex("by_active").take(500);
    const pending = profiles.filter(
      (profile) => !profile.verticals?.length && (profile.teams?.length ?? 0) > 0,
    );
    let migrated = 0;

    for (const profile of pending.slice(0, limit)) {
      const membership = legacyTeamsToMembership(profile.teams ?? []);
      await ctx.db.patch(profile._id, {
        verticals: membership.verticals,
        disciplines: membership.disciplines,
        updatedAt: Date.now(),
      });
      migrated += 1;
    }

    return {
      migrated,
      remaining: Math.max(0, pending.length - migrated),
    };
  },
});
