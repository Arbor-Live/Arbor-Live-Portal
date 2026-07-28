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
  isStaffMember,
  resolveProfileMembership,
} from "./lib/userVerticals";


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
  notes: v.optional(v.string()),
  respondedAt: v.number(),
});

const scheduleBlockSummaryValue = v.object({
  _id: v.id("eventScheduleBlocks"),
  blockType: v.string(),
  label: v.string(),
  startsAt: v.number(),
  endsAt: v.number(),
  notes: v.optional(v.string()),
});

type AuthUserRecord = AuthUser;

function weeksToMs(weeks: number) {
  return weeks * 7 * 24 * 60 * 60 * 1000;
}

function toUserSummary(userId: string, userByKey: Map<string, AuthUserRecord>) {
  const user = userByKey.get(userId);
  return {
    userId,
    name: user?.name ?? user?.email ?? userId,
    email: user?.email ?? "",
    image: user?.image ?? undefined,
  };
}

async function getActiveCrewProfiles(ctx: QueryCtx) {
  const profiles = await ctx.db
    .query("userAdminProfiles")
    .withIndex("by_active", (q) => q.eq("active", true))
    .take(500);
  return profiles.filter((profile) => isStaffMember(resolveProfileMembership(profile)));
}

function countEligibleCrewForEvent(
  eventTeams: string[] | undefined,
  profiles: Doc<"userAdminProfiles">[],
) {
  return profiles.filter((profile) =>
    eventMatchesUserTeams(
      eventTeams,
      getDisciplinesForEventMatching(resolveProfileMembership(profile).disciplines),
    ),
  ).length;
}

function computeShiftStats(shifts: Doc<"eventCrewShifts">[]) {
  const totalShifts = shifts.length;
  const filledShifts = shifts.filter((shift) => Boolean(shift.userId?.trim())).length;
  const isCrewConfirmed = totalShifts > 0 && filledShifts === totalShifts;
  return { totalShifts, filledShifts, unfilledShifts: totalShifts - filledShifts, isCrewConfirmed };
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
  userByKey: Map<string, AuthUserRecord>,
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
      ...toUserSummary(response.userId, userByKey),
      responseStatus: response.responseStatus,
      partialWindows: response.partialWindows,
      notes: response.notes,
      respondedAt: response.respondedAt,
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

/**
 * Lightweight badge count for the admin sidebar — ranged events only, parallel
 * shift checks, no responders/users/eligible-crew scan.
 */
export const countUnconfirmedForAdminOverview = query({
  args: {
    rangeStart: v.number(),
    rangeEnd: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    if (args.rangeEnd < args.rangeStart) {
      throw new Error("Date range end must be on or after the start.");
    }

    const upcomingCrewed = await listCrewedEventsInRange(ctx, args.rangeStart, args.rangeEnd);
    const shiftPages = await Promise.all(
      upcomingCrewed.map((event) =>
        ctx.db
          .query("eventCrewShifts")
          .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
          .take(100),
      ),
    );
    return shiftPages.filter((shifts) => !computeShiftStats(shifts).isCrewConfirmed).length;
  },
});
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
      responders: v.array(responsePersonValue),
      assignedCrew: v.array(userSummaryValue),
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
        const shifts = await ctx.db
          .query("eventCrewShifts")
          .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
          .take(500);
        const responses = await ctx.db
          .query("eventCrewAvailabilityResponses")
          .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
          .take(500);
        return { event, shifts, responses };
      }),
    );

    const allUserIds = Array.from(
      new Set(
        bundles
          .flatMap(({ shifts, responses }) => [
            ...shifts.map((shift) => shift.userId?.trim()).filter(Boolean),
            ...responses.map((response) => response.userId),
          ])
          .filter((userId): userId is string => Boolean(userId)),
      ),
    );
    const userByKey = await findAuthUsersByIds(ctx, allUserIds);

    const rows = bundles.map(({ event, shifts, responses }) => {
      const shiftStats = computeShiftStats(shifts);
      const responseCounts = aggregateResponses(responses);
      const eligibleCrew = countEligibleCrewForEvent(event.teamsInterested, crewProfiles);
      const pending = Math.max(0, eligibleCrew - responseCounts.responded);

      const assignedUserIds = Array.from(
        new Set(
          shifts
            .map((shift) => shift.userId?.trim())
            .filter((userId): userId is string => Boolean(userId)),
        ),
      );

      return {
        _id: event._id,
        title: event.title,
        status: normalizeEventStatus(event.status),
        eventType: event.eventType,
        venueName: event.venueName,
        host: event.host,
        teamsInterested: event.teamsInterested,
        startAt: event.startAt,
        endAt: event.endAt,
        ...shiftStats,
        responseCounts: {
          ...responseCounts,
          onlyIfNecessary: responseCounts.onlyIfNecessary,
          pending,
          eligibleCrew,
        },
        responders: buildResponsePeople(responses, userByKey, { includePrivateStatuses: true }),
        assignedCrew: assignedUserIds.map((userId) => toUserSummary(userId, userByKey)),
      };
    });

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
          notes: v.optional(v.string()),
          respondedAt: v.number(),
        }),
        v.null(),
      ),
      needsResponse: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const userId = getUserId(user);

    const profile = await getCurrentUserProfile(ctx, userId);
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

    return bundles.map(({ event, blocks, shifts, responses }) => {
      const myResponseRow = responses.find((response) => response.userId === userId) ?? null;
      const responseCounts = aggregateResponses(responses);

      const assignedUserIds = Array.from(
        new Set(
          shifts
            .map((shift) => shift.userId?.trim())
            .filter((id): id is string => Boolean(id)),
        ),
      );

      return {
        _id: event._id,
        title: event.title,
        status: normalizeEventStatus(event.status),
        eventType: event.eventType,
        venueName: event.venueName,
        host: event.host,
        notes: event.notes,
        teamsInterested: event.teamsInterested,
        startAt: event.startAt,
        endAt: event.endAt,
        scheduleBlocks: blocks
          .sort((a, b) => a.startsAt - b.startsAt)
          .map((block) => ({
            _id: block._id,
            blockType: block.blockType,
            label: block.label,
            startsAt: block.startsAt,
            endsAt: block.endsAt,
            notes: block.notes,
          })),
        assignedCrew: assignedUserIds.map((id) => toUserSummary(id, userByKey)),
        interestedCrew: buildResponsePeople(responses, userByKey, {
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
              notes: myResponseRow.notes,
              respondedAt: myResponseRow.respondedAt,
            }
          : null,
        needsResponse: !myResponseRow,
      };
    });
  },
});

