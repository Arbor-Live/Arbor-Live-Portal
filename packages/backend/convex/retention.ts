import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

/**
 * Audit/history rows older than this are pruned nightly. One year keeps a full
 * event/booking cycle while bounding the two write-heavy append-only tables
 * that previously grew forever (`emailNotifications`, `statusTransitions`).
 */
const RETENTION_DAYS = 365;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;
const BATCH = 500;

/**
 * Delete a year of email notification history. `by_status` orders rows by
 * `_creationTime` within a status, and `createdAt` is stamped at insert, so the
 * `take(BATCH)` head is the oldest batch for each status.
 */
export const pruneEmailNotifications = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const cutoff = Date.now() - RETENTION_MS;
    const statuses = ["queued", "sent", "failed"] as const;
    let deleted = 0;
    let anyFullBatch = false;
    for (const status of statuses) {
      const rows = await ctx.db
        .query("emailNotifications")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(BATCH);
      let statusDeleted = 0;
      for (const row of rows) {
        if (row.createdAt >= cutoff) break;
        await ctx.db.delete(row._id);
        statusDeleted += 1;
      }
      deleted += statusDeleted;
      if (statusDeleted >= BATCH) anyFullBatch = true;
    }
    // A full batch in any status means more than a year of history remains;
    // keep draining rather than letting the backlog outrun the daily cron.
    if (anyFullBatch) {
      await ctx.scheduler.runAfter(0, internal.retention.pruneEmailNotifications, {});
    }
    return deleted;
  },
});

/** Delete a year of status-transition history across every tracked entity type. */
export const pruneStatusTransitions = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const cutoff = Date.now() - RETENTION_MS;
    const entityTypes = ["eventRequest", "event", "invoice"] as const;
    let deleted = 0;
    let anyFullBatch = false;
    for (const entityType of entityTypes) {
      const rows = await ctx.db
        .query("statusTransitions")
        .withIndex("by_entityType_and_at", (q) => q.eq("entityType", entityType).lt("at", cutoff))
        .take(BATCH);
      for (const row of rows) {
        await ctx.db.delete(row._id);
        deleted += 1;
      }
      if (rows.length >= BATCH) anyFullBatch = true;
    }
    if (anyFullBatch) {
      await ctx.scheduler.runAfter(0, internal.retention.pruneStatusTransitions, {});
    }
    return deleted;
  },
});
