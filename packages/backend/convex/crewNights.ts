import { addDaysToDateKey } from "@arbor/format";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { getUserId, requireArborInternalContext, requireAuth } from "./lib/auth";
import { appError, withReportableErrors } from "./lib/errors";
import { crewSections } from "./lib/crewAvailability";
import { isCrewedEventInRange } from "./lib/crewedEvents";
import { DEFAULT_AVAILABILITY_WEEKS, eventMatchesUserTeams } from "./lib/crewTeams";
import { loadMyEventNights, loadMyNightRows, weeksToMs } from "./lib/crewNightInbox";
import {
  ASKED_WEEKDAYS,
  earlySetupWindows,
  eventCrewSpan,
  isEarlySetupSection,
  isNightKey,
  mergeWindows,
  nightBounds,
  nightKeyForStart,
  nightSpan,
  weekdayOfNightKey,
  windowsCover,
  type UsualEvenings,
} from "./lib/crewNights";
import {
  nightSourceValue,
  nightStatusValue,
  timeWindowValue,
  usualEveningsValue,
  usualLevelValue,
} from "./lib/crewNightValues";
import { resolveUserStatus } from "./lib/userStatus";
import {
  getDisciplinesForEventMatching,
  profileHasCrewSpecialty,
  resolveProfileMembership,
} from "./lib/userVerticals";
import { normalizeEventStatus } from "./lib/eventStatus";

/**
 * Crew availability by night (My Availability). Each person answers once per
 * night that has crewed events for them; the answer is time on the person,
 * so every event that night (and any added later) reads it. Staff read it
 * through `eventCrewAvailability.ts`.
 *
 * Every function here acts on the signed-in person only: no `userId` args.
 */

/** Windows on one answer. "Only part" is a few ranges or sections, never dozens. */
const MAX_WINDOWS = 12;
/** Events on one night. A busy campus night is a handful. */
const NIGHT_EVENT_TAKE = 50;
/** "Dates I'm away" covers at most this many nights per save. */
const MAX_AWAY_NIGHTS = 62;
const NOTES_MAX = 500;

type Profile = Doc<"userAdminProfiles">;

async function getProfile(ctx: QueryCtx | MutationCtx, userId: string) {
  return await ctx.db
    .query("userAdminProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

function isAvailabilityCrew(profile: Profile | null): profile is Profile {
  return Boolean(profile) && resolveUserStatus(profile) === "active" && profileHasCrewSpecialty(profile ?? {});
}

/** The signed-in crew member, or an error saying why they can't answer. */
async function requireCrewMember(ctx: MutationCtx) {
  const user = await requireAuth(ctx);
  await requireArborInternalContext(ctx);
  const userId = getUserId(user);
  const profile = await getProfile(ctx, userId);
  if (resolveUserStatus(profile) !== "active") {
    appError("AVAILABILITY_ACCOUNT_INACTIVE", "Reactivate your account before answering availability.");
  }
  if (!profile || !profileHasCrewSpecialty(profile)) {
    appError("AVAILABILITY_CREW_ONLY", "Availability is limited to crew specialties.");
  }
  return { userId, profile, email: user.email ?? undefined };
}

function profileDisciplines(profile: Profile) {
  return getDisciplinesForEventMatching(resolveProfileMembership(profile).disciplines);
}

/** Crewed, live events on one night that match this person's teams, with their blocks. */
async function loadNightEventsFor(ctx: QueryCtx | MutationCtx, profile: Profile, nightKey: string) {
  const bounds = nightBounds(nightKey);
  const disciplines = profileDisciplines(profile);
  const events = (
    await ctx.db
      .query("events")
      .withIndex("by_startAt", (q) => q.gte("startAt", bounds.startsAt).lt("startAt", bounds.endsAt))
      .take(NIGHT_EVENT_TAKE)
  ).filter(
    (event) =>
      isCrewedEventInRange(event, bounds.startsAt, bounds.endsAt) &&
      eventMatchesUserTeams(event.teamsInterested, disciplines),
  );
  return await Promise.all(
    events.map(async (event) => ({
      event,
      blocks: await ctx.db
        .query("eventScheduleBlocks")
        .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", event._id))
        .take(200),
    })),
  );
}

/** The application's Fri/Sat standing availability, as a starting point for the usual evenings. */
async function suggestedUsualEvenings(ctx: QueryCtx, email: string | undefined): Promise<UsualEvenings> {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return {};
  const applications = await ctx.db
    .query("crewApplications")
    .withIndex("by_email", (q) => q.eq("email", normalized))
    .take(10);
  const latest = applications
    .filter((application) => application.crewAvailabilityDays?.length)
    .sort((a, b) => b.submittedAt - a.submittedAt)[0];
  const suggested: UsualEvenings = {};
  for (const day of latest?.crewAvailabilityDays ?? []) suggested[day] = "usually";
  return suggested;
}

function todayNightKey() {
  return nightKeyForStart(Date.now());
}

// ---------------------------------------------------------------------------
// Usual evenings
// ---------------------------------------------------------------------------

export const getMyUsualEvenings = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      usualEvenings: usualEveningsValue,
      setAt: v.optional(v.number()),
      /** Pre-selection when nothing is set yet (from the crew application). */
      suggested: usualEveningsValue,
    }),
  ),
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const profile = await getProfile(ctx, getUserId(user));
    if (!isAvailabilityCrew(profile)) return null;
    return {
      usualEvenings: profile.usualEvenings ?? {},
      setAt: profile.usualEveningsSetAt,
      suggested: profile.usualEveningsSetAt ? {} : await suggestedUsualEvenings(ctx, user.email ?? undefined),
    };
  },
});

