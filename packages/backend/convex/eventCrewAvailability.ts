import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  findAuthUsersByIds,
  getUserId,
  requireArborInternalContext,
  requireAuth,
  type AuthUser,
} from "./lib/auth";
import { appError, withReportableErrors } from "./lib/errors";
import {
  eligibleCrewProfilesForEvent,
  getActiveCrewProfiles,
  listCrewedEventsInRange,
} from "./lib/crewedEvents";
import { eventMatchesUserTeams, isCrewedEventType } from "./lib/crewTeams";
import { normalizeEventStatus } from "./lib/eventStatus";
import {
  getDisciplinesForEventMatching,
  profileHasCrewSpecialty,
  resolveProfileMembership,
} from "./lib/userVerticals";
import { resolveUserStatus } from "./lib/userStatus";
import { buildUserProfileImageByUserId } from "./lib/userProfileImage";
import { loadEventHostDisplay } from "./lib/hostOrgs";
import { crewSections } from "./lib/crewAvailability";
import { backupUserIdsFrom } from "./lib/crewBackups";
import {
  deriveEventResponses,
  loadEventNightResponses,
  loadNightRows,
  loadNightRowsByKey,
  loadProfilesForRows,
  type EventNightResponse,
} from "./lib/crewNightAnswers";
import { eventCrewSpan, legacyResponseToNight, nightKeyForEvent } from "./lib/crewNights";
import { computeShiftStats, isTraineeShift } from "./lib/crewShiftKinds";
import { computeEventShiftStats, loadCartRequirement } from "./lib/cartCrew";
import { CART_GROUPS } from "@arbor/format";

/**
 * Staff-facing availability per event. Crew answer per *night*
 * (`crewNights.ts`, `crewAvailabilityNights`); these queries read the nights
 * that overlap each event and return them in the old per-event shape
 * (`lib/crewNightAnswers.ts`), so the staffing board, Fill open slots, and the
 * crew scheduling board work unchanged.
 */

const crewAvailabilityResponseStatusValue = v.union(
  v.literal("yes"),
  v.literal("partial"),
  v.literal("only_if_necessary"),
  v.literal("no"),
);

const partialWindowValue = v.object({
  scheduleBlockId: v.optional(v.id("eventScheduleBlocks")),
  startsAt: v.number(),
  endsAt: v.number(),
  notes: v.optional(v.string()),
});

const busyWindowValue = v.object({
  startsAt: v.number(),
  endsAt: v.number(),
  notes: v.optional(v.string()),
});

const userSummaryValue = v.object({
  userId: v.string(),
  name: v.string(),
  email: v.string(),
  image: v.optional(v.string()),
  /** `userAdminProfiles.cartEligible`, when the profile was already loaded. */
  cartEligible: v.optional(v.boolean()),
});

const responsePersonValue = v.object({
  userId: v.string(),
  name: v.string(),
  email: v.string(),
  image: v.optional(v.string()),
  cartEligible: v.optional(v.boolean()),
  responseStatus: crewAvailabilityResponseStatusValue,
  partialWindows: v.optional(v.array(partialWindowValue)),
  busyWindows: v.optional(v.array(busyWindowValue)),
  notes: v.optional(v.string()),
  respondedAt: v.number(),
  scheduleChanged: v.boolean(),
});

const sectionStaffingValue = v.object({
  _id: v.id("eventScheduleBlocks"),
  blockType: v.string(),
  label: v.string(),
  startsAt: v.number(),
  endsAt: v.number(),
  /** Staffing slots on the section (trainees excluded). */
  slots: v.number(),
  filled: v.number(),
  /** Filled slots held by a backup ("only if necessary"). */
  backup: v.number(),
});

type AuthUserRecord = AuthUser;

type PartialWindow = {
  scheduleBlockId?: Id<"eventScheduleBlocks">;
  startsAt: number;
  endsAt: number;
  notes?: string;
};

function sectionStaffing(
  blocks: Doc<"eventScheduleBlocks">[],
  shifts: Doc<"eventCrewShifts">[],
  backupUserIds: ReadonlySet<string>,
) {
  return crewSections(blocks).map((block) => {
    const stats = computeShiftStats(
      shifts.filter((shift) => shift.scheduleBlockId === block._id),
      backupUserIds,
    );
    return {
      _id: block._id,
      blockType: block.blockType,
      label: block.label,
      startsAt: block.startsAt,
      endsAt: block.endsAt,
      slots: stats.totalShifts,
      filled: stats.filledShifts,
      backup: stats.backupShifts,
    };
  });
}

