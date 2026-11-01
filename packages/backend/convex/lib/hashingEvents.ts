import { pacificDateKey } from "@arbor/format";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { EVENT_TIMEZONE } from "../email/constants";
import { bumpInviteSequence } from "../email/inviteSequence";
import { scheduleCrewScheduledEmails } from "../email/triggers";
import { loadInvoiceCrewRateSettings, resolveUserCompensationHourlyRateUsd } from "./crewCompensation";
import { crewCostNeighborEventIds, syncCrewCostAfterStatusChange, syncEventCrewCostUsd } from "./crewCost";
import { deleteEventRecord } from "./bookingChainDelete";
import { appError } from "./errors";
import { type EventStatus, normalizeEventStatus } from "./eventStatus";
import { normalizeEventVisibility } from "./eventVisibility";
import { hashDateLabel, loadDateBookings, requireHashEventId } from "./hashingData";
import { HASH_ROLE } from "./hashingValues";
import { recordEventStatusTransition } from "./statusTransitions";

/** Stored as-is: every reader normalizes it to `ready`, the end of the pipeline. */
const HASH_FINISHED_EVENT_STATUS = "completed";
const HASH_OPEN_EVENT_STATUS = "scheduling";
/** The section's first name. Invites read "Hash — Cleaning (Hash)". Ops can rename it. */
const HASH_SECTION_LABEL = "Cleaning";
/** A hash has a section block and crew, and nothing else an event offers. */
const HASH_EVENT_TYPE = "Services Only";
const EVENT_SHIFT_TAKE = 500;
const EVENT_BLOCK_TAKE = 500;
/** A few emails per person per change, on a hash of a handful of people. */
const EVENT_EMAIL_TAKE = 500;

type Times = { startsAt: number; endsAt: number };

function shiftHours({ startsAt, endsAt }: Times) {
  return Number(((endsAt - startsAt) / 3_600_000).toFixed(2));
}

async function loadEventShifts(ctx: MutationCtx, eventId: Id<"events">) {
  return await ctx.db
    .query("eventCrewShifts")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(EVENT_SHIFT_TAKE);
}

async function loadEventBlocks(ctx: MutationCtx, eventId: Id<"events">) {
  return await ctx.db
    .query("eventScheduleBlocks")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(EVENT_BLOCK_TAKE);
}

async function insertHashSection(ctx: MutationCtx, eventId: Id<"events">, times: Times) {
  const now = Date.now();
  return await ctx.db.insert("eventScheduleBlocks", {
    eventId,
    blockType: "custom",
    label: HASH_SECTION_LABEL,
    dayIndex: 0,
    startsAt: times.startsAt,
    endsAt: times.endsAt,
    createdAt: now,
    updatedAt: now,
  });
}

/** The event's one custom section takes on the hash's times, or it gets a new one. */
export async function adoptHashSection(ctx: MutationCtx, eventId: Id<"events">, times: Times) {
  const [section] = await loadEventBlocks(ctx, eventId);
  if (!section) return await insertHashSection(ctx, eventId, times);
  const { startsAt, endsAt } = times;
  await ctx.db.patch(section._id, { startsAt, endsAt, dayIndex: 0, updatedAt: Date.now() });
  return section._id;
}

/**
 * Hashing owns a hash's crew and schedule, so an event brings neither: no shift
 * of any kind, and at most one custom section. Every later guard relies on it.
 */
export async function requireAttachable(ctx: MutationCtx, event: Doc<"events">) {
  if (normalizeEventVisibility(event.visibility) !== "internal") {
    appError("HASH_EVENT_NOT_INTERNAL", "Hashing only runs on internal events. Set this event to Internal first.");
  }
  if (normalizeEventStatus(event.status) === "cancelled") {
    appError("HASH_EVENT_CANCELLED", "This event is cancelled.");
  }
  if (event.seriesId) appError("HASH_EVENT_IN_SERIES", "A day in a series or booking can't be a hash.");
  if (event.openMicEnabled) appError("HASH_NO_OPEN_MIC", "Turn Open Mic off first: a hash can't take public sign-ups.");
  const links = await ctx.db
    .query("eventInvoiceLinks")
    .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
    .take(1);
  if (event.invoiceId || links.length > 0) {
    appError("HASH_EVENT_HAS_INVOICE", "A hash can't have an invoice. Unlink it first.");
  }
  if ((await loadEventShifts(ctx, event._id)).length > 0) {
    appError("HASH_EVENT_HAS_CREW", "This event has crew. Remove its crew first: a hash's only crew are its bookings.");
  }
  const blocks = await loadEventBlocks(ctx, event._id);
  if (blocks.length > 1 || blocks.some((block) => block.blockType !== "custom")) {
    appError("HASH_EVENT_HAS_SCHEDULE", "This event has a schedule. Clear its schedule first: a hash has one section.");
  }
}

