import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

/**
 * Set visibility to public for internal events that have no marketing poster
 * designer assigned. Run until remaining is 0:
 *   npx convex run migrations/eventVisibility:backfillUnassignedEventsToPublic
 */
export const backfillUnassignedEventsToPublic = internalMutation({
  args: { limit: v.optional(v.number()) },
  returns: v.object({
    migrated: v.number(),
    remaining: v.number(),
  }),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 100, 200));
    const events = await ctx.db.query("events").withIndex("by_visibility").take(500);
    const designs = await ctx.db.query("eventMarketingDesigns").take(500);
    const assigneeByEventId = new Map(
      designs.map((design) => [design.eventId, design.assigneeUserId ?? null]),
    );

    const pending = events.filter(
      (event) => event.visibility === "internal" && !assigneeByEventId.get(event._id),
    );

    let migrated = 0;
    const now = Date.now();
    for (const event of pending.slice(0, limit)) {
      await ctx.db.patch(event._id, {
        visibility: "public",
        updatedAt: now,
      });
      migrated += 1;
    }

    return {
      migrated,
      remaining: Math.max(0, pending.length - migrated),
    };
  },
});
