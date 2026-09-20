import { formatDate, formatDateTimeRange } from "@arbor/format";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { listCrewedEventsInRange } from "./crewedEvents";
import { eventMatchesUserTeams } from "./crewTeams";
import { normalizeEventStatus } from "./eventStatus";
import { bandPaymentStatusLabel } from "./bandPayments";
import { resolveParticipationFlags } from "./userParticipation";
import {
  getDisciplinesForEventMatching,
  isStaffMember,
  resolveProfileMembership,
} from "./userVerticals";
import { buildUserTimecards } from "./userTimecards";
import { listMyEventsNeedingPhotos, listMyPostMortems } from "./myEventActions";

/** Availability window for the digest (mirrors "next two weeks"). */
const DIGEST_AVAILABILITY_WEEKS = 2;
/** Scheduled-events window. */
const DIGEST_SCHEDULED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Items listed per section; the title always carries the true count. */
const DIGEST_ITEM_CAP = 6;
/** Bound on rows scanned while assembling a single digest. */
const DIGEST_SCAN_CAP = 500;
/** Bound on status rows scanned when counting admin work queues. */
const DIGEST_COUNT_SCAN_CAP = 50;
/** Bound on post-mortem rows scanned for the admin queue (mirrors Insights). */
const DIGEST_POST_MORTEM_SCAN_CAP = 300;

export type WeeklyDigestSection = {
  title: string;
  /** Full actionable count; `items` may be truncated to DIGEST_ITEM_CAP. */
  totalCount: number;
  /** Rendered as "<label> • <detail>" rows. */
  items: string[];
};

export type WeeklyDigest = {
  sections: WeeklyDigestSection[];
  itemCount: number;
};

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

async function buildAvailabilitySection(
  ctx: QueryCtx,
  userId: string,
  profile: Doc<"userAdminProfiles"> | null,
  now: number,
): Promise<WeeklyDigestSection | null> {
  const disciplines = getDisciplinesForEventMatching(
    resolveProfileMembership(profile ?? {}).disciplines,
  );
  const windowEnd = now + DIGEST_AVAILABILITY_WEEKS * 7 * 24 * 60 * 60 * 1000;
  const matchedEvents = (await listCrewedEventsInRange(ctx, now, windowEnd)).filter((event) =>
    eventMatchesUserTeams(event.teamsInterested, disciplines),
  );
  if (matchedEvents.length === 0) return null;

  const myResponses = await ctx.db
    .query("eventCrewAvailabilityResponses")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(DIGEST_SCAN_CAP);
  const respondedEventIds = new Set(myResponses.map((response) => response.eventId));
  const pending = matchedEvents.filter((event) => !respondedEventIds.has(event._id));
  if (pending.length === 0) return null;

  return {
    title: `Availability — ${plural(pending.length, "response")} needed`,
    totalCount: pending.length,
    items: pending
      .slice(0, DIGEST_ITEM_CAP)
      .map((event) => `${event.title} • ${formatDateTimeRange(event.startAt, event.endAt)}`),
  };
}

async function buildScheduledEventsSection(
  ctx: QueryCtx,
  userId: string,
  now: number,
): Promise<WeeklyDigestSection | null> {
  const shifts = await ctx.db
    .query("eventCrewShifts")
    .withIndex("by_userId_and_startsAt", (q) =>
      q.eq("userId", userId).gte("startsAt", now).lte("startsAt", now + DIGEST_SCHEDULED_WINDOW_MS),
    )
    .take(DIGEST_SCAN_CAP);

  const byEvent = new Map<
    Doc<"eventCrewShifts">["eventId"],
    { earliestStart: number; latestEnd: number }
  >();
  for (const shift of shifts) {
    const existing = byEvent.get(shift.eventId);
    if (!existing) {
      byEvent.set(shift.eventId, { earliestStart: shift.startsAt, latestEnd: shift.endsAt });
      continue;
    }
    existing.earliestStart = Math.min(existing.earliestStart, shift.startsAt);
    existing.latestEnd = Math.max(existing.latestEnd, shift.endsAt);
  }
  if (byEvent.size === 0) return null;

  const items: string[] = [];
  for (const [eventId, window] of byEvent) {
    const event = await ctx.db.get(eventId);
    if (!event || normalizeEventStatus(event.status) === "cancelled") continue;
    items.push(`${event.title} • ${formatDateTimeRange(window.earliestStart, window.latestEnd)}`);
  }
  if (items.length === 0) return null;

  return {
    title: `Your events this week — ${plural(items.length, "event")}`,
    totalCount: items.length,
    items: items.slice(0, DIGEST_ITEM_CAP),
  };
}

async function buildTimecardsSection(
  ctx: QueryCtx,
  userId: string,
  now: number,
): Promise<WeeklyDigestSection | null> {
  const periods = await buildUserTimecards(ctx, userId, now, 3);
  const due = periods.filter((period) => period.daysWorked > 0 && period.status !== "open");
  if (due.length === 0) return null;

  return {
    title: `Timecards — ${plural(due.length, "period")} to submit`,
    totalCount: due.length,
    items: due.map(
      (period) => `${period.label} • ${plural(period.daysWorked, "day")} worked · due ${formatDate(period.dueMs)}`,
    ),
  };
}

async function buildPhotosSection(
  ctx: QueryCtx,
  userId: string,
  now: number,
): Promise<WeeklyDigestSection | null> {
  // Crew shifts and lead/manager assignments both owe photos after an event.
  const pending = await listMyEventsNeedingPhotos(ctx, userId, now);
  if (pending.length === 0) return null;

  return {
    title: `Photos — ${plural(pending.length, "event")} awaiting media`,
    totalCount: pending.length,
    items: pending
      .slice(0, DIGEST_ITEM_CAP)
      .map((event) => `${event.title} • ${formatDate(event.endAt)}`),
  };
}

