import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { buildThisWeekAtArbor } from "../lib/newsletterWeek";

/**
 * Data-plane half of the newsletter broadcast. Kept separate from
 * `newsletterBroadcast.ts` because that file is `"use node"` (it talks to the
 * Resend SDK) and Convex only permits actions in Node-runtime modules — these
 * query/mutations must run in the default runtime.
 */

export const buildWeek = internalQuery({
  args: { now: v.number() },
  returns: v.object({
    weekLabel: v.string(),
    events: v.array(
      v.object({
        title: v.string(),
        whenLabel: v.string(),
        venueName: v.optional(v.string()),
        hostLabel: v.optional(v.string()),
        posterImageUrl: v.optional(v.string()),
        caption: v.optional(v.string()),
        eventUrl: v.string(),
        openMicSignupUrl: v.optional(v.string()),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    return await buildThisWeekAtArbor(ctx, args.now);
  },
});

export const getSubscriber = internalQuery({
  args: { subscriberId: v.id("newsletterSubscribers") },
  returns: v.union(
    v.object({
      _id: v.id("newsletterSubscribers"),
      email: v.string(),
      name: v.optional(v.string()),
      status: v.union(
        v.literal("subscribed"),
        v.literal("unsubscribed"),
      ),
      resendContactId: v.optional(v.string()),
      unsubscribeToken: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.subscriberId);
    if (!row) return null;
    return {
      _id: row._id,
      email: row.email,
      name: row.name,
      status: row.status,
      resendContactId: row.resendContactId,
      unsubscribeToken: row.unsubscribeToken,
    };
  },
});

export const recordSynced = internalMutation({
  args: {
    subscriberId: v.id("newsletterSubscribers"),
    resendContactId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.subscriberId, {
      resendContactId: args.resendContactId,
      syncError: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const recordSyncError = internalMutation({
  args: {
    subscriberId: v.id("newsletterSubscribers"),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.subscriberId, {
      syncError: args.error,
      updatedAt: Date.now(),
    });
    return null;
  },
});