export const setMyUsualEvenings = mutation({
  args: { usualEvenings: usualEveningsValue },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireCrewMember(ctx);
    const missing = ASKED_WEEKDAYS.filter((day) => !args.usualEvenings[day]);
    if (missing.length > 0) {
      appError("USUAL_EVENINGS_INCOMPLETE", "Pick an answer for Thursday, Friday and Saturday.");
    }
    const now = Date.now();
    await ctx.db.patch(profile._id, {
      usualEvenings: args.usualEvenings,
      usualEveningsSetAt: now,
      updatedAt: now,
    });
    return null;
  },
});

// ---------------------------------------------------------------------------
// My nights
// ---------------------------------------------------------------------------

const nightSectionValue = v.object({
  _id: v.id("eventScheduleBlocks"),
  blockType: v.string(),
  label: v.string(),
  startsAt: v.number(),
  endsAt: v.number(),
  earlySetup: v.boolean(),
});

const nightEventValue = v.object({
  _id: v.id("events"),
  title: v.string(),
  status: v.string(),
  venueName: v.optional(v.string()),
  startAt: v.number(),
  endAt: v.number(),
  /** Earliest crew call to the last section or the event's end. */
  crewStartsAt: v.number(),
  crewEndsAt: v.number(),
  sections: v.array(nightSectionValue),
  /** Shifts this person already has on the event. */
  myShiftCount: v.number(),
});

const nightValue = v.object({
  nightKey: v.string(),
  weekday: v.string(),
  /** The night's span: earliest crew call to the last event's end. */
  startsAt: v.number(),
  endsAt: v.number(),
  usual: v.union(usualLevelValue, v.null()),
  /** Early setup windows across the night's events (empty when none). */
  earlySetup: v.array(timeWindowValue),
  events: v.array(nightEventValue),
  answer: v.union(
    v.null(),
    v.object({
      status: nightStatusValue,
      windows: v.array(timeWindowValue),
      earlySetupOnly: v.boolean(),
      notes: v.optional(v.string()),
      source: v.optional(nightSourceValue),
      respondedAt: v.number(),
      /** False when "I'm free" was saved before the night grew (an earlier call, a later end). */
      coversNight: v.boolean(),
    }),
  ),
});

