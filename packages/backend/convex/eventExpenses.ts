import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireArborInternalContext, requireAuth } from "./lib/auth";

const statusValue = v.union(
  v.literal("draft"),
  v.literal("submitted"),
  v.literal("approved"),
  v.literal("paid"),
);

export const listByEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    return await ctx.db
      .query("eventExpenseReports")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(100);
  },
});

export const create = mutation({
  args: {
    eventId: v.id("events"),
    title: v.string(),
    status: v.optional(statusValue),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const now = Date.now();
    return await ctx.db.insert("eventExpenseReports", {
      eventId: args.eventId,
      title: args.title.trim(),
      status: args.status ?? "draft",
      totalHours: 0,
      totalAmountUsd: 0,
      notes: args.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("eventExpenseReports"),
    title: v.optional(v.string()),
    status: v.optional(statusValue),
    notes: v.optional(v.string()),
    totalAmountUsd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Expense report not found.");
    const now = Date.now();
    await ctx.db.patch(args.id, {
      title: args.title?.trim() ?? existing.title,
      status: args.status ?? existing.status,
      notes: args.notes?.trim() ?? existing.notes,
      totalAmountUsd: args.totalAmountUsd ?? existing.totalAmountUsd,
      submittedAt: args.status === "submitted" ? now : existing.submittedAt,
      approvedAt: args.status === "approved" ? now : existing.approvedAt,
      paidAt: args.status === "paid" ? now : existing.paidAt,
      updatedAt: now,
    });
  },
});
