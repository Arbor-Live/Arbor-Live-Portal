import { pacificDateKey } from "@arbor/format";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { EVENT_TIMEZONE } from "../email/constants";
import { bumpInviteSequence } from "../email/inviteSequence";
import { scheduleCrewScheduledEmails } from "../email/triggers";
import { loadInvoiceCrewRateSettings, resolveUserCompensationHourlyRateUsd } from "./crewCompensation";
import { crewCostNeighborEventIds, syncCrewCostAfterStatusChange, syncEventCrewCostUsd } from "./crewCost";
import { appError } from "./errors";
import { type EventStatus, normalizeEventStatus } from "./eventStatus";
import { hashDateLabel, requireHashEventId } from "./hashingData";
import { recordEventStatusTransition } from "./statusTransitions";

export const HASH_ROLE = "Hash";
/** Stored as-is: every reader normalizes it to `ready`, the end of the pipeline. */
const HASH_FINISHED_EVENT_STATUS = "completed";
const HASH_OPEN_EVENT_STATUS = "scheduling";
/** The section crew attach to. Invites read "Hash — Cleaning (Hash)". */
const HASH_SECTION_LABEL = "Cleaning";
/** A hash has a section block and crew, and nothing else an event offers. */
const HASH_EVENT_TYPE = "Services Only";
const EVENT_SHIFT_TAKE = 500;
const EVENT_BLOCK_TAKE = 500;

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

function isHashSection(block: Doc<"eventScheduleBlocks">) {
  return block.blockType === "custom" && block.label === HASH_SECTION_LABEL;
}

export async function ensureHashSection(ctx: MutationCtx, eventId: Id<"events">, times: Times) {
  const existing = (await loadEventBlocks(ctx, eventId)).find(isHashSection);
  if (existing) return existing._id;
  const now = Date.now();
  return await ctx.db.insert("eventScheduleBlocks", {
    eventId,
    blockType: "custom",
    label: HASH_SECTION_LABEL,
    dayIndex: 0,
    ...times,
    createdAt: now,
    updatedAt: now,
  });
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
  await ensureHashSection(ctx, eventId, times);
  return eventId;
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

/** Real shifts, priced the way any assigned shift is. */
export async function bookHashShifts(ctx: MutationCtx, row: Doc<"hashDates">, userIds: string[]) {
  if (userIds.length === 0) return;
  const eventId = requireHashEventId(row);
  const times = { startsAt: row.startsAt, endsAt: row.endsAt };
  const rateSettings = await loadInvoiceCrewRateSettings(ctx);
  await changeHashCrew(ctx, eventId, async () => {
    const scheduleBlockId = await ensureHashSection(ctx, eventId, times);
    const now = Date.now();
    for (const userId of userIds) {
      const rate = await ctx.db
        .query("userCompensationRates")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .first();
      const hourlyRateUsd = resolveUserCompensationHourlyRateUsd(rate, rateSettings);
      await ctx.db.insert("eventCrewShifts", {
        eventId,
        scheduleBlockId,
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
  });
}

export async function clearHashShifts(ctx: MutationCtx, eventId: Id<"events">, keep?: (shift: Doc<"eventCrewShifts">) => boolean) {
  await changeHashCrew(ctx, eventId, async (shifts) => {
    for (const shift of shifts) {
      if (!keep?.(shift)) await ctx.db.delete(shift._id);
    }
  });
}

/** The one place a hash's times reach its event, section and shifts. */
export async function moveHashEvent(
  ctx: MutationCtx,
  row: Pick<Doc<"hashDates">, "eventId" | "startsAt">,
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
      const blocks = await loadEventBlocks(ctx, eventId);
      const section = blocks.find(isHashSection);
      for (const block of blocks) {
        await ctx.db.patch(block._id, {
          startsAt: block.startsAt + delta,
          endsAt: block._id === section?._id ? next.endsAt : block.endsAt + delta,
          updatedAt: now,
        });
      }
      for (const shift of shifts) {
        const times = {
          startsAt: shift.startsAt + delta,
          endsAt: shift.scheduleBlockId === section?._id ? next.endsAt : shift.endsAt + delta,
        };
        await ctx.db.patch(shift._id, {
          ...times,
          hours: shiftHours(times),
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