/** My Availability: one entry per night with matching crewed events, soonest first. */
export const listMine = query({
  args: { now: v.number(), weeksAhead: v.optional(v.number()) },
  returns: v.array(nightValue),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const userId = getUserId(user);
    const profile = await getProfile(ctx, userId);
    if (!isAvailabilityCrew(profile)) return [];

    const windowEnd = args.now + weeksToMs(args.weeksAhead ?? DEFAULT_AVAILABILITY_WEEKS);
    const nights = await loadMyEventNights(ctx, profile, args.now, windowEnd);
    if (nights.length === 0) return [];

    const firstKey = nights[0]!.nightKey;
    const lastKey = nights[nights.length - 1]!.nightKey;
    const [rows, myShifts] = await Promise.all([
      loadMyNightRows(ctx, userId, firstKey, lastKey),
      ctx.db
        .query("eventCrewShifts")
        .withIndex("by_userId_and_startsAt", (q) =>
          q
            .eq("userId", userId)
            .gte("startsAt", nightBounds(firstKey).startsAt - 24 * 60 * 60 * 1000)
            .lte("startsAt", nightBounds(lastKey).endsAt),
        )
        .take(200),
    ]);
    const rowByKey = new Map(rows.map((row) => [row.nightKey, row]));
    const shiftCountByEvent = new Map<string, number>();
    for (const shift of myShifts) {
      shiftCountByEvent.set(shift.eventId, (shiftCountByEvent.get(shift.eventId) ?? 0) + 1);
    }

    return await Promise.all(
      nights.map(async ({ nightKey, events }) => {
        const withBlocks = await Promise.all(
          events.map(async (event) => ({
            event,
            blocks: await ctx.db
              .query("eventScheduleBlocks")
              .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", event._id))
              .take(200),
          })),
        );
        const spans = withBlocks.map(({ event, blocks }) => eventCrewSpan(event, blocks));
        const span = nightSpan(spans)!;
        const weekday = weekdayOfNightKey(nightKey);
        const row = rowByKey.get(nightKey);
        return {
          nightKey,
          weekday,
          startsAt: span.startsAt,
          endsAt: span.endsAt,
          usual: profile.usualEvenings?.[weekday] ?? null,
          earlySetup: earlySetupWindows(withBlocks.flatMap(({ blocks }) => blocks)),
          events: withBlocks.map(({ event, blocks }, index) => ({
            _id: event._id,
            title: event.title,
            status: normalizeEventStatus(event.status),
            venueName: event.venueName,
            startAt: event.startAt,
            endAt: event.endAt,
            crewStartsAt: spans[index]!.startsAt,
            crewEndsAt: spans[index]!.endsAt,
            sections: crewSections(blocks).map((block) => ({
              _id: block._id,
              blockType: block.blockType,
              label: block.label,
              startsAt: block.startsAt,
              endsAt: block.endsAt,
              earlySetup: isEarlySetupSection(block),
            })),
            myShiftCount: shiftCountByEvent.get(event._id) ?? 0,
          })),
          answer: row
            ? {
                status: row.status,
                windows: row.windows,
                earlySetupOnly: row.earlySetupOnly ?? false,
                notes: row.notes,
                source: row.source,
                respondedAt: row.respondedAt,
                coversNight:
                  row.status !== "free" || row.windows.length === 0 || windowsCover(row.windows, span),
              }
            : null,
        };
      }),
    );
  },
});

async function upsertNight(
  ctx: MutationCtx,
  userId: string,
  nightKey: string,
  fields: {
    status: Doc<"crewAvailabilityNights">["status"];
    windows: Array<{ startsAt: number; endsAt: number }>;
    earlySetupOnly?: boolean;
    notes?: string;
    source: Doc<"crewAvailabilityNights">["source"];
  },
  now: number,
) {
  const existing = await ctx.db
    .query("crewAvailabilityNights")
    .withIndex("by_userId_and_nightKey", (q) => q.eq("userId", userId).eq("nightKey", nightKey))
    .unique();
  const payload = {
    userId,
    nightKey,
    status: fields.status,
    windows: fields.windows,
    ...(fields.earlySetupOnly ? { earlySetupOnly: true } : {}),
    ...(fields.notes ? { notes: fields.notes } : {}),
    source: fields.source,
    respondedAt: now,
    updatedAt: now,
  };
  if (existing) {
    // Replace, not patch: a new answer drops the old windows and flags.
    await ctx.db.replace(existing._id, { ...payload, createdAt: existing.createdAt });
    return existing._id;
  }
  return await ctx.db.insert("crewAvailabilityNights", { ...payload, createdAt: now });
}

function cleanNotes(notes: string | undefined) {
  const trimmed = notes?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > NOTES_MAX) appError("AVAILABILITY_NOTES_TOO_LONG", "Keep the note under 500 characters.");
  return trimmed;
}

function assertNightKey(nightKey: string) {
  if (!isNightKey(nightKey)) appError("AVAILABILITY_NIGHT_INVALID", "That night isn't a valid date.");
  if (nightKey < todayNightKey()) appError("AVAILABILITY_NIGHT_PAST", "That night has already passed.");
}

/**
 * Answer one night: "I'm free" (the whole night), "Only part" (free windows),
 * "Early setup only", "Backup", or "Not this one". Replaces any earlier answer.
 */