/**
 * Sidebar badge: ranged crewed events + one by_userId response scan.
 * Avoids per-event response lookups and unbounded startAt scans.
 */
export const getMyPendingAvailabilityCount = query({
  args: {
    now: v.number(),
    weeksAhead: v.optional(v.number()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const userId = getUserId(user);

    const profile = await getCurrentUserProfile(ctx, userId);
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
    if (matchedEvents.length === 0) return 0;

    const myResponses = await ctx.db
      .query("eventCrewAvailabilityResponses")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(500);
    const respondedEventIds = new Set(myResponses.map((response) => response.eventId));

    return matchedEvents.filter((event) => !respondedEventIds.has(event._id)).length;
  },
});
export const getEventForCrewResponse = query({
  args: {
    eventId: v.id("events"),
  },
  returns: v.union(
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
          notes: v.optional(v.string()),
          respondedAt: v.number(),
        }),
        v.null(),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const userId = getUserId(user);

    const bundle = await loadEventBundle(ctx, args.eventId);
    if (!bundle) return null;

    const profile = await getCurrentUserProfile(ctx, userId);
    const userDisciplines = getDisciplinesForEventMatching(
      resolveProfileMembership(profile ?? {}).disciplines,
    );
    if (!eventMatchesUserTeams(bundle.event.teamsInterested, userDisciplines)) {
      throw new Error("This event is not in your crew team scope.");
    }

    const allUserIds = Array.from(
      new Set([
        ...bundle.shifts.map((shift) => shift.userId?.trim()).filter(Boolean),
        ...bundle.responses.map((response) => response.userId),
      ].filter((id): id is string => Boolean(id))),
    );
    const userByKey = await findAuthUsersByIds(ctx, allUserIds);

    const myResponseRow = bundle.responses.find((response) => response.userId === userId) ?? null;
    const responseCounts = aggregateResponses(bundle.responses);
    const assignedUserIds = Array.from(
      new Set(
        bundle.shifts
          .map((shift) => shift.userId?.trim())
          .filter((id): id is string => Boolean(id)),
      ),
    );

    return {
      _id: bundle.event._id,
      title: bundle.event.title,
      status: bundle.event.status,
      eventType: bundle.event.eventType,
      venueName: bundle.event.venueName,
      host: bundle.event.host,
      notes: bundle.event.notes,
      teamsInterested: bundle.event.teamsInterested,
      startAt: bundle.event.startAt,
      endAt: bundle.event.endAt,
      scheduleBlocks: bundle.blocks
        .sort((a, b) => a.startsAt - b.startsAt)
        .map((block) => ({
          _id: block._id,
          blockType: block.blockType,
          label: block.label,
          startsAt: block.startsAt,
          endsAt: block.endsAt,
          notes: block.notes,
        })),
      assignedCrew: assignedUserIds.map((id) => toUserSummary(id, userByKey)),
      interestedCrew: buildResponsePeople(bundle.responses, userByKey, {
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
            notes: myResponseRow.notes,
            respondedAt: myResponseRow.respondedAt,
          }
        : null,
    };
  },
});