function toUserSummary(
  userId: string,
  userByKey: Map<string, AuthUserRecord>,
  imageByUserId?: Map<string, string | undefined>,
  profiles?: ReadonlyMap<string, { cartEligible?: boolean }>,
) {
  const user = userByKey.get(userId);
  const profile = profiles?.get(userId);
  return {
    userId,
    name: user?.name ?? user?.email ?? userId,
    email: user?.email ?? "",
    image: imageByUserId?.get(userId) ?? user?.image ?? undefined,
    cartEligible: profile ? profile.cartEligible === true : undefined,
  };
}

function aggregateResponses(responses: Array<Pick<EventNightResponse, "responseStatus">>) {
  const counts = {
    yes: 0,
    partial: 0,
    onlyIfNecessary: 0,
    no: 0,
    responded: responses.length,
  };
  for (const response of responses) {
    if (response.responseStatus === "yes") counts.yes += 1;
    else if (response.responseStatus === "partial") counts.partial += 1;
    else if (response.responseStatus === "only_if_necessary") counts.onlyIfNecessary += 1;
    else if (response.responseStatus === "no") counts.no += 1;
  }
  return counts;
}

/**
 * A night answer in the old per-event shape. It is time, not an event, so it
 * never goes stale when the event's schedule changes: `scheduleChanged` stays
 * false (kept in the shape for the board).
 */
function toResponsePerson(
  response: EventNightResponse,
  userByKey: Map<string, AuthUserRecord>,
  imageByUserId: Map<string, string | undefined>,
  profiles?: ReadonlyMap<string, { cartEligible?: boolean }>,
) {
  return {
    ...toUserSummary(response.userId, userByKey, imageByUserId, profiles),
    responseStatus: response.responseStatus,
    // Section ids come straight from this event's blocks.
    partialWindows: response.partialWindows as PartialWindow[] | undefined,
    // Busy times are already cut out of a night's free windows.
    busyWindows: undefined as Array<{ startsAt: number; endsAt: number; notes?: string }> | undefined,
    notes: response.notes,
    respondedAt: response.respondedAt,
    scheduleChanged: false,
  };
}

