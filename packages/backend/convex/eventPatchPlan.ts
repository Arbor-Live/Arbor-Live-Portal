import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireArborInternalContext } from "./lib/auth";
import { patchPlanValue } from "./schema";

/**
 * Which stage box each instrument group plugs into for one event. Drives both
 * the patch views and the generated Wing show file, so the download always
 * matches what the crew sees on screen.
 */
export const get = query({
  args: { eventId: v.id("events") },
  returns: v.union(v.null(), patchPlanValue),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const event = await ctx.db.get(args.eventId);
    return event?.patchPlan ?? null;
  },
});

export const set = mutation({
  args: { eventId: v.id("events"), plan: patchPlanValue },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");

    await ctx.db.patch(args.eventId, {
      patchPlan: args.plan,
      updatedAt: Date.now(),
    });
    return null;
  },
});
