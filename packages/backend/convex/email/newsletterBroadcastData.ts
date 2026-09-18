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
      /** Row generation, used to reject stale segment-removal jobs. */
      updatedAt: v.number(),
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
      updatedAt: row.updatedAt,
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

/**
 * A send that dies without releasing must not block the window forever. Convex
 * kills Node actions at 10 minutes, so anything older than 15 is certainly dead.
 */
const CLAIM_STALE_MS = 15 * 60 * 1000;

/**
 * Atomically claim the right to send the newsletter for `windowKey`. A single
 * mutation, so two concurrent `sendNow` calls (or the Monday cron and an admin)
 * cannot both reach Resend. Refuses when this week already sent, or while a
 * fresh send is in flight.
 */
export const claimBroadcast = internalMutation({
  args: { windowKey: v.string() },
  returns: v.object({ claimed: v.boolean(), reason: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const state = await ctx.db.query("newsletterBroadcastState").first();
    if (state) {
      if (state.lastSentAt !== undefined && state.windowKey === args.windowKey) {
        return { claimed: false, reason: `Already sent for ${args.windowKey}.` };
      }
      if (state.status === "sending" && now - state.startedAt < CLAIM_STALE_MS) {
        return {
          claimed: false,
          reason: "A newsletter send is already in progress.",
        };
      }
      await ctx.db.patch(state._id, {
        windowKey: args.windowKey,
        status: "sending",
        startedAt: now,
        lastSentAt: undefined,
        lastBroadcastId: undefined,
        updatedAt: now,
      });
      return { claimed: true };
    }
    await ctx.db.insert("newsletterBroadcastState", {
      windowKey: args.windowKey,
      status: "sending",
      startedAt: now,
      updatedAt: now,
    });
    return { claimed: true };
  },
});

/** Release a claim. With a `broadcastId` the window is marked sent; without
 *  one the attempt failed, so it is freed for a retry. */
export const releaseBroadcast = internalMutation({
  args: {
    windowKey: v.string(),
    broadcastId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await ctx.db.query("newsletterBroadcastState").first();
    if (!state) return null;
    // Only release the claim this run took; a stale reclaim of a newer window
    // must not be clobbered by the late finish of an old one.
    if (state.windowKey !== args.windowKey || state.status !== "sending") {
      return null;
    }
    const now = Date.now();
    await ctx.db.patch(state._id, {
      status: "idle",
      lastSentAt: args.broadcastId ? now : undefined,
      lastBroadcastId: args.broadcastId,
      updatedAt: now,
    });
    return null;
  },
});
