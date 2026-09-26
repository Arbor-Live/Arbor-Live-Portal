import { formatDate, formatDateTimeRange } from "@arbor/format";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { findAuthOrganizationById } from "./auth";
import { listCrewedEventsInRange } from "./crewedEvents";
import { eventMatchesUserTeams } from "./crewTeams";
import { normalizeEventStatus } from "./eventStatus";
import { bandPaymentStatusLabel } from "./bandPayments";
import { bandOnboardingIncompleteSteps } from "./bandOnboardingSteps";
import { resolveBandName } from "./bandIdentity";
import { resolveParticipationFlags } from "./userParticipation";
import {
  getDisciplinesForEventMatching,
  isStaffMember,
  profileHasCrewSpecialty,
  resolveProfileMembership,
} from "./userVerticals";
import { buildUserTimecards } from "./userTimecards";
import { listMyPostEventWork } from "./myEventActions";
import {
  artistDigestIncluded,
  classifyDigestOrganization,
  resolveWeeklyDigestAudience,
  type DigestOrganization,
  type WeeklyDigestAudience,
} from "./weeklyDigestAudience";

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
/**
 * Orgs one person belongs to. Arbor plus a handful of bands is the real case;
 * 20 is past that. Hitting it means classification may be incomplete.
 */
const DIGEST_MEMBERSHIP_CAP = 20;
/**
 * Events whose start falls in the digest week, plus a lookback for shows
 * already underway. A campus week is a handful of events; 200 is the ceiling
 * where we warn instead of silently dropping the rest.
 */
const DIGEST_EVENT_WINDOW_SCAN_CAP = 200;
/** Multi-day shows can start before the Monday send and still be "this week". */
const DIGEST_IN_PROGRESS_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
/** Bands on a single event. Well past a normal bill. */
const DIGEST_EVENT_BAND_CAP = 30;

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
  if (!profileHasCrewSpecialty(profile ?? {})) return null;
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

async function loadDigestOrganizations(
  ctx: QueryCtx,
  userId: string,
): Promise<DigestOrganization[]> {
  const memberships = await ctx.db
    .query("userOrganizationMemberships")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(DIGEST_MEMBERSHIP_CAP);
  if (memberships.length === DIGEST_MEMBERSHIP_CAP) {
    console.warn(
      `weekly digest: membership scan hit ${DIGEST_MEMBERSHIP_CAP} for user ${userId}`,
    );
  }

  const organizations: DigestOrganization[] = [];
  for (const membership of memberships) {
    if (!membership.active) continue;
    const profile = await ctx.db
      .query("organizationProfiles")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", membership.organizationId))
      .unique();
    let name: string | undefined;
    let slug: string | undefined;
    if (!profile?.organizationType) {
      const org = await findAuthOrganizationById(ctx, membership.organizationId);
      name = org?.name ?? undefined;
      slug = org?.slug ?? undefined;
    }
    const kind = classifyDigestOrganization({
      organizationType: profile?.organizationType,
      name,
      slug,
    });
    if (kind === "unknown") continue;
    organizations.push({
      organizationId: membership.organizationId,
      kind,
      includeInArtistDigest:
        kind === "artist" && artistDigestIncluded(profile?.status),
    });
  }
  return organizations;
}

async function buildArtistShowsSection(
  ctx: QueryCtx,
  organizationIds: readonly string[],
  now: number,
): Promise<WeeklyDigestSection | null> {
  if (organizationIds.length === 0) return null;
  const orgIds = new Set(organizationIds);
  const windowEnd = now + DIGEST_SCHEDULED_WINDOW_MS;
  const lookbackStart = now - DIGEST_IN_PROGRESS_LOOKBACK_MS;

  const [starting, alreadyStarted] = await Promise.all([
    ctx.db
      .query("events")
      .withIndex("by_startAt", (q) => q.gte("startAt", now).lte("startAt", windowEnd))
      .take(DIGEST_EVENT_WINDOW_SCAN_CAP),
    ctx.db
      .query("events")
      .withIndex("by_startAt", (q) => q.gte("startAt", lookbackStart).lt("startAt", now))
      .take(DIGEST_EVENT_WINDOW_SCAN_CAP),
  ]);
  if (
    starting.length === DIGEST_EVENT_WINDOW_SCAN_CAP ||
    alreadyStarted.length === DIGEST_EVENT_WINDOW_SCAN_CAP
  ) {
    console.warn(
      `weekly digest: event window scan hit ${DIGEST_EVENT_WINDOW_SCAN_CAP} ` +
        `(starting ${starting.length}, already started ${alreadyStarted.length})`,
    );
  }

  const candidates = new Map<Doc<"events">["_id"], Doc<"events">>();
  for (const event of starting) candidates.set(event._id, event);
  for (const event of alreadyStarted) {
    if (event.endAt >= now) candidates.set(event._id, event);
  }

  const shows: Array<{ event: Doc<"events">; bandName: string }> = [];
  for (const event of candidates.values()) {
    if (normalizeEventStatus(event.status) === "cancelled") continue;
    const participations = await ctx.db
      .query("eventBandParticipations")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .take(DIGEST_EVENT_BAND_CAP);
    const match = participations.find((row) => orgIds.has(row.organizationId));
    if (!match) continue;
    shows.push({
      event,
      bandName: await resolveBandName(ctx, match.organizationId),
    });
  }
  if (shows.length === 0) return null;

  shows.sort((a, b) => a.event.startAt - b.event.startAt);
  return {
    title: `Your shows this week — ${plural(shows.length, "event")}`,
    totalCount: shows.length,
    items: shows.slice(0, DIGEST_ITEM_CAP).map((show) => {
      const when = formatDateTimeRange(show.event.startAt, show.event.endAt);
      const detail = organizationIds.length > 1 ? `${show.bandName} · ${when}` : when;
      return `${show.event.title} • ${detail}`;
    }),
  };
}

