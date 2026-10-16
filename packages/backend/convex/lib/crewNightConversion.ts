import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { nightRowAnswer } from "./crewNightAnswers";
import {
  eventCrewSpan,
  legacyResponseToNight,
  mergeNightAnswers,
  nightKeyForEvent,
} from "./crewNights";
import { normalizeEventStatus } from "./eventStatus";

/**
 * Fold one old per-event answer into that person's night row
 * (`migrations.convertAvailabilityToNights`). Past nights are converted too,
 * so Insights and backup counting keep their history. Reads per row are
 * bounded: the event, its blocks (≤ 200) and one night row.
 *
 * Idempotent: merging is a union of time and the most available status, so
 * running a row twice changes nothing. A night the person answered themselves
 * (`source: "answer"` / `"away"`) is never touched.
 */
export async function convertLegacyResponseRow(
  ctx: MutationCtx,
  row: Doc<"eventCrewAvailabilityResponses">,
) {
  const event = await ctx.db.get(row.eventId);
  if (!event || normalizeEventStatus(event.status) === "cancelled") return "skipped" as const;
  const nightKey = nightKeyForEvent(event);

  const blocks = await ctx.db
    .query("eventScheduleBlocks")
    .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", event._id))
    .take(200);
  const candidate = legacyResponseToNight(row, eventCrewSpan(event, blocks));

  const existing = await ctx.db
    .query("crewAvailabilityNights")
    .withIndex("by_userId_and_nightKey", (q) => q.eq("userId", row.userId).eq("nightKey", nightKey))
    .unique();
  if (existing && existing.source !== "converted") return "kept" as const;

  const night = existing ? mergeNightAnswers(nightRowAnswer(existing), candidate) : candidate;
  const now = Date.now();
  const fields = {
    userId: row.userId,
    nightKey,
    status: night.status,
    windows: night.windows,
    ...(night.notes ? { notes: night.notes } : {}),
    source: "converted" as const,
    respondedAt: night.respondedAt,
    updatedAt: now,
  };
  if (existing) {
    await ctx.db.replace(existing._id, { ...fields, createdAt: existing.createdAt });
  } else {
    await ctx.db.insert("crewAvailabilityNights", { ...fields, createdAt: now });
  }
  return "converted" as const;
}
