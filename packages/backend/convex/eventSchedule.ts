import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const blockTypeValue = v.union(
  v.literal("setup"),
  v.literal("show"),
  v.literal("strike"),
  v.literal("custom"),
);

export const listByEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
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
        blockType: blockTypeValue,
        label: v.string(),
        dayIndex: v.number(),
        startsAt: v.number(),
        endsAt: v.number(),
        notes: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const block of args.blocks) {
      if (block.endsAt <= block.startsAt) throw new Error("Schedule block end must be after start.");
    }
    const sorted = [...args.blocks].sort((a, b) => a.startsAt - b.startsAt);
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].startsAt < sorted[i - 1].endsAt) {
        throw new Error("Schedule blocks cannot overlap.");
      }
    }

    const existing = await ctx.db
      .query("eventScheduleBlocks")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500);
    const keepIds = new Set(args.blocks.map((b) => b.id).filter(Boolean));
    for (const row of existing) {
      if (!keepIds.has(row._id)) await ctx.db.delete(row._id);
    }

    const now = Date.now();
    for (const block of args.blocks) {
      if (block.id) {
        await ctx.db.patch(block.id, {
          blockType: block.blockType,
          label: block.label.trim(),
          dayIndex: block.dayIndex,
          startsAt: block.startsAt,
          endsAt: block.endsAt,
          notes: block.notes?.trim() || undefined,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("eventScheduleBlocks", {
          eventId: args.eventId,
          blockType: block.blockType,
          label: block.label.trim(),
          dayIndex: block.dayIndex,
          startsAt: block.startsAt,
          endsAt: block.endsAt,
          notes: block.notes?.trim() || undefined,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  },
});
