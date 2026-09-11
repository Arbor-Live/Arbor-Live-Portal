"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";

/**
 * Ensure the event Immich album (best-effort), then enqueue post-event album emails.
 */
export const deliverForEvent = internalAction({
  args: {
    eventId: v.id("events"),
    todayKey: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runAction(internal.immichActions.ensureEventAlbumBestEffort, {
      eventId: args.eventId,
    });
    await ctx.runMutation(internal.email.postEventAlbumReminders.enqueueForEvent, {
      eventId: args.eventId,
      todayKey: args.todayKey,
    });
    return null;
  },
});
