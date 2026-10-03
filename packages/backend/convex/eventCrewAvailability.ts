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
import { listCrewedEventsInRange } from "./lib/crewedEvents";
import {
  DEFAULT_AVAILABILITY_WEEKS,
  eventMatchesUserTeams,
  isCrewedEventType,
} from "./lib/crewTeams";
import { normalizeEventStatus } from "./lib/eventStatus";
import {
  getDisciplinesForEventMatching,
  hasCrewSpecialty,
  profileHasCrewSpecialty,
  resolveProfileMembership,
} from "./lib/userVerticals";
import { resolveParticipationFlags } from "./lib/userParticipation";
import { resolveUserStatus } from "./lib/userStatus";
import { loadAllAdminProfiles } from "./lib/userProfiles";
import { buildUserProfileImageByUserId } from "./lib/userProfileImage";
import { loadEventHostDisplay } from "./lib/hostOrgs";
import {
  crewSections,
  responseScheduleChanged,
  sectionFingerprint,
} from "./lib/crewAvailability";
import { backupUserIdsFrom } from "./lib/crewBackups";
import { computeShiftStats, isTraineeShift } from "./lib/crewShiftKinds";


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
});

const responsePersonValue = v.object({
  userId: v.string(),
  name: v.string(),
  email: v.string(),
  image: v.optional(v.string()),
  responseStatus: crewAvailabilityResponseStatusValue,
  partialWindows: v.optional(v.array(partialWindowValue)),
  busyWindows: v.optional(v.array(busyWindowValue)),
  notes: v.optional(v.string()),
  respondedAt: v.number(),
  scheduleChanged: v.boolean(),
});

