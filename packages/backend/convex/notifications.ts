import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { getCurrentUserOrNull, getUserId, requireAuth } from "./lib/auth";
import { emailTemplateValue } from "./lib/emailTemplateValue";
import {
  deliverPendingNotification as deliverPendingNotificationRow,
  NOTIFICATION_LIST_LIMIT,
  UNREAD_SCAN_LIMIT,
} from "./lib/inAppNotifications";

const notificationValue = v.object({
  _id: v.id("notifications"),
  template: emailTemplateValue,
  title: v.string(),
  body: v.optional(v.string()),
  path: v.optional(v.string()),
  createdAt: v.number(),
  readAt: v.optional(v.number()),
});

/**
 * Badge count plus every unread row's path. Subscribed on every page so the
 * bell stays live and the client can mark rows read when their page is open.
 */
export const getUnreadSummary = query({
  args: {},
  returns: v.object({
    count: v.number(),
    hasMore: v.boolean(),
    unread: v.array(v.object({ _id: v.id("notifications"), path: v.optional(v.string()) })),
  }),
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) return { count: 0, hasMore: false, unread: [] };
    const userId = getUserId(user);
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_userId_and_status_and_readAt", (q) =>
        q.eq("userId", userId).eq("status", "delivered").eq("readAt", undefined),
      )
      .take(UNREAD_SCAN_LIMIT + 1);
    const unread = rows.slice(0, UNREAD_SCAN_LIMIT);
    return {
      count: unread.length,
      hasMore: rows.length > UNREAD_SCAN_LIMIT,
      unread: unread.map((row) => ({ _id: row._id, path: row.path })),
    };
  },
});

/** Most recent notifications, newest first (popover contents). */
export const listRecent = query({
  args: {},
  returns: v.array(notificationValue),
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) return [];
    const userId = getUserId(user);
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_userId_and_status_and_createdAt", (q) =>
        q.eq("userId", userId).eq("status", "delivered"),
      )
      .order("desc")
      .take(NOTIFICATION_LIST_LIMIT);
    return rows.map((row) => ({
      _id: row._id,
      template: row.template,
      title: row.title,
      body: row.body,
      path: row.path,
      createdAt: row.createdAt,
      readAt: row.readAt,
    }));
  },
});

/** Mark specific rows read (clicked, or their page was visited). Ignores others' rows. */
export const markRead = mutation({
  args: { notificationIds: v.array(v.id("notifications")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = getUserId(await requireAuth(ctx));
    const now = Date.now();
    for (const notificationId of args.notificationIds.slice(0, UNREAD_SCAN_LIMIT)) {
      const row = await ctx.db.get(notificationId);
      if (!row || row.userId !== userId || row.readAt !== undefined) continue;
      await ctx.db.patch(notificationId, { readAt: now });
    }
    return null;
  },
});

const MARK_ALL_READ_BATCH = 500;

/** Mark one batch read; schedules the next batch while unread rows remain. */
async function markUnreadBatch(ctx: MutationCtx, userId: string, readAt: number) {
  const rows = await ctx.db
    .query("notifications")
    .withIndex("by_userId_and_status_and_readAt", (q) =>
      q.eq("userId", userId).eq("status", "delivered").eq("readAt", undefined),
    )
    .take(MARK_ALL_READ_BATCH);
  for (const row of rows) {
    await ctx.db.patch(row._id, { readAt });
  }
  if (rows.length === MARK_ALL_READ_BATCH) {
    await ctx.scheduler.runAfter(0, internal.notifications.markAllReadContinue, {
      userId,
      readAt,
    });
  }
}

export const markAllRead = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = getUserId(await requireAuth(ctx));
    await markUnreadBatch(ctx, userId, Date.now());
    return null;
  },
});

/** Continuation for `markAllRead` past the first batch. */
export const markAllReadContinue = internalMutation({
  args: { userId: v.string(), readAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await markUnreadBatch(ctx, args.userId, args.readAt);
    return null;
  },
});

/** Debounce timer for a pending row; stale generations no-op. */
export const deliverPendingNotification = internalMutation({
  args: { notificationId: v.id("notifications"), generation: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.notificationId);
    if (!row || row.status !== "pending" || row.generation !== args.generation) return null;
    await deliverPendingNotificationRow(ctx, row);
    return null;
  },
});
