import { v } from "convex/values";
import { query } from "./_generated/server";
import { findAuthUsersByIds } from "./lib/auth";
import {
  analyticsRangeArgs,
  assertValidRange,
  requireAnalyticsAccess,
} from "./lib/analyticsQuery";
import { average } from "./lib/analyticsTime";

const POST_MORTEM_SCAN_LIMIT = 300;

const postMortemEntryValidator = v.object({
  id: v.id("postMortemFeedback"),
  eventTitle: v.optional(v.string()),
  leadName: v.optional(v.string()),
  rating: v.number(),
  whatWentWell: v.string(),
  whatCouldImprove: v.string(),
  submittedAt: v.number(),
});

const countBucketValidator = v.object({
  key: v.string(),
  count: v.number(),
});

/** Day-of-lead post-mortem feedback for the Insights page. */
export const getPostMortemInsights = query({
  args: analyticsRangeArgs,
  returns: v.object({
    total: v.number(),
    averageRating: v.union(v.number(), v.null()),
    ratingDistribution: v.array(countBucketValidator),
    entries: v.array(postMortemEntryValidator),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAnalyticsAccess(ctx);
    assertValidRange(args.startMs, args.endMs);

    const rows = await ctx.db
      .query("postMortemFeedback")
      .withIndex("by_submittedAt", (q) =>
        q.gte("submittedAt", args.startMs).lte("submittedAt", args.endMs),
      )
      .take(POST_MORTEM_SCAN_LIMIT);

    const submitted = rows.filter(
      (row): row is typeof row & {
        submittedAt: number;
        rating: number;
        whatWentWell: string;
        whatCouldImprove: string;
      } => row.submittedAt != null && row.rating != null,
    );

    const ratingCounts = new Map<number, number>();
    let sum = 0;
    for (const row of submitted) {
      sum += row.rating;
      ratingCounts.set(row.rating, (ratingCounts.get(row.rating) ?? 0) + 1);
    }

    const userByKey = await findAuthUsersByIds(
      ctx,
      submitted.map((row) => row.userId),
    );

    const entries = [];
    for (const row of submitted) {
      const event = row.eventId ? await ctx.db.get(row.eventId) : null;
      const lead = userByKey.get(row.userId);
      entries.push({
        id: row._id,
        eventTitle: event?.title,
        leadName: lead?.name ?? undefined,
        rating: row.rating,
        whatWentWell: row.whatWentWell,
        whatCouldImprove: row.whatCouldImprove,
        submittedAt: row.submittedAt,
      });
    }
    entries.sort((a, b) => b.submittedAt - a.submittedAt);

    return {
      total: submitted.length,
      averageRating: submitted.length > 0 ? average(submitted.map((row) => row.rating)) : null,
      ratingDistribution: [1, 2, 3, 4, 5].map((rating) => ({
        key: String(rating),
        count: ratingCounts.get(rating) ?? 0,
      })),
      entries,
      truncated: rows.length >= POST_MORTEM_SCAN_LIMIT,
    };
  },
});
