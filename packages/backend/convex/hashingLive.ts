import { pacificDateKey } from "@arbor/format";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { fileDamageReport, operabilityValue } from "./damageReports";
import { findAuthUsersByIds, getUserId, requireAdminOrOperations } from "./lib/auth";
import { loadAdminProfilesByStatus } from "./lib/userProfiles";
import { buildUserProfileImageByUserId } from "./lib/userProfileImage";
import { appError } from "./lib/errors";
import { flattenChecklist, type ChecklistAreaView } from "./lib/hashing";
import { HASHING_CHECKLIST_SEED } from "./lib/hashingChecklistSeed";
import {
  ensureChecklist,
  hashDateLabel,
  isHashCrew,
  latestChecklist,
  loadDateBookings,
  loadHashDate,
  loadSettings,
  requireBookingRules,
  requireHashEventId,
  requireHashingViewer,
} from "./lib/hashingData";
import { completeHashEvent, reviveLapsedHash, settleHashAttendance } from "./lib/hashingEvents";
import {
  hashBookingStatusValue,
  hashCheckStatusValue,
  hashDateStatusValue,
  hashFlagReasonValue,
} from "./lib/hashingValues";

const NOTE_MAX = 500;
/** Finished hashes shown in History, newest first. About three quarters of hashes. */
const HISTORY_TAKE = 40;
/** Open flags in History. Well past a healthy backlog; the summary says when it's capped. */
const OPEN_FLAG_TAKE = 200;
/** A hash's rows can't pass `CHECKLIST_LIMITS.rows`, so this never truncates. */
const HASH_CHECK_TAKE = 500;
const AREA_CLAIM_TAKE = 500;

type Ctx = QueryCtx | MutationCtx;

async function loadChecks(ctx: Ctx, hashDateId: Id<"hashDates">) {
  return await ctx.db
    .query("hashChecks")
    .withIndex("by_hashDateId_and_itemKey", (q) => q.eq("hashDateId", hashDateId))
    .take(HASH_CHECK_TAKE);
}

function tally(areas: ChecklistAreaView[], checks: Doc<"hashChecks">[]) {
  const keys = new Set(areas.flatMap((area) => [...area.kits.flatMap((kit) => kit.rows), ...area.finalChecks]).map((row) => row.itemKey));
  const counted = checks.filter((check) => keys.has(check.itemKey));
  return {
    total: keys.size,
    // A flagged item has been looked at: only untouched items are "left".
    checked: counted.length,
    flagged: counted.filter((check) => check.status === "flagged").length,
  };
}

/** The tree this hash runs on: pinned once started, the current one before that. */
async function checklistFor(ctx: Ctx, row: Doc<"hashDates">) {
  const pinned = row.checklistVersionId ? await ctx.db.get(row.checklistVersionId) : null;
  const tree = pinned ?? (await latestChecklist(ctx)) ?? HASHING_CHECKLIST_SEED;
  return flattenChecklist(tree, row.areaIds);
}

/** Booked on it (and showing up confirms a pending booking), or ops. */
async function requireOnHash(ctx: MutationCtx, row: Doc<"hashDates">) {
  const viewer = await requireHashingViewer(ctx);
  const booking = (await loadDateBookings(ctx, row)).find((candidate) => candidate.userId === viewer.userId);
  if (!booking && !viewer.canManage) appError("HASH_NOT_ON_HASH", "You're not booked on this hash.");
  if (booking?.status === "needs_confirmation") {
    for (const shiftId of booking.shiftIds) await ctx.db.patch(shiftId, { needsConfirmation: undefined });
  }
  return { ...viewer, booking };
}

function requireRunning(row: Doc<"hashDates">) {
  if (row.status !== "in_progress") appError("HASH_NOT_RUNNING", "This hash isn't running.");
}

