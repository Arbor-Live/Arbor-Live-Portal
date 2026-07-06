import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";

/**
 * Dependency-free fixed-window rate limiter for public (unauthenticated)
 * endpoints. State lives in the `rateLimitHits` table, one row per key. Each
 * key tracks a rolling fixed window: once `limit` hits accumulate inside
 * `windowMs`, further calls throw until the window rolls over.
 *
 * Convex mutations are transactions, so the read-then-write below is
 * serialized per key by OCC — concurrent callers for the same key conflict and
 * retry rather than double-counting or racing on the first insert.
 */
export type RateLimitRule = { limit: number; windowMs: number };

export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;

export async function enforceRateLimit(
  ctx: MutationCtx,
  key: string,
  rule: RateLimitRule,
): Promise<void> {
  const now = Date.now();
  const existing = await ctx.db
    .query("rateLimitHits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();

  if (!existing || now - existing.windowStartMs >= rule.windowMs) {
    if (existing) {
      await ctx.db.patch(existing._id, { windowStartMs: now, count: 1 });
    } else {
      await ctx.db.insert("rateLimitHits", { key, windowStartMs: now, count: 1 });
    }
    return;
  }

  if (existing.count >= rule.limit) {
    const retrySeconds = Math.ceil((rule.windowMs - (now - existing.windowStartMs)) / 1000);
    throw new Error(`Too many requests. Please try again in about ${retrySeconds}s.`);
  }

  await ctx.db.patch(existing._id, { count: existing.count + 1 });
}

/**
 * Rate-limit entry point for actions (which cannot touch the database
 * directly). Public actions call this via `ctx.runMutation` before doing
 * expensive work such as PDF rendering.
 */
export const enforce = internalMutation({
  args: { key: v.string(), limit: v.number(), windowMs: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, args.key, { limit: args.limit, windowMs: args.windowMs });
    return null;
  },
});

/**
 * Daily cleanup of expired limiter rows so the table stays bounded. Anything
 * whose window closed more than a day ago is safe to drop — a fresh call simply
 * re-inserts the key.
 */
export const pruneExpired = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - 24 * HOUR_MS;
    // Bounded per invocation to stay within transaction limits; the daily cron
    // cadence keeps up with realistic key churn.
    const stale = await ctx.db
      .query("rateLimitHits")
      .withIndex("by_windowStartMs", (q) => q.lt("windowStartMs", cutoff))
      .take(2000);
    for (const row of stale) {
      await ctx.db.delete(row._id);
    }
    return null;
  },
});