async function getCurrentUserProfile(ctx: QueryCtx, userId: string) {
  return await ctx.db
    .query("userAdminProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

export const listForAdminOverview = query({
  args: {
    rangeStart: v.number(),
    rangeEnd: v.number(),
    unconfirmedOnly: v.optional(v.boolean()),
  },
  returns: v.array(
    v.object({
      _id: v.id("events"),
      title: v.string(),
      status: v.string(),
      eventType: v.optional(v.string()),
      venueName: v.optional(v.string()),
      host: v.optional(v.string()),
      teamsInterested: v.optional(v.array(v.string())),
      startAt: v.number(),
      endAt: v.number(),
      totalShifts: v.number(),
      filledShifts: v.number(),
      unfilledShifts: v.number(),
      backupShifts: v.number(),
      /** Cart event (`events.needsCart`): setup and strike each need someone cart eligible. */
      needsCart: v.boolean(),
      cartRequirementMet: v.boolean(),
      /** Groups on a cart event with no one cart eligible yet. */
      cartUnmetGroups: v.array(v.union(v.literal("setup"), v.literal("strike"))),
      isCrewConfirmed: v.boolean(),
      responseCounts: v.object({
        yes: v.number(),
        partial: v.number(),
        onlyIfNecessary: v.number(),
        no: v.number(),
        responded: v.number(),
        pending: v.number(),
        eligibleCrew: v.number(),
      }),
      sections: v.array(sectionStaffingValue),
      traineeCount: v.number(),
      responders: v.array(responsePersonValue),
      assignedCrew: v.array(userSummaryValue),
      pendingCrew: v.array(userSummaryValue),
    }),
  ),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);

    const unconfirmedOnly = args.unconfirmedOnly ?? true;
    if (args.rangeEnd < args.rangeStart) {
      throw new Error("Date range end must be on or after the start.");
    }

    const upcomingCrewed = await listCrewedEventsInRange(ctx, args.rangeStart, args.rangeEnd);
    const crewProfiles = await getActiveCrewProfiles(ctx);
    // One indexed read per night, shared by every event that night.
    const nightRowsByKey = await loadNightRowsByKey(ctx, upcomingCrewed.map(nightKeyForEvent));
    const profiles = await loadProfilesForRows(
      ctx,
      [...nightRowsByKey.values()].flat(),
      new Map(crewProfiles.map((profile) => [profile.userId, profile])),
    );

    const bundles = await Promise.all(
      upcomingCrewed.map(async (event) => {
        const [blocks, shifts] = await Promise.all([
          ctx.db
            .query("eventScheduleBlocks")
            .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", event._id))
            .take(200),
          ctx.db
            .query("eventCrewShifts")
            .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
            .take(500),
        ]);
        const responses = deriveEventResponses(
          event,
          blocks,
          nightRowsByKey.get(nightKeyForEvent(event)) ?? [],
          profiles,
        );
        const eligibleProfiles = eligibleCrewProfilesForEvent(event.teamsInterested, crewProfiles);
        return { event, blocks, shifts, responses, eligibleProfiles };
      }),
    );

    const allUserIds = Array.from(
      new Set(
        bundles
          .flatMap(({ shifts, responses, eligibleProfiles }) => [
            ...shifts.map((shift) => shift.userId?.trim()).filter(Boolean),
            ...responses.map((response) => response.userId),
            ...eligibleProfiles.map((profile) => profile.userId),
          ])
          .filter((userId): userId is string => Boolean(userId)),
      ),
    );
    const userByKey = await findAuthUsersByIds(ctx, allUserIds);
    const imageByUserId = await buildUserProfileImageByUserId(ctx, allUserIds, userByKey);

    const rows = await Promise.all(
      bundles.map(async ({ event, blocks, shifts, responses, eligibleProfiles }) => {
        const backupUserIds = backupUserIdsFrom(responses);
        // Cart events need someone cart eligible on setup and strike. Known
        // profiles cover most assignees; the rest are one indexed read each.
        const cart = await loadCartRequirement(ctx, event, { shifts, blocks, knownProfiles: profiles });
        const shiftStats = computeShiftStats(shifts, backupUserIds, { cartRequirementMet: cart.met });
        const responseCounts = aggregateResponses(responses);
        const eligibleCrew = eligibleProfiles.length;
        const respondedUserIds = new Set(responses.map((response) => response.userId));
        const pendingUserIds = Array.from(
          new Set(
            eligibleProfiles
              .map((profile) => profile.userId?.trim())
              .filter((userId): userId is string => Boolean(userId) && !respondedUserIds.has(userId)),
          ),
        );

        const assignedUserIds = Array.from(
          new Set(
            shifts
              .map((shift) => shift.userId?.trim())
              .filter((userId): userId is string => Boolean(userId)),
          ),
        );
        const hostDisplay = await loadEventHostDisplay(ctx, event);

        return {
          _id: event._id,
          title: event.title,
          status: normalizeEventStatus(event.status),
          eventType: event.eventType,
          venueName: event.venueName,
          host: hostDisplay.hostLabel,
          teamsInterested: event.teamsInterested,
          startAt: event.startAt,
          endAt: event.endAt,
          ...shiftStats,
          needsCart: cart.needsCart,
          cartUnmetGroups: CART_GROUPS.filter((group) => !cart[group].met),
          responseCounts: {
            ...responseCounts,
            pending: pendingUserIds.length,
            eligibleCrew,
          },
          sections: sectionStaffing(blocks, shifts, backupUserIds),
          traineeCount: shifts.filter(isTraineeShift).length,
          responders: responses.map((response) =>
            toResponsePerson(response, userByKey, imageByUserId, profiles),
          ),
          assignedCrew: assignedUserIds.map((userId) =>
            toUserSummary(userId, userByKey, imageByUserId, profiles),
          ),
          pendingCrew: pendingUserIds.map((userId) =>
            toUserSummary(userId, userByKey, imageByUserId, profiles),
          ),
        };
      }),
    );

    if (unconfirmedOnly) {
      return rows.filter((row) => !row.isCrewConfirmed);
    }
    return rows;
  },
});