function requireRow(areas: ChecklistAreaView[], itemKey: string) {
  for (const area of areas) {
    const rows = [...area.kits.flatMap((kit) => kit.rows), ...area.finalChecks];
    const row = rows.find((candidate) => candidate.itemKey === itemKey);
    if (row) return { areaId: area.id, areaName: area.name, text: row.text };
  }
  appError("HASH_UNKNOWN_ITEM", "That item isn't on this hash's checklist.");
}

const liveCheckValue = v.object({
  _id: v.id("hashChecks"),
  status: hashCheckStatusValue,
  flagReason: v.optional(hashFlagReasonValue),
  note: v.optional(v.string()),
  byName: v.string(),
  resolved: v.boolean(),
  sentToDamage: v.boolean(),
});

const liveRowValue = v.object({
  itemKey: v.string(),
  text: v.string(),
  check: v.optional(liveCheckValue),
});

export const get = query({
  args: { hashDateId: v.id("hashDates"), today: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      hash: v.object({
        _id: v.id("hashDates"),
        dateKey: v.string(),
        startsAt: v.number(),
        endsAt: v.number(),
        status: hashDateStatusValue,
      }),
      location: v.optional(v.string()),
      viewerId: v.string(),
      canManage: v.boolean(),
      canStart: v.boolean(),
      canWork: v.boolean(),
      people: v.array(
        v.object({
          userId: v.string(),
          name: v.string(),
          email: v.string(),
          imageUrl: v.optional(v.string()),
          status: hashBookingStatusValue,
        }),
      ),
      totals: v.object({ total: v.number(), checked: v.number(), flagged: v.number() }),
      areas: v.array(
        v.object({
          id: v.string(),
          name: v.string(),
          total: v.number(),
          checked: v.number(),
          flagged: v.number(),
          claims: v.array(v.object({ userId: v.string(), name: v.string() })),
          kits: v.array(v.object({ id: v.string(), name: v.string(), rows: v.array(liveRowValue) })),
          finalChecks: v.array(liveRowValue),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const viewer = await requireHashingViewer(ctx);
    const row = await ctx.db.get(args.hashDateId);
    if (!row) return null;

    const [areas, checks, claims, bookings, event, settings] = await Promise.all([
      checklistFor(ctx, row),
      loadChecks(ctx, row._id),
      ctx.db
        .query("hashAreaClaims")
        .withIndex("by_hashDateId_and_areaId_and_userId", (q) => q.eq("hashDateId", row._id))
        .take(AREA_CLAIM_TAKE),
      loadDateBookings(ctx, row),
      row.eventId ? ctx.db.get(row.eventId) : null,
      loadSettings(ctx),
    ]);

    const userIds = [
      ...new Set([
        ...bookings.map((booking) => booking.userId),
        ...checks.map((check) => check.byUserId),
        ...claims.map((claim) => claim.userId),
      ]),
    ];
    const userByKey = await findAuthUsersByIds(ctx, userIds);
    const imageById = await buildUserProfileImageByUserId(
      ctx,
      bookings.map((booking) => booking.userId),
      userByKey,
    );
    const nameOf = (userId: string) => {
      const user = userByKey.get(userId);
      return user?.name || user?.email || "Crew";
    };
    const checkByKey = new Map(checks.map((check) => [check.itemKey, check]));
    const withCheck = (rows: ChecklistAreaView["finalChecks"]) =>
      rows.map((item) => {
        const check = checkByKey.get(item.itemKey);
        return {
          ...item,
          check: check && {
            _id: check._id,
            status: check.status,
            flagReason: check.flagReason,
            note: check.note,
            byName: nameOf(check.byUserId),
            resolved: check.resolvedAt !== undefined,
            sentToDamage: check.damageReportId !== undefined,
          },
        };
      });

    const isBooked = bookings.some((booking) => booking.userId === viewer.userId);
    return {
      hash: {
        _id: row._id,
        dateKey: row.dateKey,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        status: row.status,
      },
      location: event?.venueName ?? settings?.location,
      viewerId: viewer.userId,
      canManage: viewer.canManage,
      canStart: row.status === "scheduled" && (viewer.canManage || (isBooked && row.dateKey === args.today)),
      canWork: viewer.canManage || isBooked,
      people: bookings.map((booking) => ({
        userId: booking.userId,
        name: nameOf(booking.userId),
        email: userByKey.get(booking.userId)?.email ?? "",
        imageUrl: imageById.get(booking.userId),
        status: booking.status,
      })),
      totals: tally(areas, checks),
      areas: areas.map((area) => {
        const inArea = checks.filter((check) => check.areaId === area.id);
        return {
          id: area.id,
          name: area.name,
          total: area.total,
          checked: inArea.length,
          flagged: inArea.filter((check) => check.status === "flagged").length,
          claims: claims
            .filter((claim) => claim.areaId === area.id)
            .map((claim) => ({ userId: claim.userId, name: nameOf(claim.userId) })),
          kits: area.kits.map((kit) => ({ id: kit.id, name: kit.name, rows: withCheck(kit.rows) })),
          finalChecks: withCheck(area.finalChecks),
        };
      }),
    };
  },
});

export const start = mutation({
  args: { hashDateId: v.id("hashDates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await loadHashDate(ctx, args.hashDateId);
    const viewer = await requireOnHash(ctx, row);
    if (row.status === "in_progress") return null;
    if (row.status !== "scheduled") appError("HASH_NOT_STARTABLE", "This hash can't be started.");
    if (!viewer.canManage && row.dateKey !== pacificDateKey(Date.now())) {
      appError("HASH_NOT_TODAY", "You can start this hash on the day.");
    }
    const checklist = await ensureChecklist(ctx);
    if (flattenChecklist(checklist, row.areaIds).length === 0) {
      appError("HASH_EMPTY_CHECKLIST", "None of this hash's checklist areas exist any more.");
    }
    await ctx.db.patch(row._id, {
      status: "in_progress",
      startedAt: Date.now(),
      checklistVersionId: checklist._id,
    });
    return null;
  },
});

/** Idempotent, and touches only this item's row, so nobody ticking alongside contends. */
export const setCheck = mutation({
  args: { hashDateId: v.id("hashDates"), itemKey: v.string(), done: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await loadHashDate(ctx, args.hashDateId);
    const { userId } = await requireOnHash(ctx, row);
    requireRunning(row);
    const { areaId } = requireRow(await checklistFor(ctx, row), args.itemKey);
    const existing = await ctx.db
      .query("hashChecks")
      .withIndex("by_hashDateId_and_itemKey", (q) => q.eq("hashDateId", row._id).eq("itemKey", args.itemKey))
      .unique();
    if (args.done) {
      // A flag outranks a tick: it comes off only through the flag sheet.
      if (!existing) {
        await ctx.db.insert("hashChecks", {
          hashDateId: row._id,
          itemKey: args.itemKey,
          areaId,
          status: "done",
          byUserId: userId,
        });
      }
    } else if (existing?.status === "done") {
      await ctx.db.delete(existing._id);
    }
    return null;
  },
});

/** A flag that ops resolved or that reached Damage & repair is a record, so it stays. */
export const removeFlag = mutation({
  args: { hashDateId: v.id("hashDates"), itemKey: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await loadHashDate(ctx, args.hashDateId);
    await requireOnHash(ctx, row);
    requireRunning(row);
    const existing = await ctx.db
      .query("hashChecks")
      .withIndex("by_hashDateId_and_itemKey", (q) => q.eq("hashDateId", row._id).eq("itemKey", args.itemKey))
      .unique();
    if (existing?.status !== "flagged") return null;
    if (existing.resolvedAt !== undefined || existing.damageReportId) {
      appError("HASH_FLAG_KEPT", "This flag is already with ops, so it can't be removed.");
    }
    await ctx.db.delete(existing._id);
    return null;
  },
});

export const flagItem = mutation({
  args: {
    hashDateId: v.id("hashDates"),
    itemKey: v.string(),
    reason: hashFlagReasonValue,
    note: v.optional(v.string()),
    damage: v.optional(
      v.object({
        inventoryItemId: v.id("inventoryItems"),
        operability: operabilityValue,
        severity: v.number(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await loadHashDate(ctx, args.hashDateId);
    const { user, userId } = await requireOnHash(ctx, row);
    requireRunning(row);
    const item = requireRow(await checklistFor(ctx, row), args.itemKey);
    const note = args.note?.trim() || undefined;
    if (note && note.length > NOTE_MAX) appError("HASH_TEXT_TOO_LONG", `Keep details under ${NOTE_MAX} characters.`);
    if (args.damage && args.reason !== "damaged") {
      appError("HASH_NOT_DAMAGED", "Only damaged items go to Damage & repair.");
    }
    const existing = await ctx.db
      .query("hashChecks")
      .withIndex("by_hashDateId_and_itemKey", (q) => q.eq("hashDateId", row._id).eq("itemKey", args.itemKey))
      .unique();

    let damageReportId = existing?.damageReportId;
    if (args.damage && !damageReportId) {
      const { reportIds } = await fileDamageReport(ctx, user, {
        inventoryItemId: args.damage.inventoryItemId,
        eventUnknown: true,
        scope: "this_only",
        operability: args.damage.operability,
        severity: args.damage.severity,
        notes: [`Hashing, ${item.areaName}: ${item.text}`, note].filter(Boolean).join("\n"),
      });
      damageReportId = reportIds[0];
    }

    const fields = {
      status: "flagged" as const,
      flagReason: args.reason,
      note,
      byUserId: userId,
      damageReportId,
      resolvedAt: undefined,
      resolvedBy: undefined,
    };
    if (existing) await ctx.db.patch(existing._id, fields);
    else await ctx.db.insert("hashChecks", { hashDateId: row._id, itemKey: args.itemKey, areaId: item.areaId, ...fields });
    return null;
  },
});

async function findClaim(ctx: Ctx, row: Doc<"hashDates">, areaId: string, userId: string) {
  return await ctx.db
    .query("hashAreaClaims")
    .withIndex("by_hashDateId_and_areaId_and_userId", (q) =>
      q.eq("hashDateId", row._id).eq("areaId", areaId).eq("userId", userId),
    )
    .unique();
}

export const setAreaClaim = mutation({
  args: { hashDateId: v.id("hashDates"), areaId: v.string(), claimed: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await loadHashDate(ctx, args.hashDateId);
    const { userId } = await requireOnHash(ctx, row);
    requireRunning(row);
    const areas = await checklistFor(ctx, row);
    if (!areas.some((area) => area.id === args.areaId)) appError("HASH_UNKNOWN_AREA", "That area isn't on this hash.");
    const existing = await findClaim(ctx, row, args.areaId, userId);
    if (args.claimed && !existing) {
      await ctx.db.insert("hashAreaClaims", { hashDateId: row._id, areaId: args.areaId, userId });
    } else if (!args.claimed && existing) {
      await ctx.db.delete(existing._id);
    }
    return null;
  },
});

/**
 * Whoever was there keeps their shift, so they get credit and pay. Everyone else
 * loses it and needs a hash again. Being on the list settles a pending booking.
 * Crew finish it on their phones in the closet, so one tap can't wipe the list or
 * credit people with nobody there to vouch for them. Ops can close it with an
 * empty list, because a hash started by mistake has to end without credit.
 */
export const finish = mutation({
  args: { hashDateId: v.id("hashDates"), attendeeUserIds: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await loadHashDate(ctx, args.hashDateId);
    if (row.status === "finished") return null;
    const viewer = await requireOnHash(ctx, row);
    requireRunning(row);
    const eventId = requireHashEventId(row);
    const attendees = new Set(args.attendeeUserIds);
    const bookings = await loadDateBookings(ctx, row);
    const stranger = args.attendeeUserIds.find((userId) => !bookings.some((booking) => booking.userId === userId));
    if (stranger) appError("HASH_NOT_BOOKED", "Only people booked on this hash can be marked as there.");
    if (!viewer.canManage) {
      if (attendees.size === 0) appError("HASH_NO_ATTENDEES", "Tick who was there.");
      if (!attendees.has(viewer.userId)) {
        appError("HASH_FINISH_WITHOUT_YOU", "You can only finish a hash you were at, so tick yourself.");
      }
    }

    await settleHashAttendance(ctx, row, args.attendeeUserIds);
    const [areas, checks] = await Promise.all([checklistFor(ctx, row), loadChecks(ctx, row._id)]);
    await ctx.db.patch(row._id, {
      status: "finished",
      finishedAt: Date.now(),
      finalCounts: tally(areas, checks),
    });
    await completeHashEvent(ctx, eventId);
    return null;
  },
});

/**
 * Ops putting the record right after the fact: who was at a finished hash, or
 * that a lapsed one did happen. People named get shifts, credit and pay; people
 * left off lose them, with the normal notice. Capacity doesn't apply, since this
 * records who was there.
 */
export const correctAttendance = mutation({
  args: { hashDateId: v.id("hashDates"), attendeeUserIds: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdminOrOperations(ctx);
    const row = await loadHashDate(ctx, args.hashDateId);
    if (row.status !== "finished" && row.status !== "lapsed") {
      appError("HASH_NOT_OVER", "Only a finished or lapsed hash can be corrected.");
    }
    const attendeeUserIds = [...new Set(args.attendeeUserIds)];
    if (row.status === "lapsed" && attendeeUserIds.length === 0) {
      appError("HASH_NO_ATTENDEES", "Name who was there to mark this hash as done.");
    }
    const booked = new Set((await loadDateBookings(ctx, row)).map((booking) => booking.userId));
    for (const userId of attendeeUserIds) {
      if (!booked.has(userId)) await requireBookingRules(ctx, row, userId, null);
    }

    if (row.status === "lapsed") await reviveLapsedHash(ctx, row);
    await settleHashAttendance(ctx, await loadHashDate(ctx, row._id), attendeeUserIds, {
      scheduledSubject: `Hash on ${hashDateLabel(row)}: you're marked as there`,
    });
    if (row.status === "lapsed") await ctx.db.patch(row._id, { status: "finished", finishedAt: row.endsAt });
    return null;
  },
});

/** Who the correction dialog can tick: the crew, plus anyone credited who has since left it. */
export const getAttendance = query({
  args: { hashDateId: v.id("hashDates") },
  returns: v.object({
    attendeeIds: v.array(v.string()),
    crew: v.array(v.object({ userId: v.string(), name: v.string() })),
  }),
  handler: async (ctx, args) => {
    await requireAdminOrOperations(ctx);
    const row = await loadHashDate(ctx, args.hashDateId);
    const [bookings, profiles] = await Promise.all([loadDateBookings(ctx, row), loadAdminProfilesByStatus(ctx, ["active"])]);
    const attendeeIds = bookings.map((booking) => booking.userId);
    const userIds = [...new Set([...attendeeIds, ...profiles.filter(isHashCrew).map((profile) => profile.userId)])];
    const userByKey = await findAuthUsersByIds(ctx, userIds);
    return {
      attendeeIds,
      crew: userIds
        .map((userId) => {
          const user = userByKey.get(userId);
          return { userId, name: user?.name || user?.email || "Crew" };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  },
});

export const getHistory = query({
  args: {},
  returns: v.object({
    finished: v.array(
      v.object({
        _id: v.id("hashDates"),
        startsAt: v.number(),
        origin: v.string(),
        people: v.array(v.string()),
        counts: v.optional(v.object({ checked: v.number(), flagged: v.number(), total: v.number() })),
      }),
    ),
    lapsed: v.array(v.object({ _id: v.id("hashDates"), startsAt: v.number() })),
    flags: v.array(
      v.object({
        _id: v.id("hashChecks"),
        hashDateId: v.id("hashDates"),
        hashStartsAt: v.number(),
        areaName: v.string(),
        text: v.string(),
        reason: v.optional(hashFlagReasonValue),
        note: v.optional(v.string()),
        byName: v.string(),
        damageReportId: v.optional(v.id("damageReports")),
      }),
    ),
    flagsCapped: v.boolean(),
  }),
  handler: async (ctx) => {
    await requireAdminOrOperations(ctx);
    const [finished, lapsed] = await Promise.all(
      (["finished", "lapsed"] as const).map((status) =>
        ctx.db
          .query("hashDates")
          .withIndex("by_status_and_dateKey", (q) => q.eq("status", status))
          .order("desc")
          .take(HISTORY_TAKE),
      ),
    );
    const flags = await ctx.db
      .query("hashChecks")
      .withIndex("by_status_and_resolvedAt", (q) => q.eq("status", "flagged").eq("resolvedAt", undefined))
      .take(OPEN_FLAG_TAKE);

    const hashIds = [...new Set(flags.map((flag) => flag.hashDateId))];
    const flagRows = await Promise.all(hashIds.map((id) => ctx.db.get(id)));
    const hashById = new Map(flagRows.flatMap((row) => (row ? [[row._id, row] as const] : [])));
    const areasByHash = new Map(
      await Promise.all(
        [...hashById.values()].map(async (row) => [row._id, await checklistFor(ctx, row)] as const),
      ),
    );

    const bookingLists = await Promise.all(finished.map((row) => loadDateBookings(ctx, row)));
    const credited = bookingLists.map((list) => list.filter((booking) => booking.status === "booked"));
    const userByKey = await findAuthUsersByIds(ctx, [
      ...credited.flat().map((booking) => booking.userId),
      ...flags.map((flag) => flag.byUserId),
    ]);
    const nameOf = (userId: string) => {
      const user = userByKey.get(userId);
      return user?.name || user?.email || "Crew";
    };

    return {
      finished: finished.map((row, index) => ({
        _id: row._id,
        startsAt: row.startsAt,
        origin: row.origin,
        people: (credited[index] ?? []).map((booking) => nameOf(booking.userId)),
        counts: row.finalCounts,
      })),
      lapsed: lapsed.map((row) => ({ _id: row._id, startsAt: row.startsAt })),
      flags: flags.flatMap((flag) => {
        const hash = hashById.get(flag.hashDateId);
        if (!hash) return [];
        const areas = areasByHash.get(hash._id) ?? [];
        const area = areas.find((candidate) => candidate.id === flag.areaId);
        const rows = area ? [...area.kits.flatMap((kit) => kit.rows), ...area.finalChecks] : [];
        return [
          {
            _id: flag._id,
            hashDateId: hash._id,
            hashStartsAt: hash.startsAt,
            areaName: area?.name ?? "Removed area",
            text: rows.find((row) => row.itemKey === flag.itemKey)?.text ?? flag.itemKey,
            reason: flag.flagReason,
            note: flag.note,
            byName: nameOf(flag.byUserId),
            damageReportId: flag.damageReportId,
          },
        ];
      }),
      flagsCapped: flags.length === OPEN_FLAG_TAKE,
    };
  },
});

export const resolveFlag = mutation({
  args: { checkId: v.id("hashChecks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAdminOrOperations(ctx);
    const check = await ctx.db.get(args.checkId);
    if (!check) appError("HASH_FLAG_NOT_FOUND", "This flag no longer exists.");
    if (check.status !== "flagged") appError("HASH_NOT_FLAGGED", "This item isn't flagged.");
    if (check.resolvedAt === undefined) {
      await ctx.db.patch(check._id, { resolvedAt: Date.now(), resolvedBy: getUserId(user) });
    }
    return null;
  },
});