/** An internal event with no invoice, one section, and a location that's just a name. */
export async function insertHashEvent(ctx: MutationCtx, times: Times, location: string | undefined) {
  const now = Date.now();
  const eventId = await ctx.db.insert("events", {
    title: HASH_ROLE,
    status: HASH_OPEN_EVENT_STATUS,
    visibility: "internal",
    startAt: times.startsAt,
    endAt: times.endsAt,
    timezone: EVENT_TIMEZONE,
    spansMultipleDays: pacificDateKey(times.startsAt) !== pacificDateKey(times.endsAt),
    setupOnly: false,
    strikeOnly: false,
    requiresShowWindow: false,
    venueName: location,
    eventType: HASH_EVENT_TYPE,
    hashingEnabled: true,
    createdAt: now,
    updatedAt: now,
  });
  return { eventId, sectionBlockId: await insertHashSection(ctx, eventId, times) };
}

/**
 * Every change to a hash's shifts goes through here, so a booking costs and
 * notifies exactly as any crew assignment does. Batch a whole date's changes
 * into one call: it's one invite revision, and each person gets one email.
 */
export async function changeHashCrew(
  ctx: MutationCtx,
  eventId: Id<"events">,
  edit: (shifts: Doc<"eventCrewShifts">[]) => Promise<void>,
  options?: { scheduledSubject?: string },
) {
  const previous = await loadEventShifts(ctx, eventId);
  const previousNeighborEventIds = await crewCostNeighborEventIds(ctx, eventId);
  await edit(previous);
  await syncEventCrewCostUsd(ctx, eventId, Date.now(), { previousNeighborEventIds });
  await scheduleCrewScheduledEmails(
    ctx,
    eventId,
    previous,
    await loadEventShifts(ctx, eventId),
    await bumpInviteSequence(ctx, eventId),
    options,
  );
}

/** Real shifts, priced the way any assigned shift is. Runs inside `changeHashCrew`. */
async function insertHashShifts(ctx: MutationCtx, row: Doc<"hashDates">, userIds: string[]) {
  const eventId = requireHashEventId(row);
  const times = { startsAt: row.startsAt, endsAt: row.endsAt };
  const rateSettings = await loadInvoiceCrewRateSettings(ctx);
  const now = Date.now();
  for (const userId of userIds) {
    const rate = await ctx.db
      .query("userCompensationRates")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    const hourlyRateUsd = resolveUserCompensationHourlyRateUsd(rate, rateSettings);
    await ctx.db.insert("eventCrewShifts", {
      eventId,
      scheduleBlockId: row.sectionBlockId,
      role: HASH_ROLE,
      userId,
      ...times,
      hours: shiftHours(times),
      estimatedHourlyRateUsd: hourlyRateUsd > 0 ? hourlyRateUsd : undefined,
      postedToExpense: false,
      createdAt: now,
      updatedAt: now,
    });
  }
}

export async function bookHashShifts(ctx: MutationCtx, row: Doc<"hashDates">, userIds: string[]) {
  if (userIds.length === 0) return;
  await changeHashCrew(ctx, requireHashEventId(row), () => insertHashShifts(ctx, row, userIds));
}

/**
 * Who was there, final: each person named has one settled shift, so they get
 * credit and pay, and everyone else loses theirs.
 */
export async function settleHashAttendance(
  ctx: MutationCtx,
  row: Doc<"hashDates">,
  attendeeUserIds: string[],
  options?: { scheduledSubject?: string },
) {
  const attendees = new Set(attendeeUserIds);
  const bookings = await loadDateBookings(ctx, row);
  const booked = new Set(bookings.map((booking) => booking.userId));
  await changeHashCrew(
    ctx,
    requireHashEventId(row),
    async () => {
      for (const booking of bookings) {
        for (const shiftId of booking.shiftIds) {
          if (attendees.has(booking.userId)) await ctx.db.patch(shiftId, { needsConfirmation: undefined });
          else await ctx.db.delete(shiftId);
        }
      }
      await insertHashShifts(ctx, row, [...attendees].filter((userId) => !booked.has(userId)));
    },
    options,
  );
}

export async function clearHashShifts(ctx: MutationCtx, eventId: Id<"events">, keep?: (shift: Doc<"eventCrewShifts">) => boolean) {
  await changeHashCrew(ctx, eventId, async (shifts) => {
    for (const shift of shifts) {
      if (!keep?.(shift)) await ctx.db.delete(shift._id);
    }
  });
}