export const answerNight = mutation({
  args: {
    nightKey: v.string(),
    status: nightStatusValue,
    /** `partial` only: the times you're free. */
    windows: v.optional(v.array(timeWindowValue)),
    /** `partial` only: free just for the night's early setup. */
    earlySetupOnly: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  },
  returns: v.id("crewAvailabilityNights"),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireCrewMember(ctx);
    return await withReportableErrors("crewNights.answerNight", async () => {
      assertNightKey(args.nightKey);
      const notes = cleanNotes(args.notes);
      if (args.earlySetupOnly && args.status !== "partial") {
        appError("AVAILABILITY_EARLY_SETUP_STATUS", "Early setup only is a partial answer.");
      }
      if (args.status !== "partial" && args.windows?.length) {
        appError("AVAILABILITY_WINDOWS_WITH_FULL", "Times only apply when you can do part of the night.");
      }

      const nightEvents = await loadNightEventsFor(ctx, profile, args.nightKey);
      let windows: Array<{ startsAt: number; endsAt: number }> = [];
      if (args.status === "free") {
        const span = nightSpan(nightEvents.map(({ event, blocks }) => eventCrewSpan(event, blocks)));
        if (!span) appError("AVAILABILITY_NIGHT_EMPTY", "There are no events for you that night anymore.");
        windows = [span];
      } else if (args.status === "partial" && args.earlySetupOnly) {
        windows = earlySetupWindows(nightEvents.flatMap(({ blocks }) => blocks));
        if (windows.length === 0) {
          appError("AVAILABILITY_NO_EARLY_SETUP", "No event that night has an early setup anymore.");
        }
      } else if (args.status === "partial") {
        const given = args.windows ?? [];
        if (given.length === 0) appError("AVAILABILITY_PARTIAL_NEEDS_TIME", "Pick the part of the night you can do.");
        if (given.length > MAX_WINDOWS) appError("AVAILABILITY_TOO_MANY_WINDOWS", "That's too many time ranges.");
        const bounds = nightBounds(args.nightKey);
        const dayMs = 24 * 60 * 60 * 1000;
        for (const window of given) {
          if (window.endsAt <= window.startsAt) {
            appError("AVAILABILITY_WINDOW_ORDER", "Each time range must end after it starts.");
          }
          // A night's crew call can start the day before (a load-in) but not further out.
          if (window.startsAt < bounds.startsAt - dayMs || window.endsAt > bounds.endsAt + dayMs) {
            appError("AVAILABILITY_WINDOW_OUTSIDE_NIGHT", "That time isn't on this night.");
          }
        }
        windows = mergeWindows(given);
      }

      return await upsertNight(
        ctx,
        userId,
        args.nightKey,
        { status: args.status, windows, earlySetupOnly: args.earlySetupOnly, notes, source: "answer" },
        Date.now(),
      );
    });
  },
});

/** "Dates I'm away": every night in the range becomes "Not this one". */
export const markAway = mutation({
  args: { fromNightKey: v.string(), toNightKey: v.string(), notes: v.optional(v.string()) },
  returns: v.number(),
  handler: async (ctx, args) => {
    const { userId } = await requireCrewMember(ctx);
    if (!isNightKey(args.fromNightKey) || !isNightKey(args.toNightKey)) {
      appError("AVAILABILITY_NIGHT_INVALID", "Pick a start and end date.");
    }
    if (args.toNightKey < args.fromNightKey) {
      appError("AVAILABILITY_AWAY_ORDER", "The last day must be on or after the first.");
    }
    const today = todayNightKey();
    if (args.toNightKey < today) appError("AVAILABILITY_NIGHT_PAST", "Those dates have already passed.");
    const notes = cleanNotes(args.notes) ?? "Away";
    const now = Date.now();
    let key = args.fromNightKey < today ? today : args.fromNightKey;
    // Refuse a too-long range before writing any night.
    let probe = key;
    for (let nights = 0; probe <= args.toNightKey; nights += 1) {
      if (nights >= MAX_AWAY_NIGHTS) {
        appError("AVAILABILITY_AWAY_TOO_LONG", `Mark at most ${MAX_AWAY_NIGHTS} days at a time.`);
      }
      probe = addDaysToDateKey(probe, 1);
    }
    let count = 0;
    while (key <= args.toNightKey) {
      await upsertNight(ctx, userId, key, { status: "no", windows: [], notes, source: "away" }, now);
      count += 1;
      key = addDaysToDateKey(key, 1);
    }
    return count;
  },
});
