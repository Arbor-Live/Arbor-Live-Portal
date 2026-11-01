import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "./errors";
import { normalizeEventStatus } from "./eventStatus";
import { hashDateLabel, loadDateForEvent, requireBookingRules, requireHashingViewer } from "./hashingData";
import { HASH_ROLE } from "./hashingValues";

/** A hash, not a show: the one test behind every surface that treats hashes differently. */
export function isHashEvent(event: { hashingEnabled?: boolean }) {
  return event.hashingEnabled === true;
}

const HASH_ONE_WRITER = "Hashing sets a hash's date, time and status. Change them there.";
/** Same cap as `eventCrew.upsertShifts`, which reads these rows right after. */
const HASH_SHIFT_TAKE = 500;

/**
 * Only Hashing moves or closes a hash, and nothing else makes one public or
 * billable. An event Hashing made gets its location from Setup; an add-on's event
 * keeps its own venue.
 */
export async function requireHashEventEdit(
  ctx: QueryCtx | MutationCtx,
  event: Doc<"events">,
  args: {
    startAt?: number;
    endAt?: number;
    status?: string;
    visibility?: string;
    invoiceId?: unknown;
    additionalInvoiceIds?: readonly unknown[];
    openMicEnabled?: boolean;
    venueId?: unknown;
  },
) {
  if ((args.startAt ?? event.startAt) !== event.startAt || (args.endAt ?? event.endAt) !== event.endAt) {
    appError("HASH_TIMES_FROM_HASHING", HASH_ONE_WRITER);
  }
  requireHashStatusUnchanged(event, args.status);
  if ((args.visibility ?? event.visibility) !== event.visibility) {
    appError("HASH_STAYS_INTERNAL", "A hash stays internal.");
  }
  if (args.invoiceId || args.additionalInvoiceIds?.length) {
    appError("HASH_NO_INVOICE", "A hash can't have an invoice.");
  }
  if (args.openMicEnabled) appError("HASH_NO_OPEN_MIC", "A hash can't take public sign-ups.");
  if (args.venueId !== undefined && (await loadDateForEvent(ctx, event._id))?.origin !== "addon") {
    appError("HASH_LOCATION_FROM_HASHING", "A hash's location comes from Hashing. Change it in Setup.");
  }
}

export function requireHashStatusUnchanged(event: Doc<"events">, status: string | undefined) {
  if (status !== undefined && normalizeEventStatus(status) !== normalizeEventStatus(event.status)) {
    appError("HASH_STATUS_FROM_HASHING", HASH_ONE_WRITER);
  }
}

/** Blocks may change their labels and notes; their type, times and number belong to Hashing. */
export function requireHashBlocksUnchanged(
  existing: readonly Doc<"eventScheduleBlocks">[],
  next: readonly { id?: Id<"eventScheduleBlocks">; blockType: string; startsAt: number; endsAt: number }[],
) {
  const byId = new Map(existing.map((block) => [block._id, block]));
  const same =
    existing.length === next.length &&
    next.every((block) => {
      const current = block.id ? byId.get(block.id) : undefined;
      return (
        current?.blockType === block.blockType &&
        current.startsAt === block.startsAt &&
        current.endsAt === block.endsAt
      );
    });
  if (!same) appError("HASH_TIMES_FROM_HASHING", HASH_ONE_WRITER);
}

type HashCrewShift = {
  id?: Id<"eventCrewShifts">;
  role: string;
  userId?: string;
  startsAt: number;
  endsAt: number;
  crewApplicationId?: unknown;
};

function sameCrew(existing: readonly Doc<"eventCrewShifts">[], next: readonly HashCrewShift[]) {
  const byId = new Map(existing.map((shift) => [shift._id, shift]));
  return (
    existing.length === next.length &&
    next.every((shift) => {
      const current = shift.id ? byId.get(shift.id) : undefined;
      return (
        current?.userId === (shift.userId?.trim() || undefined) &&
        current?.role === shift.role.trim() &&
        current?.startsAt === shift.startsAt &&
        current?.endsAt === shift.endsAt
      );
    })
  );
}

/**
 * Crew edits on the event page are bookings, so they obey a booking's rules, and
 * the shifts to save come back as bookings: the `Hash` role on the hash's section.
 * Once a hash is over its pay and credit are settled, so a save carrying the same
 * crew returns null, for the caller to write nothing, and any change is refused.
 * A running hash takes a walk-in from ops, past its spots, because they're here.
 */
export async function requireHashCrewEdit<Shift extends HashCrewShift>(
  ctx: MutationCtx,
  eventId: Id<"events">,
  shifts: readonly Shift[],
) {
  const row = await loadDateForEvent(ctx, eventId);
  const existing = await ctx.db
    .query("eventCrewShifts")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(HASH_SHIFT_TAKE);
  if (row?.status !== "scheduled" && row?.status !== "in_progress") {
    if (sameCrew(existing, shifts)) return null;
    if (row?.status === "off") {
      appError("HASH_DATE_OFF", "This date is off, so it can't take crew. Switch it back on in Hashing first.");
    }
    appError("HASH_CREW_CLOSED", "This hash is over, so its crew can't change here. Correct it in Hashing History.");
  }
  if (shifts.some((shift) => shift.crewApplicationId)) {
    appError("HASH_NO_TRAINEES", "A hash doesn't take trainees.");
  }
  if (shifts.some((shift) => shift.startsAt !== row.startsAt || shift.endsAt !== row.endsAt)) {
    appError("HASH_TIMES_FROM_HASHING", HASH_ONE_WRITER);
  }
  const userIds = shifts.map((shift) => shift.userId?.trim());
  if (userIds.some((userId) => !userId)) {
    appError("HASH_NO_OPEN_SLOTS", "A hash books people, so it can't have an open slot.");
  }
  if (new Set(userIds).size < userIds.length) appError("HASH_ALREADY_BOOKED", "Someone is on this hash twice.");

  const onHash = new Set(existing.map((shift) => shift.userId));
  const newcomers = userIds.filter((userId) => userId !== undefined && !onHash.has(userId));
  if (newcomers.length > 0) {
    if (row.status === "in_progress") {
      if (!(await requireHashingViewer(ctx)).canManage) {
        appError("HASH_WALK_IN_OPS", "Only ops can add someone to a running hash.");
      }
    } else if (userIds.length > row.capacity) {
      appError("HASH_FULL", `${hashDateLabel(row)} holds ${row.capacity}, and this crew has ${userIds.length}.`);
    }
  }
  for (const userId of newcomers) {
    if (userId) await requireBookingRules(ctx, row, userId, null);
  }
  return shifts.map((shift) => ({
    ...shift,
    role: HASH_ROLE,
    scheduleBlockId: row.sectionBlockId,
    callTime: undefined,
  }));
}
