import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { getCurrentUserOrNull, getUserId, requireAuth } from "./lib/auth";
import { UNREAD_SCAN_LIMIT } from "./lib/inAppNotifications";

/** Devices kept per user; the oldest is dropped past this. */
const MAX_DEVICES_PER_USER = 10;

/** VAPID public key for `pushManager.subscribe`; null when push isn't configured. */
export const getPushConfig = query({
  args: {},
  returns: v.object({ vapidPublicKey: v.union(v.string(), v.null()) }),
  handler: async () => ({ vapidPublicKey: process.env.VAPID_PUBLIC_KEY?.trim() || null }),
});

/** Whether this browser's endpoint is registered to the signed-in user. */
export const isSubscribed = query({
  args: { endpoint: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) return false;
    const row = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .first();
    return row?.userId === getUserId(user);
  },
});

/** Register (or re-own, after a sign-in switch) this browser's push endpoint. */
export const subscribe = mutation({
  args: {
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = getUserId(await requireAuth(ctx));
    if (!args.endpoint.startsWith("https://")) throw new Error("Invalid push endpoint.");
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .take(5);
    for (const row of existing) await ctx.db.delete(row._id);

    const devices = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(MAX_DEVICES_PER_USER + 1);
    for (const stale of devices.slice(0, Math.max(0, devices.length - MAX_DEVICES_PER_USER + 1))) {
      await ctx.db.delete(stale._id);
    }

    await ctx.db.insert("pushSubscriptions", {
      userId,
      endpoint: args.endpoint,
      p256dh: args.p256dh,
      auth: args.auth,
      userAgent: args.userAgent?.slice(0, 300),
      createdAt: Date.now(),
    });
    return null;
  },
});

export const unsubscribe = mutation({
  args: { endpoint: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = getUserId(await requireAuth(ctx));
    const rows = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .take(5);
    for (const row of rows) {
      if (row.userId === userId) await ctx.db.delete(row._id);
    }
    return null;
  },
});

/** Everything `pushDelivery` needs to send one notification; null if it's moot. */
export const getPushDelivery = internalQuery({
  args: { notificationId: v.id("notifications") },
  returns: v.union(
    v.null(),
    v.object({
      title: v.string(),
      body: v.optional(v.string()),
      path: v.optional(v.string()),
      unreadCount: v.number(),
      subscriptions: v.array(
        v.object({ endpoint: v.string(), p256dh: v.string(), auth: v.string() }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.notificationId);
    if (!row || row.status !== "delivered" || row.readAt !== undefined) return null;
    const subscriptions = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_userId", (q) => q.eq("userId", row.userId))
      .take(MAX_DEVICES_PER_USER);
    if (subscriptions.length === 0) return null;
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_userId_and_status_and_readAt", (q) =>
        q.eq("userId", row.userId).eq("status", "delivered").eq("readAt", undefined),
      )
      .take(UNREAD_SCAN_LIMIT);
    return {
      title: row.title,
      body: row.body,
      path: row.path,
      unreadCount: unread.length,
      subscriptions: subscriptions.map(({ endpoint, p256dh, auth }) => ({ endpoint, p256dh, auth })),
    };
  },
});

/** Drop endpoints the push service reported gone (404/410). */
export const removeExpiredSubscriptions = internalMutation({
  args: { endpoints: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const endpoint of args.endpoints) {
      const rows = await ctx.db
        .query("pushSubscriptions")
        .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
        .take(5);
      for (const row of rows) await ctx.db.delete(row._id);
    }
    return null;
  },
});
