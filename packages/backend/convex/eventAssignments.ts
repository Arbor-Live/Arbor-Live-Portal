import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireArborInternalContext, requireAuth } from "./lib/auth";
import { requireEventEditAccess } from "./lib/eventAccess";

const assignmentTypeValue = v.union(
  v.literal("event_manager"),
  v.literal("day_of_lead"),
  v.literal("crew"),
  v.literal("performer"),
  v.literal("support"),
  v.literal("contact"),
);

export const listByEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    return await ctx.db
      .query("eventPeopleAssignments")
      .withIndex("by_eventId_and_assignmentType", (q) => q.eq("eventId", args.eventId))
      .take(500);
  },
});

export const upsertAssignments = mutation({
  args: {
    eventId: v.id("events"),
    assignments: v.array(
      v.object({
        id: v.optional(v.id("eventPeopleAssignments")),
        assignmentType: assignmentTypeValue,
        roleLabel: v.optional(v.string()),
        personName: v.string(),
        userId: v.optional(v.string()),
        contactEmail: v.optional(v.string()),
        contactPhone: v.optional(v.string()),
        notes: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    await requireEventEditAccess(ctx, args.eventId);
    const existing = await ctx.db
      .query("eventPeopleAssignments")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500);
    const keepIds = new Set(args.assignments.map((a) => a.id).filter(Boolean));
    for (const row of existing) {
      if (!keepIds.has(row._id)) await ctx.db.delete(row._id);
    }
    const now = Date.now();
    for (const row of args.assignments) {
      if (row.id) {
        await ctx.db.patch(row.id, {
          assignmentType: row.assignmentType,
          roleLabel: row.roleLabel?.trim() || undefined,
          personName: row.personName.trim(),
          userId: row.userId?.trim() || undefined,
          contactEmail: row.contactEmail?.trim() || undefined,
          contactPhone: row.contactPhone?.trim() || undefined,
          notes: row.notes?.trim() || undefined,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("eventPeopleAssignments", {
          eventId: args.eventId,
          assignmentType: row.assignmentType,
          roleLabel: row.roleLabel?.trim() || undefined,
          personName: row.personName.trim(),
          userId: row.userId?.trim() || undefined,
          contactEmail: row.contactEmail?.trim() || undefined,
          contactPhone: row.contactPhone?.trim() || undefined,
          notes: row.notes?.trim() || undefined,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  },
});
