import { pacificDayIndexFromAnchor } from "@arbor/format";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { scheduleBandTimeEmails } from "../email/bandScheduleEmails";
import { resolveBandName } from "./bandIdentity";
import type { ActBlockType } from "./scheduleBlockTypes";

/**
 * Run of show: an act's soundcheck and set live as `soundcheck` / `set` schedule
 * blocks linked to the act, so the brief prints one timeline. The Run of Show
 * editor owns these blocks (`eventSchedule.upsertBlocks` with `editsActBlocks`)
 * and writes their times back to the lineup fields via `writeBackActTimes`, which
 * the band dashboard still reads. Lineup-side writers call
 * `syncParticipationBlocks` / `syncNeedBlocks` to go the other way. Every write
 * to (or removal of) a platform act's times also calls `scheduleBandTimeEmails`,
 * which sends the band's calendar invites.
 */

export type ActRef =
  | { participationId: Id<"eventBandParticipations"> }
  | { needId: Id<"eventArtistNeeds"> };

type Window = { startsAt: number; endsAt: number };

const BLOCK_SUFFIX: Record<ActBlockType, string> = {
  soundcheck: "soundcheck",
  set: "set",
};

export function actBlockLabel(actName: string, blockType: ActBlockType) {
  return `${actName} ${BLOCK_SUFFIX[blockType]}`;
}

export function actRefOf(
  block: Pick<Doc<"eventScheduleBlocks">, "participationId" | "needId">,
): ActRef | null {
  if (block.participationId) return { participationId: block.participationId };
  if (block.needId) return { needId: block.needId };
  return null;
}

export function actKey(act: ActRef) {
  return "participationId" in act ? `p:${act.participationId}` : `n:${act.needId}`;
}

/** The act's display name and event, or null when the act is gone. */
export async function loadAct(ctx: MutationCtx, act: ActRef) {
  if ("participationId" in act) {
    const row = await ctx.db.get(act.participationId);
    if (!row) return null;
    return { eventId: row.eventId, name: await resolveBandName(ctx, row.organizationId) };
  }
  const slot = await ctx.db.get(act.needId);
  if (!slot) return null;
  return {
    eventId: slot.eventId,
    name: slot.externalArtistName?.trim() || slot.label?.trim() || "TBA",
  };
}

export function isActBlock(block: Pick<Doc<"eventScheduleBlocks">, "participationId" | "needId">) {
  return Boolean(block.participationId || block.needId);
}

function hoursBetween(start: number, end: number) {
  return Number(((end - start) / 3_600_000).toFixed(2));
}

function windowOf(startsAt: number | undefined, endsAt: number | undefined): Window | null {
  if (startsAt == null || endsAt == null || endsAt <= startsAt) return null;
  return { startsAt, endsAt };
}

async function listActBlocks(ctx: MutationCtx, act: ActRef) {
  if ("participationId" in act) {
    return await ctx.db
      .query("eventScheduleBlocks")
      .withIndex("by_participationId", (q) => q.eq("participationId", act.participationId))
      .take(20);
  }
  return await ctx.db
    .query("eventScheduleBlocks")
    .withIndex("by_needId", (q) => q.eq("needId", act.needId))
    .take(20);
}

/**
 * Delete a schedule block, detaching its shifts instead of leaving a dangling
 * `scheduleBlockId`: the schedule tab only renders shifts it can match to a
 * block, so an orphaned reference hides the shift while it still counts as an
 * open slot. Detached shifts surface as unlinked.
 */
export async function deleteScheduleBlock(
  ctx: MutationCtx,
  blockId: Id<"eventScheduleBlocks">,
  now = Date.now(),
) {
  const linkedShifts = await ctx.db
    .query("eventCrewShifts")
    .withIndex("by_scheduleBlockId", (q) => q.eq("scheduleBlockId", blockId))
    .take(500);
  for (const shift of linkedShifts) {
    await ctx.db.patch(shift._id, { scheduleBlockId: undefined, updatedAt: now });
  }
  await ctx.db.delete(blockId);
}

/** Crew on a block follow it when it moves, unless their times were customized. */
async function moveBlockShifts(
  ctx: MutationCtx,
  blockId: Id<"eventScheduleBlocks">,
  window: Window,
  now: number,
) {
  const shifts = await ctx.db
    .query("eventCrewShifts")
    .withIndex("by_scheduleBlockId", (q) => q.eq("scheduleBlockId", blockId))
    .take(500);
  for (const shift of shifts) {
    if (shift.timesOverridden) continue;
    await ctx.db.patch(shift._id, {
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      hours: hoursBetween(window.startsAt, window.endsAt),
      updatedAt: now,
    });
  }
}

async function syncActBlocks(
  ctx: MutationCtx,
  args: {
    eventId: Id<"events">;
    act: ActRef;
    actName: string;
    windows: Record<ActBlockType, Window | null>;
  },
) {
  const event = await ctx.db.get(args.eventId);
  if (!event) return;
  const now = Date.now();
  const existing = await listActBlocks(ctx, args.act);

  for (const blockType of ["soundcheck", "set"] as const) {
    const window = args.windows[blockType];
    const matches = existing.filter((row) => row.blockType === blockType);
    const [current, ...duplicates] = matches;
    for (const duplicate of duplicates) {
      await deleteScheduleBlock(ctx, duplicate._id, now);
    }
    if (!window) {
      if (current) await deleteScheduleBlock(ctx, current._id, now);
      continue;
    }
    const label = actBlockLabel(args.actName, blockType);
    const dayIndex = pacificDayIndexFromAnchor(event.startAt, window.startsAt);
    if (!current) {
      await ctx.db.insert("eventScheduleBlocks", {
        eventId: args.eventId,
        blockType,
        label,
        dayIndex,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        ...args.act,
        createdAt: now,
        updatedAt: now,
      });
      continue;
    }
    const moved = current.startsAt !== window.startsAt || current.endsAt !== window.endsAt;
    if (!moved && current.label === label && current.dayIndex === dayIndex) continue;
    await ctx.db.patch(current._id, {
      label,
      dayIndex,
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      updatedAt: now,
    });
    if (moved) await moveBlockShifts(ctx, current._id, window, now);
  }
}

