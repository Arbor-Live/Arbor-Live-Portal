import { v } from "convex/values";
import { query } from "./_generated/server";
import {
  analyticsRangeArgs,
  assertValidRange,
  requireAnalyticsAccess,
} from "./lib/analyticsQuery";
import { average } from "./lib/analyticsTime";

const FEEDBACK_SCAN_LIMIT = 300;

const feedbackEntryValidator = v.object({
  id: v.id("eventFeedback"),
  eventTitle: v.optional(v.string()),
  invoiceNumber: v.optional(v.string()),
  rating: v.number(),
  comments: v.string(),
  submittedAt: v.number(),
});

const countBucketValidator = v.object({
  key: v.string(),
  count: v.number(),
});

/** Post-event client feedback for the Insights page. */
export const getEventFeedbackInsights = query({
  args: analyticsRangeArgs,
  returns: v.object({
    total: v.number(),
    averageRating: v.union(v.number(), v.null()),
    ratingDistribution: v.array(countBucketValidator),
    entries: v.array(feedbackEntryValidator),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAnalyticsAccess(ctx);
    assertValidRange(args.startMs, args.endMs);

    const rows = await ctx.db
      .query("eventFeedback")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", args.startMs).lte("createdAt", args.endMs))
      .take(FEEDBACK_SCAN_LIMIT);

    const ratingCounts = new Map<number, number>();
    let sum = 0;
    for (const row of rows) {
      sum += row.rating;
      ratingCounts.set(row.rating, (ratingCounts.get(row.rating) ?? 0) + 1);
    }

    const entries = [];
    for (const row of rows) {
      const event = row.eventId ? await ctx.db.get(row.eventId) : null;
      const invoice = row.invoiceId ? await ctx.db.get(row.invoiceId) : null;
      entries.push({
        id: row._id,
        eventTitle: event?.title,
        invoiceNumber: invoice?.invoiceNumber,
        rating: row.rating,
        comments: row.comments,
        submittedAt: row.submittedAt,
      });
    }
    entries.sort((a, b) => b.submittedAt - a.submittedAt);

    return {
      total: rows.length,
      averageRating: rows.length > 0 ? average(rows.map((row) => row.rating)) : null,
      ratingDistribution: [1, 2, 3, 4, 5].map((rating) => ({
        key: String(rating),
        count: ratingCounts.get(rating) ?? 0,
      })),
      entries,
      truncated: rows.length >= FEEDBACK_SCAN_LIMIT,
    };
  },
});