async function buildPostMortemsSection(
  ctx: QueryCtx,
  userId: string,
  now: number,
): Promise<WeeklyDigestSection | null> {
  const pending = (await listMyPostMortems(ctx, userId, now)).filter(
    (row) => !row.submitted,
  );
  if (pending.length === 0) return null;

  return {
    title: `Post-mortems — ${plural(pending.length, "review")} needed`,
    totalCount: pending.length,
    items: pending
      .slice(0, DIGEST_ITEM_CAP)
      .map((row) => `${row.title} • ${formatDate(row.endAt)}`),
  };
}

/**
 * Admin view of every post-mortem we asked for but never got back. Rows are
 * minted for a lead when the post-event email goes out, so an unsubmitted row
 * is exactly an outstanding review. Bounded like the Insights panel.
 */
async function buildPostMortemQueueSection(
  ctx: QueryCtx,
): Promise<WeeklyDigestSection | null> {
  const rows = await ctx.db.query("postMortemFeedback").take(DIGEST_POST_MORTEM_SCAN_CAP);
  const pending = rows.filter((row) => !row.submittedAt);
  if (pending.length === 0) return null;

  const items: string[] = [];
  for (const row of pending) {
    if (items.length >= DIGEST_ITEM_CAP) break;
    const event = await ctx.db.get(row.eventId);
    items.push(`${event?.title ?? "Event"} • awaiting review`);
  }

  return {
    title: `Post-mortem queue — ${plural(pending.length, "review")} outstanding`,
    totalCount: pending.length,
    items,
  };
}

async function buildBookingRequestsSection(
  ctx: QueryCtx,
): Promise<WeeklyDigestSection | null> {
  const recent: Array<{
    requestNumber?: string;
    label: string;
  }> = [];
  let count = 0;

  for (const status of ["submitted", "action_required", "in_review"] as const) {
    const rows = await ctx.db
      .query("eventRequests")
      .withIndex("by_status_and_submittedAt", (q) => q.eq("status", status))
      .order("desc")
      .take(DIGEST_COUNT_SCAN_CAP);
    count += rows.length;
    for (const row of rows) {
      if (recent.length >= DIGEST_ITEM_CAP) break;
      recent.push({
        requestNumber: row.requestNumber,
        label: row.eventName ?? row.organization ?? row.venueName ?? "New request",
      });
    }
  }
  if (count === 0) return null;

  return {
    title: `Booking requests — ${plural(count, "open request")}`,
    totalCount: count,
    items: recent.map(
      (row) => `${row.label} • ${row.requestNumber ?? "Awaiting review"}`,
    ),
  };
}

async function buildArtistPayoutsSection(
  ctx: QueryCtx,
): Promise<WeeklyDigestSection | null> {
  const attentionStatuses = [
    "pending_onboarding",
    "pending_payee",
    "pending_email",
    "awaiting_confirmation",
    "confirmed",
  ] as const;

  const items: string[] = [];
  let count = 0;
  for (const status of attentionStatuses) {
    const rows = await ctx.db
      .query("eventBandPayments")
      .withIndex("by_status", (q) => q.eq("status", status))
      .take(DIGEST_COUNT_SCAN_CAP);
    count += rows.length;
    for (const row of rows) {
      if (items.length >= DIGEST_ITEM_CAP) break;
      const event = await ctx.db.get(row.eventId);
      const title = event?.title ?? "Event";
      items.push(`${title} • ${bandPaymentStatusLabel(status)}`);
    }
  }
  if (count === 0) return null;

  return {
    title: `Artist payouts — ${plural(count, "payment")} in progress`,
    totalCount: count,
    items,
  };
}

/**
 * Assemble the pending-activity digest for one user. Sections only appear when
 * they have something actionable, so an empty result means "send nothing".
 */
export async function buildWeeklyDigest(
  ctx: QueryCtx,
  args: {
    userId: string;
    profile: Doc<"userAdminProfiles"> | null;
    isAdmin: boolean;
    now: number;
  },
): Promise<WeeklyDigest> {
  const flags = resolveParticipationFlags(args.profile);
  const membership = resolveProfileMembership(args.profile ?? {});
  const isCrew = isStaffMember(membership);

  const [
    availability,
    scheduled,
    timecards,
    postMortems,
    photos,
    bookingRequests,
    artistPayouts,
    postMortemQueue,
  ] = await Promise.all([
    isCrew && flags.assignableAsCrew
      ? buildAvailabilitySection(ctx, args.userId, args.profile, args.now)
      : Promise.resolve(null),
    buildScheduledEventsSection(ctx, args.userId, args.now),
    isCrew && flags.includeInTimecards
      ? buildTimecardsSection(ctx, args.userId, args.now)
      : Promise.resolve(null),
    buildPostMortemsSection(ctx, args.userId, args.now),
    buildPhotosSection(ctx, args.userId, args.now),
    args.isAdmin ? buildBookingRequestsSection(ctx) : Promise.resolve(null),
    args.isAdmin ? buildArtistPayoutsSection(ctx) : Promise.resolve(null),
    args.isAdmin ? buildPostMortemQueueSection(ctx) : Promise.resolve(null),
  ]);

  const sections = [
    availability,
    scheduled,
    timecards,
    postMortems,
    photos,
    bookingRequests,
    artistPayouts,
    postMortemQueue,
  ].filter((section): section is WeeklyDigestSection => section !== null);

  return {
    sections,
    itemCount: sections.reduce((total, section) => total + section.totalCount, 0),
  };
}