const scheduleBlockSummaryValue = v.object({
  _id: v.id("eventScheduleBlocks"),
  blockType: v.string(),
  label: v.string(),
  startsAt: v.number(),
  endsAt: v.number(),
  notes: v.optional(v.string()),
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

function toSectionSummary(block: Doc<"eventScheduleBlocks">) {
  return {
    _id: block._id,
    blockType: block.blockType,
    label: block.label,
    startsAt: block.startsAt,
    endsAt: block.endsAt,
    notes: block.notes,
  };
}

function weeksToMs(weeks: number) {
  return weeks * 7 * 24 * 60 * 60 * 1000;
}

function toUserSummary(
  userId: string,
  userByKey: Map<string, AuthUserRecord>,
  imageByUserId?: Map<string, string | undefined>,
) {
  const user = userByKey.get(userId);
  return {
    userId,
    name: user?.name ?? user?.email ?? userId,
    email: user?.email ?? "",
    image: imageByUserId?.get(userId) ?? user?.image ?? undefined,
  };
}

async function getActiveCrewProfiles(ctx: QueryCtx) {
  // Filter by `resolveUserStatus` (not the `by_status` index) so a profile
  // written before the status backfill still counts as active.
  const profiles = await loadAllAdminProfiles(ctx);
  return profiles.filter((profile) => {
    if (resolveUserStatus(profile) !== "active") return false;
    if (!resolveParticipationFlags(profile).assignableAsCrew) return false;
    return hasCrewSpecialty(resolveProfileMembership(profile).disciplines);
  });
}

function eligibleCrewProfilesForEvent(
  eventTeams: string[] | undefined,
  profiles: Doc<"userAdminProfiles">[],
) {
  return profiles.filter((profile) =>
    eventMatchesUserTeams(
      eventTeams,
      getDisciplinesForEventMatching(resolveProfileMembership(profile).disciplines),
    ),
  );
}

function aggregateResponses(responses: Doc<"eventCrewAvailabilityResponses">[]) {
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

function buildResponsePeople(
  responses: Doc<"eventCrewAvailabilityResponses">[],
  blocks: Doc<"eventScheduleBlocks">[],
  userByKey: Map<string, AuthUserRecord>,
  imageByUserId: Map<string, string | undefined>,
  options?: { includePrivateStatuses?: boolean; excludeUserIds?: Set<string> },
) {
  const includePrivate = options?.includePrivateStatuses ?? false;
  const excludeUserIds = options?.excludeUserIds;
  return responses
    .filter(
      (response) =>
        !excludeUserIds?.has(response.userId) &&
        (includePrivate ||
          response.responseStatus === "yes" ||
          response.responseStatus === "partial"),
    )
    .map((response) => ({
      ...toUserSummary(response.userId, userByKey, imageByUserId),
      responseStatus: response.responseStatus,
      partialWindows: response.partialWindows,
      busyWindows: response.busyWindows,
      notes: response.notes,
      respondedAt: response.respondedAt,
      scheduleChanged: responseScheduleChanged(response, blocks),
    }));
}

async function loadEventBundle(ctx: QueryCtx, eventId: Id<"events">) {
  const event = await ctx.db.get(eventId);
  if (!event) return null;

  const [blocks, shifts, responses] = await Promise.all([
    ctx.db
      .query("eventScheduleBlocks")
      .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", eventId))
      .take(200),
    ctx.db
      .query("eventCrewShifts")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .take(500),
    ctx.db
      .query("eventCrewAvailabilityResponses")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .take(500),
  ]);

  return {
    event: { ...event, status: normalizeEventStatus(event.status) },
    blocks,
    shifts,
    responses,
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

    const bundles = await Promise.all(
      upcomingCrewed.map(async (event) => {
        const [blocks, shifts, responses] = await Promise.all([
          ctx.db
            .query("eventScheduleBlocks")
            .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", event._id))
            .take(200),
          ctx.db
            .query("eventCrewShifts")
            .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
            .take(500),
          ctx.db
            .query("eventCrewAvailabilityResponses")
            .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
            .take(500),
        ]);
        const eligibleProfiles = eligibleCrewProfilesForEvent(
          event.teamsInterested,
          crewProfiles,
        );
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
      const shiftStats = computeShiftStats(shifts, backupUserIds);
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
      const pending = pendingUserIds.length;

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
        responseCounts: {
          ...responseCounts,
          pending,
          eligibleCrew,
        },
        sections: sectionStaffing(blocks, shifts, backupUserIds),
        traineeCount: shifts.filter(isTraineeShift).length,
        responders: buildResponsePeople(responses, blocks, userByKey, imageByUserId, {
          includePrivateStatuses: true,
        }),
        assignedCrew: assignedUserIds.map((userId) =>
          toUserSummary(userId, userByKey, imageByUserId),
        ),
        pendingCrew: pendingUserIds.map((userId) =>
          toUserSummary(userId, userByKey, imageByUserId),
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

export const listForCrewMember = query({
  args: {
    now: v.number(),
    weeksAhead: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("events"),
      title: v.string(),
      status: v.string(),
      eventType: v.optional(v.string()),
      venueName: v.optional(v.string()),
      host: v.optional(v.string()),
      notes: v.optional(v.string()),
      teamsInterested: v.optional(v.array(v.string())),
      startAt: v.number(),
      endAt: v.number(),
      scheduleBlocks: v.array(scheduleBlockSummaryValue),
      assignedCrew: v.array(userSummaryValue),
      interestedCrew: v.array(responsePersonValue),
      unavailableCounts: v.object({
        no: v.number(),
        onlyIfNecessary: v.number(),
      }),
      myResponse: v.union(
        v.object({
          responseStatus: crewAvailabilityResponseStatusValue,
          partialWindows: v.optional(v.array(partialWindowValue)),
          busyWindows: v.optional(v.array(busyWindowValue)),
          notes: v.optional(v.string()),
          respondedAt: v.number(),
          scheduleChanged: v.boolean(),
        }),
        v.null(),
      ),
      /** Sections this crew member is already on. */
      myShifts: v.array(
        v.object({
          scheduleBlockId: v.optional(v.id("eventScheduleBlocks")),
          role: v.string(),
          startsAt: v.number(),
          endsAt: v.number(),
        }),
      ),
      needsResponse: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const userId = getUserId(user);

    const profile = await getCurrentUserProfile(ctx, userId);
    if (resolveUserStatus(profile) !== "active") return [];
    if (!profileHasCrewSpecialty(profile ?? {})) return [];
    const userDisciplines = getDisciplinesForEventMatching(
      resolveProfileMembership(profile ?? {}).disciplines,
    );
    const weeksAhead = args.weeksAhead ?? DEFAULT_AVAILABILITY_WEEKS;
    const windowEnd = args.now + weeksToMs(weeksAhead);

    const matchedEvents = (
      await listCrewedEventsInRange(ctx, args.now, windowEnd)
    ).filter((event) =>
      eventMatchesUserTeams(event.teamsInterested, userDisciplines),
    );

    const bundles = await Promise.all(
      matchedEvents.map(async (event) => {
        const blocks = await ctx.db
          .query("eventScheduleBlocks")
          .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", event._id))
          .take(200);
        const shifts = await ctx.db
          .query("eventCrewShifts")
          .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
          .take(500);
        const responses = await ctx.db
          .query("eventCrewAvailabilityResponses")
          .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
          .take(500);
        return { event, blocks, shifts, responses };
      }),
    );

    const allUserIds = Array.from(
      new Set(
        bundles
          .flatMap(({ shifts, responses }) => [
            ...shifts.map((shift) => shift.userId?.trim()).filter(Boolean),
            ...responses.map((response) => response.userId),
          ])
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const userByKey = await findAuthUsersByIds(ctx, allUserIds);
    const imageByUserId = await buildUserProfileImageByUserId(ctx, allUserIds, userByKey);

    return Promise.all(
      bundles.map(async ({ event, blocks, shifts, responses }) => {
      const myResponseRow = responses.find((response) => response.userId === userId) ?? null;
      const responseCounts = aggregateResponses(responses);

      const assignedUserIds = Array.from(
        new Set(
          shifts
            .map((shift) => shift.userId?.trim())
            .filter((id): id is string => Boolean(id)),
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
        notes: event.notes,
        teamsInterested: event.teamsInterested,
        startAt: event.startAt,
        endAt: event.endAt,
        scheduleBlocks: crewSections(blocks).map(toSectionSummary),
        assignedCrew: assignedUserIds.map((id) => toUserSummary(id, userByKey, imageByUserId)),
        interestedCrew: buildResponsePeople(responses, blocks, userByKey, imageByUserId, {
          excludeUserIds: new Set(assignedUserIds),
        }),
        unavailableCounts: {
          no: responseCounts.no,
          onlyIfNecessary: responseCounts.onlyIfNecessary,
        },
        myResponse: myResponseRow
          ? {
              responseStatus: myResponseRow.responseStatus,
              partialWindows: myResponseRow.partialWindows,
              busyWindows: myResponseRow.busyWindows,
              notes: myResponseRow.notes,
              respondedAt: myResponseRow.respondedAt,
              scheduleChanged: responseScheduleChanged(myResponseRow, blocks),
            }
          : null,
        myShifts: shifts
          .filter((shift) => shift.userId?.trim() === userId)
          .sort((a, b) => a.startsAt - b.startsAt)
          .map((shift) => ({
            scheduleBlockId: shift.scheduleBlockId,
            role: shift.role,
            startsAt: shift.startsAt,
            endsAt: shift.endsAt,
          })),
        needsResponse: !myResponseRow,
      };
    }),
    );
  },
});

const eventResponderValue = v.object({
  userId: v.string(),
  name: v.string(),
  email: v.string(),
  image: v.optional(v.string()),
  responseStatus: crewAvailabilityResponseStatusValue,
  partialWindows: v.optional(v.array(partialWindowValue)),
  busyWindows: v.optional(v.array(busyWindowValue)),
  notes: v.optional(v.string()),
  respondedAt: v.number(),
  scheduleChanged: v.boolean(),
  isAssigned: v.boolean(),
});

const ASSIGNMENT_PRIORITY: Record<
  Doc<"eventCrewAvailabilityResponses">["responseStatus"],
  number
> = {
  yes: 0,
  partial: 1,
  only_if_necessary: 2,
  no: 99,
};

/**
 * Every availability response for one event (including "no", so the schedule
 * UI can warn before someone who said no is put on a shift).
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

    const bundle = await loadEventBundle(ctx, args.eventId);
    if (!bundle) return null;

    const shiftStats = computeShiftStats(bundle.shifts, backupUserIdsFrom(bundle.responses));
    const responseCounts = aggregateResponses(bundle.responses);

    const assignedUserIds = new Set(
      bundle.shifts
        .map((shift) => shift.userId?.trim())
        .filter((userId): userId is string => Boolean(userId)),
    );

    const responderUserIds = bundle.responses.map((response) => response.userId);
    const userByKey = await findAuthUsersByIds(ctx, responderUserIds);
    const imageByUserId = await buildUserProfileImageByUserId(ctx, responderUserIds, userByKey);

    const responders = bundle.responses
      .map((response) => ({
        ...toUserSummary(response.userId, userByKey, imageByUserId),
        responseStatus: response.responseStatus,
        partialWindows: response.partialWindows,
        busyWindows: response.busyWindows,
        notes: response.notes,
        respondedAt: response.respondedAt,
        scheduleChanged: responseScheduleChanged(response, bundle.blocks),
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
 * Team-matched crew who haven't answered for this event. Kept apart from
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

    const [crewProfiles, responses] = await Promise.all([
      getActiveCrewProfiles(ctx),
      ctx.db
        .query("eventCrewAvailabilityResponses")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .take(500),
    ]);
    const eligible = eligibleCrewProfilesForEvent(event.teamsInterested, crewProfiles);
    const respondedUserIds = new Set(responses.map((response) => response.userId));
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
      throw new Error(`${label} must end after they start.`);
    }
  }
}

export const submitResponse = mutation({
  args: {
    eventId: v.id("events"),
    responseStatus: crewAvailabilityResponseStatusValue,
    partialWindows: v.optional(v.array(partialWindowValue)),
    busyWindows: v.optional(v.array(busyWindowValue)),
    notes: v.optional(v.string()),
  },
  returns: v.id("eventCrewAvailabilityResponses"),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const userId = getUserId(user);

    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    if (!isCrewedEventType(event.eventType)) {
      throw new Error("This event type does not require crew availability.");
    }
    if (normalizeEventStatus(event.status) === "cancelled") {
      throw new Error("Cannot respond to a cancelled event.");
    }

    const profile = await getCurrentUserProfile(ctx, userId);
    if (resolveUserStatus(profile) !== "active") {
      throw new Error("Reactivate your account before responding to availability.");
    }
    if (!profileHasCrewSpecialty(profile ?? {})) {
      throw new Error("Availability is limited to crew specialties.");
    }
    const userDisciplines = getDisciplinesForEventMatching(
      resolveProfileMembership(profile ?? {}).disciplines,
    );
    if (!eventMatchesUserTeams(event.teamsInterested, userDisciplines)) {
      throw new Error("This event is not in your crew team scope.");
    }

    const blocks = await ctx.db
      .query("eventScheduleBlocks")
      .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", args.eventId))
      .take(200);
    const blockIds = new Set(blocks.map((block) => block._id));

    const isPartial = args.responseStatus === "partial";
    if (isPartial) {
      const windows = args.partialWindows ?? [];
      if (windows.length === 0) {
        throw new Error("Pick at least one section you can work.");
      }
      assertWindowOrder(windows, "Available times");
      for (const window of windows) {
        if (window.scheduleBlockId && !blockIds.has(window.scheduleBlockId)) {
          throw new Error("That section is no longer on this event. Reload and try again.");
        }
      }
      assertWindowOrder(args.busyWindows ?? [], "Busy times");
    } else if (args.partialWindows?.length || args.busyWindows?.length) {
      throw new Error("Sections and busy times only apply when you can work part of the event.");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("eventCrewAvailabilityResponses")
      .withIndex("by_eventId_and_userId", (q) =>
        q.eq("eventId", args.eventId).eq("userId", userId),
      )
      .unique();

    const busyWindows = isPartial && args.busyWindows?.length ? args.busyWindows : undefined;
    const payload = {
      eventId: args.eventId,
      userId,
      responseStatus: args.responseStatus,
      ...(isPartial ? { partialWindows: args.partialWindows } : {}),
      ...(busyWindows ? { busyWindows } : {}),
      ...(args.notes?.trim() ? { notes: args.notes.trim() } : {}),
      scheduleFingerprint: sectionFingerprint(blocks),
      respondedAt: now,
      updatedAt: now,
    };

    if (existing) {
      // Replace, not patch: switching away from "partial" must drop old windows.
      await ctx.db.replace(existing._id, { ...payload, createdAt: existing.createdAt });
      return existing._id;
    }

    return await ctx.db.insert("eventCrewAvailabilityResponses", {
      ...payload,
      createdAt: now,
    });
  },
});