async function buildArtistOnboardingSection(
  ctx: QueryCtx,
  organizationIds: readonly string[],
): Promise<WeeklyDigestSection | null> {
  if (organizationIds.length === 0) return null;

  const pending: Array<{ name: string; detail: string }> = [];
  for (const organizationId of organizationIds) {
    const row = await ctx.db
      .query("organizationOnboarding")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .unique();
    const steps = bandOnboardingIncompleteSteps(row);
    if (steps.length === 0) continue;
    const labels = steps.slice(0, 3).map((step) => step.label);
    const extra = steps.length > 3 ? ` + ${steps.length - 3} more` : "";
    pending.push({
      name: await resolveBandName(ctx, organizationId),
      detail: `${labels.join(", ")}${extra}`,
    });
  }
  if (pending.length === 0) return null;

  return {
    title: `Onboarding — ${plural(pending.length, "band")} to finish`,
    totalCount: pending.length,
    items: pending
      .slice(0, DIGEST_ITEM_CAP)
      .map((row) => `${row.name} • ${row.detail}`),
  };
}

async function buildPostEventWorkSection(
  ctx: QueryCtx,
  userId: string,
  now: number,
): Promise<WeeklyDigestSection | null> {
  // Crew shifts and lead/manager assignments both owe a review + photos.
  const items = await listMyPostEventWork(ctx, userId, now);
  const pending = items.filter((item) => !item.feedbackSubmitted || !item.mediaResolved);
  if (pending.length === 0) return null;

  return {
    title: `Post-event work — ${plural(pending.length, "event")} to finish`,
    totalCount: pending.length,
    items: pending
      .slice(0, DIGEST_ITEM_CAP)
      .map((item) => {
        const missing = [
          item.feedbackSubmitted ? null : "review",
          item.mediaResolved ? null : "photos",
        ].filter(Boolean);
        return `${item.title} • ${formatDate(item.endAt)} · ${missing.join(" + ")}`;
      }),
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
 *
 * Arbor staff get crew sections (and portal admins get booking and payout queues).
 * Outstanding reviews for other people stay off this email — the digest only
 * lists a review when the recipient still owes it on an event they worked.
 * Artist-only members get a show this week and unfinished onboarding — not
 * crew post-event work or the admin queues. Band org admins are Better Auth
 * `role: "admin"`, which is not a portal admin.
 */
export async function buildWeeklyDigest(
  ctx: QueryCtx,
  args: {
    userId: string;
    profile: Doc<"userAdminProfiles"> | null;
    authRole: string | null | undefined;
    now: number;
  },
): Promise<WeeklyDigest> {
  const flags = resolveParticipationFlags(args.profile);
  const membership = resolveProfileMembership(args.profile ?? {});
  const isCrew = isStaffMember(membership);
  const organizations = await loadDigestOrganizations(ctx, args.userId);
  const audience: WeeklyDigestAudience = resolveWeeklyDigestAudience({
    authRole: args.authRole,
    organizations,
    isStaff: isCrew,
  });

  const [
    availability,
    scheduled,
    artistShows,
    timecards,
    postEventWork,
    artistOnboarding,
    bookingRequests,
    artistPayouts,
  ] = await Promise.all([
    audience.staffSections && isCrew && flags.assignableAsCrew
      ? buildAvailabilitySection(ctx, args.userId, args.profile, args.now)
      : Promise.resolve(null),
    audience.staffSections
      ? buildScheduledEventsSection(ctx, args.userId, args.now)
      : Promise.resolve(null),
    buildArtistShowsSection(ctx, audience.artistOrganizationIds, args.now),
    audience.staffSections && isCrew && flags.includeInTimecards
      ? buildTimecardsSection(ctx, args.userId, args.now)
      : Promise.resolve(null),
    audience.staffSections
      ? buildPostEventWorkSection(ctx, args.userId, args.now)
      : Promise.resolve(null),
    buildArtistOnboardingSection(ctx, audience.artistOrganizationIds),
    audience.adminQueues ? buildBookingRequestsSection(ctx) : Promise.resolve(null),
    audience.adminQueues ? buildArtistPayoutsSection(ctx) : Promise.resolve(null),
  ]);

  const sections = [
    availability,
    scheduled,
    artistShows,
    timecards,
    postEventWork,
    artistOnboarding,
    bookingRequests,
    artistPayouts,
  ].filter((section): section is WeeklyDigestSection => section !== null);

  return {
    sections,
    itemCount: sections.reduce((total, section) => total + section.totalCount, 0),
  };
}