const eventResponderValue = v.object({
  userId: v.string(),
  name: v.string(),
  email: v.string(),
  image: v.optional(v.string()),
  cartEligible: v.optional(v.boolean()),
  responseStatus: crewAvailabilityResponseStatusValue,
  partialWindows: v.optional(v.array(partialWindowValue)),
  busyWindows: v.optional(v.array(busyWindowValue)),
  notes: v.optional(v.string()),
  respondedAt: v.number(),
  scheduleChanged: v.boolean(),
  isAssigned: v.boolean(),
});

const ASSIGNMENT_PRIORITY: Record<EventNightResponse["responseStatus"], number> = {
  yes: 0,
  partial: 1,
  only_if_necessary: 2,
  no: 99,
};

/**
 * Every matching person's answer for one event, read from their night
 * (including "no", so the schedule UI can warn before someone who said no is
 * put on a shift).
 */
export const getSummaryForEvent = query({
  args: {
    eventId: v.id("events"),
  },
  returns: v.union(
    v.object({
      totalShifts: v.number(),
      filledShifts: v.number(),
      unfilledShifts: v.number(),
      backupShifts: v.number(),
      cartRequirementMet: v.boolean(),
      isCrewConfirmed: v.boolean(),
      responseCounts: v.object({
        yes: v.number(),
        partial: v.number(),
        onlyIfNecessary: v.number(),
        no: v.number(),
        responded: v.number(),
      }),
      responders: v.array(eventResponderValue),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);

    const event = await ctx.db.get(args.eventId);
    if (!event) return null;
    const [blocks, shifts] = await Promise.all([
      ctx.db
        .query("eventScheduleBlocks")
        .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", args.eventId))
        .take(200),
      ctx.db
        .query("eventCrewShifts")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .take(500),
    ]);
    const responses = await loadEventNightResponses(ctx, event, blocks);

    const shiftStats = await computeEventShiftStats(ctx, event, shifts, backupUserIdsFrom(responses), {
      blocks,
    });
    const responseCounts = aggregateResponses(responses);

    const assignedUserIds = new Set(
      shifts
        .map((shift) => shift.userId?.trim())
        .filter((userId): userId is string => Boolean(userId)),
    );

    const responderUserIds = responses.map((response) => response.userId);
    const userByKey = await findAuthUsersByIds(ctx, responderUserIds);
    const imageByUserId = await buildUserProfileImageByUserId(ctx, responderUserIds, userByKey);

    const responders = responses
      .map((response) => ({
        ...toResponsePerson(response, userByKey, imageByUserId),
        isAssigned: assignedUserIds.has(response.userId),
      }))
      .sort((a, b) => {
        const priorityDiff =
          ASSIGNMENT_PRIORITY[a.responseStatus] - ASSIGNMENT_PRIORITY[b.responseStatus];
        if (priorityDiff !== 0) return priorityDiff;
        return a.respondedAt - b.respondedAt;
      });

    return { ...shiftStats, responseCounts, responders };
  },
});

/**
 * Team-matched crew who haven't answered this event's night. Kept apart from
 * `getSummaryForEvent`: scanning every crew profile is the slow part, and the
 * schedule UI shouldn't wait on it to show responders.
 */
export const listPendingCrewForEvent = query({
  args: { eventId: v.id("events") },
  returns: v.union(
    v.object({ eligibleCrew: v.number(), pendingCrew: v.array(userSummaryValue) }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event || !isCrewedEventType(event.eventType)) return null;

    const [crewProfiles, nightRows] = await Promise.all([
      getActiveCrewProfiles(ctx),
      loadNightRows(ctx, nightKeyForEvent(event)),
    ]);
    const eligible = eligibleCrewProfilesForEvent(event.teamsInterested, crewProfiles);
    const respondedUserIds = new Set(nightRows.map((row) => row.userId));
    const pendingUserIds = Array.from(
      new Set(
        eligible
          .map((profile) => profile.userId?.trim())
          .filter((userId): userId is string => Boolean(userId) && !respondedUserIds.has(userId)),
      ),
    );
    const userByKey = await findAuthUsersByIds(ctx, pendingUserIds);
    const imageByUserId = await buildUserProfileImageByUserId(ctx, pendingUserIds, userByKey);
    return {
      eligibleCrew: eligible.length,
      pendingCrew: pendingUserIds
        .map((userId) => toUserSummary(userId, userByKey, imageByUserId))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  },
});

function assertWindowOrder(windows: Array<{ startsAt: number; endsAt: number }>, label: string) {
  for (const window of windows) {
    if (window.endsAt <= window.startsAt) {
      appError("AVAILABILITY_WINDOW_ORDER", `${label} must end after they start.`);
    }
  }
}

/**
 * The old per-event answer, kept for any caller still on it. Availability is
 * time on the person now, so this writes the event's *night* (replacing that
 * night's answer). The crew UI uses `crewNights.answerNight`.
 */
export const submitResponse = mutation({
  args: {
    eventId: v.id("events"),
    responseStatus: crewAvailabilityResponseStatusValue,
    partialWindows: v.optional(v.array(partialWindowValue)),
    busyWindows: v.optional(v.array(busyWindowValue)),
    notes: v.optional(v.string()),
  },
  returns: v.id("crewAvailabilityNights"),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    return await withReportableErrors("eventCrewAvailability.submitResponse", async () => {
      const userId = getUserId(user);

      const event = await ctx.db.get(args.eventId);
      if (!event) appError("EVENT_NOT_FOUND", "Event not found.");
      if (!isCrewedEventType(event.eventType)) {
        appError("AVAILABILITY_NOT_REQUIRED", "This event type does not require crew availability.");
      }
      if (normalizeEventStatus(event.status) === "cancelled") {
        appError("AVAILABILITY_EVENT_CANCELLED", "Cannot respond to a cancelled event.");
      }

      const profile = await getCurrentUserProfile(ctx, userId);
      if (resolveUserStatus(profile) !== "active") {
        appError(
          "AVAILABILITY_ACCOUNT_INACTIVE",
          "Reactivate your account before responding to availability.",
        );
      }
      if (!profileHasCrewSpecialty(profile ?? {})) {
        appError("AVAILABILITY_CREW_ONLY", "Availability is limited to crew specialties.");
      }
      const userDisciplines = getDisciplinesForEventMatching(
        resolveProfileMembership(profile ?? {}).disciplines,
      );
      if (!eventMatchesUserTeams(event.teamsInterested, userDisciplines)) {
        appError("AVAILABILITY_TEAM_SCOPE", "This event is not in your crew team scope.");
      }

      const blocks = await ctx.db
        .query("eventScheduleBlocks")
        .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", args.eventId))
        .take(200);
      const blockIds = new Set(blocks.map((block) => block._id));

      if (args.responseStatus === "partial") {
        const windows = args.partialWindows ?? [];
        if (windows.length === 0) {
          appError("AVAILABILITY_PARTIAL_NEEDS_SECTION", "Pick at least one section you can work.");
        }
        assertWindowOrder(windows, "Available times");
        for (const window of windows) {
          if (window.scheduleBlockId && !blockIds.has(window.scheduleBlockId)) {
            appError(
              "AVAILABILITY_SECTION_MISSING",
              "That section is no longer on this event. Reload and try again.",
            );
          }
        }
        assertWindowOrder(args.busyWindows ?? [], "Busy times");
      } else if (args.partialWindows?.length || args.busyWindows?.length) {
        appError(
          "AVAILABILITY_WINDOWS_WITH_FULL",
          "Sections and busy times only apply when you can work part of the event.",
        );
      }

      const now = Date.now();
      const night = legacyResponseToNight(
        {
          responseStatus: args.responseStatus,
          partialWindows: args.partialWindows,
          busyWindows: args.busyWindows,
          notes: args.notes,
          respondedAt: now,
        },
        eventCrewSpan(event, blocks),
      );
      const nightKey = nightKeyForEvent(event);
      const existing = await ctx.db
        .query("crewAvailabilityNights")
        .withIndex("by_userId_and_nightKey", (q) => q.eq("userId", userId).eq("nightKey", nightKey))
        .unique();
      const payload = {
        userId,
        nightKey,
        status: night.status,
        windows: night.windows,
        ...(night.notes ? { notes: night.notes } : {}),
        source: "answer" as const,
        respondedAt: now,
        updatedAt: now,
      };
      if (existing) {
        // Replace, not patch: a new answer drops the old windows and flags.
        await ctx.db.replace(existing._id, { ...payload, createdAt: existing.createdAt });
        return existing._id;
      }
      return await ctx.db.insert("crewAvailabilityNights", { ...payload, createdAt: now });
    });
  },
});