/**
 * Gone for good, so no cancelled husk reaches a list. The delete wipes the
 * event's emails, so queued removal notices let go of the event first.
 */
export async function deleteHashEvent(ctx: MutationCtx, eventId: Id<"events">) {
  await clearHashShifts(ctx, eventId);
  const emails = await ctx.db
    .query("emailNotifications")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(EVENT_EMAIL_TAKE);
  for (const email of emails) {
    if (email.status === "queued") await ctx.db.patch(email._id, { eventId: undefined });
  }
  await deleteEventRecord(ctx, eventId);
}

/** The one place a hash's times reach its event, section and shifts. */
export async function moveHashEvent(
  ctx: MutationCtx,
  row: Pick<Doc<"hashDates">, "eventId" | "sectionBlockId" | "startsAt">,
  next: Times,
  options: { reconfirm: boolean },
) {
  const { eventId } = row;
  if (!eventId) return;
  const moved = next.startsAt !== row.startsAt;
  const delta = next.startsAt - row.startsAt;
  const now = Date.now();
  await changeHashCrew(
    ctx,
    eventId,
    async (shifts) => {
      await ctx.db.patch(eventId, {
        startAt: next.startsAt,
        endAt: next.endsAt,
        spansMultipleDays: pacificDateKey(next.startsAt) !== pacificDateKey(next.endsAt),
        updatedAt: now,
      });
      for (const block of await loadEventBlocks(ctx, eventId)) {
        await ctx.db.patch(block._id, {
          startsAt: block.startsAt + delta,
          endsAt: block._id === row.sectionBlockId ? next.endsAt : block.endsAt + delta,
          updatedAt: now,
        });
      }
      for (const shift of shifts) {
        await ctx.db.patch(shift._id, {
          ...next,
          hours: shiftHours(next),
          needsConfirmation: options.reconfirm && shift.userId ? true : shift.needsConfirmation,
          updatedAt: now,
        });
      }
    },
    moved ? { scheduledSubject: `Hash moved: ${hashDateLabel(next)}. Can you still make it?` } : undefined,
  );
}

async function setHashEventStatus(ctx: MutationCtx, eventId: Id<"events">, status: EventStatus | "completed") {
  const event = await ctx.db.get(eventId);
  if (!event) appError("EVENT_NOT_FOUND", "This hash's event no longer exists.");
  const prevStatus = normalizeEventStatus(event.status);
  const nextStatus = normalizeEventStatus(status);
  const now = Date.now();
  await ctx.db.patch(eventId, { status, updatedAt: now });
  if (prevStatus === nextStatus) return;
  await recordEventStatusTransition(ctx, eventId, prevStatus, nextStatus, { at: now });
  await syncCrewCostAfterStatusChange(ctx, eventId, prevStatus, nextStatus, now);
}

/** Crew are told by their `crew_unscheduled` invites, so no `event_cancelled` email. */
export async function cancelHashEvent(ctx: MutationCtx, eventId: Id<"events">) {
  await setHashEventStatus(ctx, eventId, "cancelled");
}

export async function reopenHashEvent(ctx: MutationCtx, eventId: Id<"events">) {
  await setHashEventStatus(ctx, eventId, HASH_OPEN_EVENT_STATUS);
}

export async function completeHashEvent(ctx: MutationCtx, eventId: Id<"events">) {
  await setHashEventStatus(ctx, eventId, HASH_FINISHED_EVENT_STATUS);
}

/**
 * A lapsed hash that did happen. An add-on's event has been a plain event since,
 * so it has to still be the same bare event at the same time to become a hash again.
 */
export async function reviveLapsedHash(ctx: MutationCtx, row: Doc<"hashDates">) {
  const eventId = requireHashEventId(row);
  if (row.origin === "addon") {
    const event = await ctx.db.get(eventId);
    if (!event) appError("EVENT_NOT_FOUND", "This hash's event no longer exists.");
    await requireAttachable(ctx, event);
    if (event.startAt !== row.startsAt || event.endAt !== row.endsAt) {
      appError("HASH_EVENT_MOVED", "This event has moved since its hash lapsed, so the hash can't be marked as done.");
    }
    await ctx.db.patch(eventId, { hashingEnabled: true, updatedAt: Date.now() });
    await ctx.db.patch(row._id, { sectionBlockId: await adoptHashSection(ctx, eventId, row) });
  }
  await completeHashEvent(ctx, eventId);
}
