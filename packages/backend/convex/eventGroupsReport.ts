import { pacificDateKey } from "@arbor/format";
import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { isMultiDayGroup, isRecurringGroup } from "./lib/eventGroupKind";

/**
 * Read-only dry run of `migrations:groupMultiDayBookings`: what would become a
 * multi-day group, what is skipped, and which shapes look odd. It writes
 * nothing, so it is safe to run against any deployment:
 *
 *   npx convex run eventGroupsReport:previewMultiDayGrouping '{"numItems":50}'
 *
 * Pages over invoices; pass `nextCursor` back as `cursor` until `isDone`.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** A booking spanning more than this many days between first and last day looks odd. */
const ODD_SPAN_DAYS = 31;
const SAMPLE_LIMIT = 12;

/**
 * Read one invoice page and return grouping counts plus at most 12 diagnostic
 * samples without writing. `numItems` defaults to 50; continue with `nextCursor`
 * until `isDone`. Counts are per page and may overlap. This reports eligibility
 * and unusual dates; it does not attempt template capture or validate templates.
 */
export const previewMultiDayGrouping = internalQuery({
  args: {
    cursor: v.optional(v.string()),
    numItems: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("invoices")
      .paginate({ cursor: args.cursor ?? null, numItems: args.numItems ?? 50 });

    const counts = {
      invoices: 0,
      noDays: 0,
      oneDay: 0,
      wouldGroup: 0,
      alreadyGrouped: 0,
      skippedRecurring: 0,
      oneLiveDayOnly: 0,
      oversized: 0,
      oddSpan: 0,
      sameDateDuplicates: 0,
      daysThatWouldJoin: 0,
    };
    const samples: Array<{ invoiceId: string; reason: string; days: number; live: number }> = [];
    const note = (invoiceId: string, reason: string, days: number, live: number) => {
      if (samples.length < SAMPLE_LIMIT) samples.push({ invoiceId, reason, days, live });
    };

    for (const invoice of page.page) {
      counts.invoices += 1;
      const days = await ctx.db
        .query("events")
        .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoice._id))
        .take(202);
      if (days.length === 0) {
        counts.noDays += 1;
        continue;
      }
      if (days.length === 1) counts.oneDay += 1;
      if (days.length > 200) {
        counts.oversized += 1;
        note(invoice._id, "more than 200 days (sync leaves it unchanged)", days.length, -1);
        continue;
      }
      const live = days.filter((day) => day.status !== "cancelled");

      let recurring = false;
      let existingMultiDay = false;
      for (const seriesId of new Set(days.flatMap((day) => (day.seriesId ? [day.seriesId] : [])))) {
        const group = await ctx.db.get(seriesId);
        if (!group) continue;
        if (isRecurringGroup(group)) recurring = true;
        if (isMultiDayGroup(group)) existingMultiDay = true;
      }
      if (recurring) {
        counts.skippedRecurring += 1;
        continue;
      }
      if (existingMultiDay) {
        counts.alreadyGrouped += 1;
        continue;
      }
      if (live.length < 2) {
        if (days.length >= 2) {
          counts.oneLiveDayOnly += 1;
          note(invoice._id, "several days but fewer than two live", days.length, live.length);
        }
        continue;
      }

      counts.wouldGroup += 1;
      counts.daysThatWouldJoin += days.length;
      const starts = days.map((day) => day.startAt).sort((a, b) => a - b);
      const spanDays = (starts[starts.length - 1]! - starts[0]!) / DAY_MS;
      if (spanDays > ODD_SPAN_DAYS) {
        counts.oddSpan += 1;
        note(invoice._id, `days span ${Math.round(spanDays)} days`, days.length, live.length);
      }
      const dateKeys = new Set(starts.map((ms) => pacificDateKey(ms)));
      if (dateKeys.size < days.length) {
        counts.sameDateDuplicates += 1;
        note(invoice._id, "two days on the same date", days.length, live.length);
      }
    }

    return { counts, samples, isDone: page.isDone, nextCursor: page.continueCursor };
  },
});
