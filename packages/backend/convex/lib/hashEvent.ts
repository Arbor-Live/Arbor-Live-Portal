import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "./errors";
import { normalizeEventStatus } from "./eventStatus";

/** A hash, not a show: the one test behind every surface that treats hashes differently. */
export function isHashEvent(event: { hashingEnabled?: boolean }) {
  return event.hashingEnabled === true;
}

const HASH_ONE_WRITER = "Hashing sets a hash's date, time and status. Change them there.";

/** Only Hashing moves or closes a hash, and nothing else makes one public or billable. */
export function requireHashEventEdit(
  event: Doc<"events">,
  args: {
    startAt?: number;
    endAt?: number;
    status?: string;
    visibility?: string;
    invoiceId?: unknown;
    additionalInvoiceIds?: readonly unknown[];
    openMicEnabled?: boolean;
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

/**
 * Crew edits on the event page are bookings, so they obey a booking's rules. A
 * hash that's over has its pay and credit settled: only the finish list decides.
 */
export async function requireHashCrewEdit(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
  shifts: readonly { startsAt: number; endsAt: number; crewApplicationId?: unknown }[],
) {
  const row = await ctx.db
    .query("hashDates")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .unique();
  if (row?.status !== "scheduled" && row?.status !== "in_progress") {
    appError("HASH_CREW_CLOSED", "This hash is over, so its crew can't change.");
  }
  if (shifts.some((shift) => shift.crewApplicationId)) {
    appError("HASH_NO_TRAINEES", "A hash doesn't take trainees.");
  }
  if (shifts.some((shift) => shift.startsAt !== row.startsAt || shift.endsAt !== row.endsAt)) {
    appError("HASH_TIMES_FROM_HASHING", HASH_ONE_WRITER);
  }
}
