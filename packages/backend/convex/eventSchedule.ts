import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireArborInternalContext, requireAuth } from "./lib/auth";
import { requireEventEditAccess } from "./lib/eventAccess";
import {
  scheduleBlocksContentFingerprint,
  scheduleSchedulePublishedEmails,
} from "./email/triggers";
import { pacificDayIndexFromAnchor } from "@arbor/format";

const blockTypeValue = v.union(
  v.literal("setup"),
  v.literal("show"),
  v.literal("strike"),
  v.literal("custom"),
);

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
        blockType: blockTypeValue,
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
    const existingIds = new Set(existing.map((row) => row._id));
    for (const block of args.blocks) {
      if (block.id && !existingIds.has(block.id)) {
        throw new Error("Schedule block does not belong to this event.");
      }
    }
    const keepIds = new Set(args.blocks.map((b) => b.id).filter(Boolean));
    for (const row of existing) {
      if (!keepIds.has(row._id)) await ctx.db.delete(row._id);
    }

    const now = Date.now();
    const savedBlocks: Array<{
      id: string;
      clientId?: string;
      blockType: "setup" | "show" | "strike" | "custom";
      label: string;
      dayIndex: number;
      startsAt: number;
      endsAt: number;
      notes?: string;
    }> = [];
    for (const block of args.blocks) {
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

    // Keep linked crew shifts aligned with their schedule blocks.
    for (const block of savedBlocks) {
      const linkedShifts = await ctx.db
        .query("eventCrewShifts")
        .withIndex("by_scheduleBlockId", (q) =>
          q.eq("scheduleBlockId", block.id as Id<"eventScheduleBlocks">),
        )
        .take(200);
      for (const shift of linkedShifts) {
        if (shift.eventId !== args.eventId) continue;
        const hours = Number(((block.endsAt - block.startsAt) / 3_600_000).toFixed(2));
        await ctx.db.patch(shift._id, {
          startsAt: block.startsAt,
          endsAt: block.endsAt,
          hours,
          updatedAt: now,
        });
      }
    }

    return savedBlocks;
  },
});
