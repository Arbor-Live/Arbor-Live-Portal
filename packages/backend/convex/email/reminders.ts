import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { normalizeEventStatus } from "../lib/eventStatus";
import { EVENT_TIMEZONE, reminderDayKey } from "./constants";
import { getEventLeadRecipients } from "./recipients";
import { scheduleScheduleReminderEmail } from "./triggers";

const REMINDER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function daysUntil(startAt: number, nowMs: number) {
  return Math.max(1, Math.ceil((startAt - nowMs) / (24 * 60 * 60 * 1000)));
}

export const run = internalMutation({
  args: {},
  returns: v.object({ enqueuedCount: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const dayKey = reminderDayKey(now, EVENT_TIMEZONE);
    const windowEnd = now + REMINDER_WINDOW_MS;

    const candidates = await ctx.db
      .query("events")
      .withIndex("by_startAt", (q) => q.gte("startAt", now).lte("startAt", windowEnd))
      .take(500);

    let enqueuedCount = 0;

    for (const event of candidates) {
      const status = normalizeEventStatus(event.status);
      if (status !== "logistics" && status !== "scheduling") continue;

      const blocks = await ctx.db
        .query("eventScheduleBlocks")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(1);
      if (blocks.length > 0) continue;

      const recipients = await getEventLeadRecipients(ctx, event._id);
      if (recipients.length === 0) continue;

      const days = daysUntil(event.startAt, now);
      for (const recipient of recipients) {
        await scheduleScheduleReminderEmail(ctx, event._id, days, dayKey, recipient);
        enqueuedCount += 1;
      }
    }

    return { enqueuedCount };
  },
});
