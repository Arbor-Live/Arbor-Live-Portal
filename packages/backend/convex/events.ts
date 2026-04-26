import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

function trimOptional(value: string | undefined) {
  const out = value?.trim();
  return out ? out : undefined;
}

function makePublicToken() {
  return `evt_${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
}

export const list = query({
  args: {
    status: v.optional(v.union(v.literal("draft"), v.literal("active"), v.literal("completed"), v.literal("cancelled"))),
  },
  handler: async (ctx, args) => {
    const rows = args.status
      ? await ctx.db.query("events").withIndex("by_status", (q) => q.eq("status", args.status!)).take(200)
      : await ctx.db.query("events").withIndex("by_createdAt").take(200);
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const get = query({
  args: { id: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.id);
    if (!event) return null;
    const blocks = await ctx.db
      .query("eventScheduleBlocks")
      .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", args.id))
      .take(500);
    const shifts = await ctx.db
      .query("eventCrewShifts")
      .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", args.id))
      .take(500);
    const assignments = await ctx.db
      .query("eventPeopleAssignments")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.id))
      .take(500);
    const artifacts = await ctx.db
      .query("eventArtifacts")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.id))
      .take(500);
    const expenseReports = await ctx.db
      .query("eventExpenseReports")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.id))
      .take(100);
    return { event, blocks, shifts, assignments, artifacts, expenseReports };
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    status: v.optional(v.union(v.literal("draft"), v.literal("active"), v.literal("completed"), v.literal("cancelled"))),
    visibility: v.optional(v.union(v.literal("internal"), v.literal("public"))),
    invoiceId: v.optional(v.id("invoices")),
    startAt: v.number(),
    endAt: v.number(),
    timezone: v.string(),
    setupOnly: v.optional(v.boolean()),
    strikeOnly: v.optional(v.boolean()),
    requiresShowWindow: v.optional(v.boolean()),
    venueName: v.optional(v.string()),
    eventType: v.optional(v.string()),
    category: v.optional(v.string()),
    host: v.optional(v.string()),
    expectedTurnout: v.optional(v.number()),
    budgetUsd: v.optional(v.number()),
    dayOfLeadUserId: v.optional(v.string()),
    eventManagerUserId: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.endAt <= args.startAt) throw new Error("Event end time must be after start time.");
    const now = Date.now();
    const spansMultipleDays = new Date(args.startAt).toDateString() !== new Date(args.endAt).toDateString();
    return await ctx.db.insert("events", {
      title: args.title.trim(),
      status: args.status ?? "draft",
      visibility: args.visibility ?? "internal",
      invoiceId: args.invoiceId,
      publicToken: makePublicToken(),
      startAt: args.startAt,
      endAt: args.endAt,
      timezone: args.timezone.trim(),
      spansMultipleDays,
      setupOnly: args.setupOnly ?? false,
      strikeOnly: args.strikeOnly ?? false,
      requiresShowWindow: args.requiresShowWindow ?? true,
      venueName: trimOptional(args.venueName),
      eventType: trimOptional(args.eventType),
      category: trimOptional(args.category),
      host: trimOptional(args.host),
      expectedTurnout: args.expectedTurnout,
      budgetUsd: args.budgetUsd,
      dayOfLeadUserId: trimOptional(args.dayOfLeadUserId),
      eventManagerUserId: trimOptional(args.eventManagerUserId),
      notes: trimOptional(args.notes),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("events"),
    title: v.optional(v.string()),
    status: v.optional(v.union(v.literal("draft"), v.literal("active"), v.literal("completed"), v.literal("cancelled"))),
    visibility: v.optional(v.union(v.literal("internal"), v.literal("public"))),
    invoiceId: v.optional(v.id("invoices")),
    startAt: v.optional(v.number()),
    endAt: v.optional(v.number()),
    timezone: v.optional(v.string()),
    setupOnly: v.optional(v.boolean()),
    strikeOnly: v.optional(v.boolean()),
    requiresShowWindow: v.optional(v.boolean()),
    venueName: v.optional(v.string()),
    eventType: v.optional(v.string()),
    category: v.optional(v.string()),
    host: v.optional(v.string()),
    expectedTurnout: v.optional(v.number()),
    budgetUsd: v.optional(v.number()),
    dayOfLeadUserId: v.optional(v.string()),
    eventManagerUserId: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Event not found.");
    const startAt = args.startAt ?? existing.startAt;
    const endAt = args.endAt ?? existing.endAt;
    if (endAt <= startAt) throw new Error("Event end time must be after start time.");
    const spansMultipleDays = new Date(startAt).toDateString() !== new Date(endAt).toDateString();
    await ctx.db.patch(args.id, {
      title: args.title?.trim() ?? existing.title,
      status: args.status ?? existing.status,
      visibility: args.visibility ?? existing.visibility,
      invoiceId: args.invoiceId ?? existing.invoiceId,
      startAt,
      endAt,
      timezone: args.timezone?.trim() ?? existing.timezone,
      spansMultipleDays,
      setupOnly: args.setupOnly ?? existing.setupOnly,
      strikeOnly: args.strikeOnly ?? existing.strikeOnly,
      requiresShowWindow: args.requiresShowWindow ?? existing.requiresShowWindow,
      venueName: args.venueName?.trim() ?? existing.venueName,
      eventType: args.eventType?.trim() ?? existing.eventType,
      category: args.category?.trim() ?? existing.category,
      host: args.host?.trim() ?? existing.host,
      expectedTurnout: args.expectedTurnout ?? existing.expectedTurnout,
      budgetUsd: args.budgetUsd ?? existing.budgetUsd,
      dayOfLeadUserId: args.dayOfLeadUserId?.trim() ?? existing.dayOfLeadUserId,
      eventManagerUserId: args.eventManagerUserId?.trim() ?? existing.eventManagerUserId,
      notes: args.notes?.trim() ?? existing.notes,
      updatedAt: Date.now(),
    });
  },
});