const assignableResponderValue = v.object({
  userId: v.string(),
  name: v.string(),
  email: v.string(),
  image: v.optional(v.string()),
  responseStatus: crewAvailabilityResponseStatusValue,
  partialWindows: v.optional(v.array(partialWindowValue)),
  notes: v.optional(v.string()),
  respondedAt: v.number(),
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

export const getSummaryForEvent = query({
  args: {
    eventId: v.id("events"),
  },
  returns: v.union(
    v.object({
      totalShifts: v.number(),
      filledShifts: v.number(),
      unfilledShifts: v.number(),
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
      assignableResponders: v.array(assignableResponderValue),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);

    const bundle = await loadEventBundle(ctx, args.eventId);
    if (!bundle) return null;

    const shiftStats = computeShiftStats(bundle.shifts);
    const responseCounts = aggregateResponses(bundle.responses);

    const assignedUserIds = new Set(
      bundle.shifts
        .map((shift) => shift.userId?.trim())
        .filter((userId): userId is string => Boolean(userId)),
    );

    const assignableResponseRows = bundle.responses.filter(
      (response) => response.responseStatus !== "no",
    );
    const assignableUserIds = assignableResponseRows.map((response) => response.userId);
    const userByKey = await findAuthUsersByIds(ctx, assignableUserIds);

    const assignableResponders = assignableResponseRows
      .map((response) => ({
        ...toUserSummary(response.userId, userByKey),
        responseStatus: response.responseStatus,
        partialWindows: response.partialWindows,
        notes: response.notes,
        respondedAt: response.respondedAt,
        isAssigned: assignedUserIds.has(response.userId),
      }))
      .sort((a, b) => {
        const priorityDiff =
          ASSIGNMENT_PRIORITY[a.responseStatus] - ASSIGNMENT_PRIORITY[b.responseStatus];
        if (priorityDiff !== 0) return priorityDiff;
        return a.respondedAt - b.respondedAt;
      });

    // Eligible/pending totals come from the crew-scheduling overview. Scanning
    // every active crew profile here routinely blew the 1s budget on CI and
    // blocked the assignable-responder list the schedule UI actually needs.
    return {
      ...shiftStats,
      responseCounts: {
        ...responseCounts,
        onlyIfNecessary: responseCounts.onlyIfNecessary,
        pending: 0,
        eligibleCrew: responseCounts.responded,
      },
      assignableResponders,
    };
  },
});

export const submitResponse = mutation({
  args: {
    eventId: v.id("events"),
    responseStatus: crewAvailabilityResponseStatusValue,
    partialWindows: v.optional(v.array(partialWindowValue)),
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
    const userDisciplines = getDisciplinesForEventMatching(
      resolveProfileMembership(profile ?? {}).disciplines,
    );
    if (!eventMatchesUserTeams(event.teamsInterested, userDisciplines)) {
      throw new Error("This event is not in your crew team scope.");
    }

    if (args.responseStatus === "partial") {
      const windows = args.partialWindows ?? [];
      if (windows.length === 0) {
        throw new Error("Partial availability requires at least one time window.");
      }
      for (const window of windows) {
        if (window.endsAt <= window.startsAt) {
          throw new Error("Partial availability windows must have end after start.");
        }
        if (window.scheduleBlockId) {
          const block = await ctx.db.get(window.scheduleBlockId);
          if (!block || block.eventId !== args.eventId) {
            throw new Error("Invalid schedule block for partial availability.");
          }
        }
      }
    } else if (args.partialWindows?.length) {
      throw new Error("Partial windows are only allowed for partial responses.");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("eventCrewAvailabilityResponses")
      .withIndex("by_eventId_and_userId", (q) =>
        q.eq("eventId", args.eventId).eq("userId", userId),
      )
      .unique();

    const payload = {
      eventId: args.eventId,
      userId,
      responseStatus: args.responseStatus,
      partialWindows: args.responseStatus === "partial" ? args.partialWindows : undefined,
      notes: args.notes?.trim() || undefined,
      respondedAt: now,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("eventCrewAvailabilityResponses", {
      ...payload,
      createdAt: now,
    });
  },
});