/** Mirror a platform act's lineup times into its run-of-show blocks. */
export async function syncParticipationBlocks(
  ctx: MutationCtx,
  participationId: Id<"eventBandParticipations">,
) {
  const row = await ctx.db.get(participationId);
  if (!row) {
    await deleteActBlocks(ctx, { participationId });
    return;
  }
  await syncActBlocks(ctx, {
    eventId: row.eventId,
    act: { participationId },
    actName: await resolveBandName(ctx, row.organizationId),
    windows: {
      soundcheck: windowOf(row.soundcheckStartsAt, row.soundcheckEndsAt),
      set: windowOf(row.setStartsAt, row.setEndsAt),
    },
  });
}

/**
 * Mirror a lineup position's own times. Those only apply while no platform act
 * fills the position (the act's times win), so a filled position has no blocks.
 */
export async function syncNeedBlocks(ctx: MutationCtx, needId: Id<"eventArtistNeeds">) {
  const slot = await ctx.db.get(needId);
  const filled = slot
    ? await ctx.db
        .query("eventBandParticipations")
        .withIndex("by_needId", (q) => q.eq("needId", needId))
        .first()
    : null;
  if (!slot || filled) {
    await deleteActBlocks(ctx, { needId });
    return;
  }
  await syncActBlocks(ctx, {
    eventId: slot.eventId,
    act: { needId },
    actName: slot.externalArtistName?.trim() || slot.label?.trim() || "TBA",
    windows: {
      soundcheck: windowOf(slot.soundcheckStartsAt, slot.soundcheckEndsAt),
      set: windowOf(slot.setStartsAt, slot.setEndsAt),
    },
  });
}

/**
 * The Run of Show edited this act's blocks: copy their windows onto the lineup
 * fields (the band dashboard and artist portal still read those). Uses
 * `replace` because `patch` ignores `undefined` and could not clear a field.
 */
export async function writeBackActTimes(ctx: MutationCtx, act: ActRef) {
  const blocks = await listActBlocks(ctx, act);
  const windowFor = (type: ActBlockType) => {
    const block = blocks.find((row) => row.blockType === type);
    return block ? { startsAt: block.startsAt, endsAt: block.endsAt } : null;
  };
  const soundcheck = windowFor("soundcheck");
  const set = windowFor("set");
  const apply = <T extends Doc<"eventBandParticipations"> | Doc<"eventArtistNeeds">>(row: T): T => {
    const next = { ...row, updatedAt: Date.now() };
    delete next.soundcheckStartsAt;
    delete next.soundcheckEndsAt;
    delete next.setStartsAt;
    delete next.setEndsAt;
    if (soundcheck) {
      next.soundcheckStartsAt = soundcheck.startsAt;
      next.soundcheckEndsAt = soundcheck.endsAt;
    }
    if (set) {
      next.setStartsAt = set.startsAt;
      next.setEndsAt = set.endsAt;
    }
    return next;
  };
  if ("participationId" in act) {
    const row = await ctx.db.get(act.participationId);
    if (!row) return;
    const next = apply(row);
    await ctx.db.replace(row._id, next);
    await scheduleBandTimeEmails(ctx, row, next);
    return;
  }
  const slot = await ctx.db.get(act.needId);
  if (slot) await ctx.db.replace(slot._id, apply(slot));
}

/**
 * A platform act taking a lineup position inherits the position's run-of-show
 * times when it has none of its own, so a Run of Show built around an open
 * slot survives the booking.
 */
export async function inheritSlotTimes(
  ctx: MutationCtx,
  participationId: Id<"eventBandParticipations">,
  needId: Id<"eventArtistNeeds">,
) {
  const [row, slot] = await Promise.all([ctx.db.get(participationId), ctx.db.get(needId)]);
  if (!row || !slot) return;
  const rowHasTimes = row.setStartsAt != null || row.soundcheckStartsAt != null;
  const slotHasTimes = slot.setStartsAt != null || slot.soundcheckStartsAt != null;
  if (rowHasTimes || !slotHasTimes) return;
  const next = { ...row, updatedAt: Date.now() };
  if (slot.setStartsAt != null && slot.setEndsAt != null) {
    next.setStartsAt = slot.setStartsAt;
    next.setEndsAt = slot.setEndsAt;
  }
  if (slot.soundcheckStartsAt != null && slot.soundcheckEndsAt != null) {
    next.soundcheckStartsAt = slot.soundcheckStartsAt;
    next.soundcheckEndsAt = slot.soundcheckEndsAt;
  }
  await ctx.db.replace(row._id, next);
  await scheduleBandTimeEmails(ctx, row, next);
}

export async function deleteActBlocks(ctx: MutationCtx, act: ActRef) {
  const now = Date.now();
  for (const block of await listActBlocks(ctx, act)) {
    await deleteScheduleBlock(ctx, block._id, now);
  }
}
