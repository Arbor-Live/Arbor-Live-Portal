import {
  RAIN_CHANCE_THRESHOLD,
  RAIN_LIKELY_THRESHOLD,
  RAIN_PHASE_LABEL,
  eventRainRisk,
  type RainHour,
} from "@arbor/format";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { normalizeEventStatus } from "./eventStatus";
import { recordRainForecastNotification } from "./inAppNotifications";

const HOUR_MS = 3_600_000;
const ALERT_LEAD_MS = 48 * HOUR_MS;
/** Setup can start days before an event's own startAt, so look this far back and ahead of the lead. */
const WINDOW_SLACK_MS = 3 * 24 * HOUR_MS;
/** About 15 events start in a normal 5-day window; 200 is far past that. */
const EVENT_TAKE = 200;
const BLOCK_TAKE = 100;

type Level = "chance" | "likely";

/**
 * Alert each upcoming event's manager and day-of lead once when rain reaches
 * 30% and once more at 60%. `eventRainAlerts` holds a row per event and level,
 * written in the same transaction as the notifications, so a level never repeats.
 */
export async function sendRainAlerts(ctx: MutationCtx, hours: RainHour[], now: number) {
  const rows = await ctx.db
    .query("events")
    .withIndex("by_startAt", (q) =>
      q.gte("startAt", now - WINDOW_SLACK_MS).lte("startAt", now + ALERT_LEAD_MS + WINDOW_SLACK_MS),
    )
    .take(EVENT_TAKE);

  for (const event of rows) {
    if (normalizeEventStatus(event.status) === "cancelled") continue;
    const recipients = [...new Set([event.eventManagerUserId, event.dayOfLeadUserId])].filter(
      (id): id is string => Boolean(id),
    );
    if (!recipients.length) continue;

    const blocks = await ctx.db
      .query("eventScheduleBlocks")
      .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", event._id))
      .take(BLOCK_TAKE);
    const firstStart = blocks.length ? blocks[0]!.startsAt : event.startAt;
    if (firstStart > now + ALERT_LEAD_MS) continue;

    const venue = event.venueId ? await ctx.db.get(event.venueId) : null;
    const risk = eventRainRisk({ startAt: event.startAt, endAt: event.endAt, venueKind: venue?.kind, blocks }, hours, now);
    if (!risk) continue;

    const levels: Level[] = [];
    if (risk.chance >= RAIN_CHANCE_THRESHOLD) levels.push("chance");
    if (risk.chance >= RAIN_LIKELY_THRESHOLD) levels.push("likely");
    const unsent: Level[] = [];
    for (const level of levels) {
      const sent = await ctx.db
        .query("eventRainAlerts")
        .withIndex("by_eventId_and_level", (q) => q.eq("eventId", event._id).eq("level", level))
        .unique();
      if (!sent) unsent.push(level);
    }
    if (!unsent.length) continue;

    const body = risk.phases.map((p) => `${RAIN_PHASE_LABEL[p.phase]} ${p.chance}%`).join(" · ");
    const level = unsent[unsent.length - 1]!;
    for (const userId of recipients) {
      await recordRainForecastNotification(ctx, {
        userId,
        eventId: event._id,
        level,
        title: `Rain forecast: ${event.title}`,
        body,
      });
    }
    await recordSent(ctx, event._id, unsent, now);
  }
}

async function recordSent(ctx: MutationCtx, eventId: Id<"events">, levels: Level[], now: number) {
  for (const level of levels) await ctx.db.insert("eventRainAlerts", { eventId, level, sentAt: now });
}
