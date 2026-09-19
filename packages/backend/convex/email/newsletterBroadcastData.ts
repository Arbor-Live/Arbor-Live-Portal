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
 *
 * A stale in-flight claim is *not* reclaimed here: Resend has no idempotency key
 * for broadcasts, so the caller must first check Resend for a broadcast that
 * the dead attempt may have accepted (`needsReconcile`), then call
 * `reclaimStaleBroadcast`.
 */
export const claimBroadcast = internalMutation({
  args: { windowKey: v.string() },
  returns: v.object({
    claimed: v.boolean(),
    reason: v.optional(v.string()),
    /** Set when a stale same-window claim must be reconciled with Resend. */
    needsReconcile: v.optional(v.boolean()),
    /** When the stale claim started, so reconciliation only trusts newer sends. */
    startedAtMs: v.optional(v.number()),
    /** Opaque token proving ownership of the claim; required to finalize it. */
    claimToken: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const state = await ctx.db.query("newsletterBroadcastState").first();
    if (state) {
      if (state.lastSentAt !== undefined && state.windowKey === args.windowKey) {
        return { claimed: false, reason: `Already sent for ${args.windowKey}.` };
      }
      if (state.status === "sending") {
        const sameWindow = state.windowKey === args.windowKey;
        if (sameWindow && now - state.startedAt < CLAIM_STALE_MS) {
          return {
            claimed: false,
            reason: "A newsletter send is already in progress.",
          };
        }
        if (sameWindow) {
          return {
            claimed: false,
            reason: "Reconciling a previous send attempt.",
            needsReconcile: true,
            startedAtMs: state.startedAt,
          };
        }
        // A stuck send from an earlier window is stale by definition.
      }
      await ctx.db.patch(state._id, {
        windowKey: args.windowKey,
        status: "sending",
        startedAt: now,
        lastSentAt: undefined,
        lastBroadcastId: undefined,
        updatedAt: now,
      });
      return { claimed: true, claimToken: now };
    }
    await ctx.db.insert("newsletterBroadcastState", {
      windowKey: args.windowKey,
      status: "sending",
      startedAt: now,
      updatedAt: now,
    });
    return { claimed: true, claimToken: now };
  },
});

/**
 * Reclaim a stale claim for `windowKey` after the caller verified Resend did
 * not accept the previous attempt. Only the claim this window is re-opened; a
 * fresh claim is left alone.
 */
export const reclaimStaleBroadcast = internalMutation({
  args: { windowKey: v.string() },
  returns: v.object({ claimed: v.boolean(), claimToken: v.optional(v.number()) }),
  handler: async (ctx, args) => {
    const state = await ctx.db.query("newsletterBroadcastState").first();
    if (!state) return { claimed: false };
    if (state.windowKey !== args.windowKey || state.status !== "sending") {
      return { claimed: false };
    }
    const now = Date.now();
    if (now - state.startedAt < CLAIM_STALE_MS) return { claimed: false };
    await ctx.db.patch(state._id, { startedAt: now, updatedAt: now });
    return { claimed: true, claimToken: now };
  },
});

/**
 * Mark a window sent after Resend confirmed the broadcast id. Guarded by the
 * claim token so a slow action cannot finalize a newer claim it no longer owns
 * (which would set the singleton idle and let the newer window send twice).
 */
export const markBroadcastSent = internalMutation({
  args: {
    windowKey: v.string(),
    claimToken: v.number(),
    broadcastId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await ctx.db.query("newsletterBroadcastState").first();
    if (!state) return null;
    if (!ownsClaim(state, args.windowKey, args.claimToken)) return null;
    const now = Date.now();
    await ctx.db.patch(state._id, {
      status: "idle",
      lastSentAt: now,
      lastBroadcastId: args.broadcastId,
      updatedAt: now,
    });
    return null;
  },
});

/**
 * Free the window after a *confirmed* rejection (Resend returned an error), so
 * a retry can send. Ambiguous outcomes keep the claim and are reconciled.
 * Guarded by the claim token for the same reason as `markBroadcastSent`.
 */
export const releaseBroadcast = internalMutation({
  args: { windowKey: v.string(), claimToken: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await ctx.db.query("newsletterBroadcastState").first();
    if (!state) return null;
    if (!ownsClaim(state, args.windowKey, args.claimToken)) return null;
    const now = Date.now();
    await ctx.db.patch(state._id, {
      status: "idle",
      lastSentAt: undefined,
      lastBroadcastId: undefined,
      updatedAt: now,
    });
    return null;
  },
});

/** Whether the singleton still holds the claim identified by `claimToken`. */
function ownsClaim(
  state: { windowKey: string; status: string; startedAt: number },
  windowKey: string,
  claimToken: number,
) {
  return (
    state.windowKey === windowKey &&
    state.status === "sending" &&
    state.startedAt === claimToken
  );
}

/**
 * Record a segment-removal failure only if the row is still the unsubscribe we
 * acted on — never attach a stale unsubscribe error to a reactivated row.
 */
export const recordUnsubscribeErrorIfCurrent = internalMutation({
  args: {
    subscriberId: v.id("newsletterSubscribers"),
    expectedUpdatedAt: v.optional(v.number()),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.subscriberId);
    if (!row || row.status !== "unsubscribed") return null;
    if (
      args.expectedUpdatedAt !== undefined &&
      row.updatedAt !== args.expectedUpdatedAt
    ) {
      return null;
    }
    await ctx.db.patch(row._id, { syncError: args.error, updatedAt: Date.now() });
    return null;
  },
});
