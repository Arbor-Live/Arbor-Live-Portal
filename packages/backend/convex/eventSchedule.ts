import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireArborInternalContext, requireAuth } from "./lib/auth";
import { requireEventEditAccess } from "./lib/eventAccess";
import {
  scheduleBlocksContentFingerprint,
  scheduleSchedulePublishedEmails,
} from "./email/triggers";
import { pacificDayIndexFromAnchor } from "@arbor/format";
import type { Id } from "./_generated/dataModel";
import {
  actBlockLabel,
  actKey,
  actRefOf,
  deleteScheduleBlock,
  loadAct,
  writeBackActTimes,
  type ActRef,
} from "./lib/runOfShow";
import { scheduleBlockTypeValue, type ScheduleBlockType } from "./lib/scheduleBlockTypes";

export const listByEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    return await ctx.db
      .query("eventScheduleBlocks")
      .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", args.eventId))
      .take(500);
  },
});

export const upsertBlocks = mutation({
  args: {
    eventId: v.id("events"),
    blocks: v.array(
      v.object({
        id: v.optional(v.id("eventScheduleBlocks")),
        clientId: v.optional(v.string()),
        blockType: scheduleBlockTypeValue,
        label: v.string(),
        dayIndex: v.optional(v.number()), // Derived from startsAt on save; omit from clients.
        startsAt: v.number(),
        endsAt: v.number(),
        notes: v.optional(v.string()),
        /** Links a new soundcheck/set to its act. Ignored on existing blocks. */
        participationId: v.optional(v.id("eventBandParticipations")),
        needId: v.optional(v.id("eventArtistNeeds")),
      }),
    ),
    /**
     * Set by the Run of Show editor, which owns act soundcheck/set blocks. Other
     * schedule editors leave it unset so they never edit or delete act blocks —
     * an editor loaded before a Run of Show change cannot overwrite it.
     */
    editsActBlocks: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    await requireEventEditAccess(ctx, args.eventId);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    for (const block of args.blocks) {
      if (block.endsAt <= block.startsAt) {
        throw new Error("Schedule block end must be after start.");
      }
    }
    // Overlapping blocks are allowed: the timeline renders overlaps on
    // separate lanes, so no overlap validation happens here.

    const existing = await ctx.db
      .query("eventScheduleBlocks")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500);
    const existingById = new Map(existing.map((row) => [row._id, row]));
    for (const block of args.blocks) {
      if (block.id && !existingById.has(block.id)) {
        throw new Error("Schedule block does not belong to this event.");
      }
    }
    const editsActBlocks = args.editsActBlocks === true;

    // Validate new act blocks: the act is on this event, the type is an act
    // type, and each act has at most one soundcheck and one set.
    const actNames = new Map<string, string>();
    const actSlots = new Set<string>();
    for (const block of args.blocks) {
      const row = block.id ? existingById.get(block.id) : undefined;
      const act = row ? actRefOf(row) : actRefOf(block);
      if (!act) continue;
      if (!row && !editsActBlocks) {
        throw new Error("Add soundchecks and sets from the Run of Show.");
      }
      const key = actKey(act);
      if (!actNames.has(key)) {
        const loaded = await loadAct(ctx, act);
        if (!loaded || loaded.eventId !== args.eventId) {
          throw new Error("That act is not on this event's lineup.");
        }
        actNames.set(key, loaded.name);
      }
      const blockType = row?.blockType ?? block.blockType;
      if (blockType !== "soundcheck" && blockType !== "set") {
        throw new Error("Only soundchecks and sets can belong to an act.");
      }
      const slotKey = `${key}:${blockType}`;
      if (actSlots.has(slotKey)) {
        throw new Error(`${actNames.get(key)} already has a ${blockType}.`);
      }
      actSlots.add(slotKey);
    }

    const keepIds = new Set(args.blocks.map((b) => b.id).filter(Boolean));
    const touchedActs = new Map<string, ActRef>();
    const now = Date.now();
    for (const row of existing) {
      if (keepIds.has(row._id)) continue;
      const act = actRefOf(row);
      if (act) {
        if (!editsActBlocks) continue;
        touchedActs.set(actKey(act), act);
      }
      await deleteScheduleBlock(ctx, row._id, now);
    }

    const savedBlocks: Array<{
      id: string;
      clientId?: string;
      blockType: ScheduleBlockType;
      label: string;
      dayIndex: number;
      startsAt: number;
      endsAt: number;
      notes?: string;
      participationId?: Id<"eventBandParticipations">;
      needId?: Id<"eventArtistNeeds">;
    }> = [];
    for (const block of args.blocks) {
      const row = block.id ? existingById.get(block.id) : undefined;
      const act = row ? actRefOf(row) : actRefOf(block);
      if (row && act && !editsActBlocks) {
        savedBlocks.push({
          id: row._id,
          clientId: block.clientId,
          blockType: row.blockType,
          label: row.label,
          dayIndex: row.dayIndex,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          notes: row.notes,
          ...act,
        });
        continue;
      }
      // An act block's type and name come from its act, not the client.
      const blockType = row && act ? row.blockType : block.blockType;
      const label =
        act && (blockType === "soundcheck" || blockType === "set")
          ? actBlockLabel(actNames.get(actKey(act)) ?? "Act", blockType)
          : block.label.trim();
      const notes = block.notes?.trim() || undefined;
      // Derived from startsAt vs event start — client day picker removed.
      const dayIndex = pacificDayIndexFromAnchor(event.startAt, block.startsAt);
      if (act) touchedActs.set(actKey(act), act);
      let id: Id<"eventScheduleBlocks">;
      if (row) {
        id = row._id;
        await ctx.db.patch(row._id, {
          blockType,
          label,
          dayIndex,
          startsAt: block.startsAt,
          endsAt: block.endsAt,
          notes,
          updatedAt: now,
        });
      } else {
        id = await ctx.db.insert("eventScheduleBlocks", {
          eventId: args.eventId,
          blockType,
          label,
          dayIndex,
          startsAt: block.startsAt,
          endsAt: block.endsAt,
          notes,
          ...(act ?? {}),
          createdAt: now,
          updatedAt: now,
        });
      }
      savedBlocks.push({
        id,
        clientId: block.clientId,
        blockType,
        label,
        dayIndex,
        startsAt: block.startsAt,
        endsAt: block.endsAt,
        notes,
        ...(act ?? {}),
      });
    }
    for (const act of touchedActs.values()) {
      await writeBackActTimes(ctx, act);
    }
    if (savedBlocks.length > 0) {
      const fingerprint = scheduleBlocksContentFingerprint(savedBlocks);
      await scheduleSchedulePublishedEmails(ctx, args.eventId, fingerprint);
    }

    // Linked shift times are owned by eventCrew.upsertShifts (the web client
    // syncs non-overridden shifts to blocks before saving). Do not force-sync
    // here — that overwrote persisted custom windows when blocks saved first.

    return savedBlocks;
  },
});
