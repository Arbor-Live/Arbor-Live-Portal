import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireArborInternalContext, requireAuth } from "./lib/auth";
import { requireEventEditAccess } from "./lib/eventAccess";
import {
  scheduleBlocksContentFingerprint,
  scheduleSchedulePublishedEmails,
} from "./email/triggers";
import { pacificDayIndexFromAnchor } from "@arbor/format";
import { deleteScheduleBlock, isActBlock } from "./lib/runOfShow";
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
      }),
    ),
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
    const keepIds = new Set(args.blocks.map((b) => b.id).filter(Boolean));
    const now = Date.now();
    for (const row of existing) {
      // An act's soundcheck/set blocks are owned by the lineup, so a schedule
      // save — possibly from an editor loaded before the lineup changed — never
      // edits or removes them.
      if (keepIds.has(row._id) || isActBlock(row)) continue;
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
      /** An act's soundcheck/set block; the client keeps it read-only. */
      actOwned?: boolean;
    }> = [];
    for (const block of args.blocks) {
      const actRow = block.id ? existingById.get(block.id) : undefined;
      if (actRow && isActBlock(actRow)) {
        savedBlocks.push({
          id: actRow._id,
          clientId: block.clientId,
          blockType: actRow.blockType,
          label: actRow.label,
          dayIndex: actRow.dayIndex,
          startsAt: actRow.startsAt,
          endsAt: actRow.endsAt,
          notes: actRow.notes,
          actOwned: true,
        });
        continue;
      }
      const label = block.label.trim();
      const notes = block.notes?.trim() || undefined;
      // Derived from startsAt vs event start — client day picker removed.
      const dayIndex = pacificDayIndexFromAnchor(event.startAt, block.startsAt);
      if (block.id) {
        await ctx.db.patch(block.id, {
          blockType: block.blockType,
          label,
          dayIndex,
          startsAt: block.startsAt,
          endsAt: block.endsAt,
          notes,
          updatedAt: now,
        });
        savedBlocks.push({
          id: block.id,
          clientId: block.clientId,
          blockType: block.blockType,
          label,
          dayIndex,
          startsAt: block.startsAt,
          endsAt: block.endsAt,
          notes,
        });
      } else {
        const insertedId = await ctx.db.insert("eventScheduleBlocks", {
          eventId: args.eventId,
          blockType: block.blockType,
          label,
          dayIndex,
          startsAt: block.startsAt,
          endsAt: block.endsAt,
          notes,
          createdAt: now,
          updatedAt: now,
        });
        savedBlocks.push({
          id: insertedId,
          clientId: block.clientId,
          blockType: block.blockType,
          label,
          dayIndex,
          startsAt: block.startsAt,
          endsAt: block.endsAt,
          notes,
        });
      }
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
