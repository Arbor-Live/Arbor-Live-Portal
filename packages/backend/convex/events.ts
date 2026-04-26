import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";

const eventTypeValue = v.union(
  v.literal("Crewed Event"),
  v.literal("Rental with Crew"),
  v.literal("Dry Hire"),
  v.literal("Dry Rental"),
  v.literal("Services Only"),
);

const eventTeamValue = v.union(
  v.literal("Design"),
  v.literal("Marketing"),
  v.literal("Lighting"),
  v.literal("Sound"),
  v.literal("Operations"),
);
const EVENT_TIMEZONE = "America/Los_Angeles";

function trimOptional(value: string | undefined) {
  const out = value?.trim();
  return out ? out : undefined;
}

function makePublicToken() {
  return `evt_${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
}

type AuthUserRecord = {
  id?: string;
  _id?: string;
  name?: string;
  email?: string;
  image?: string | null;
};

export const list = query({
  args: {
    status: v.optional(v.union(v.literal("draft"), v.literal("active"), v.literal("completed"), v.literal("cancelled"))),
    query: v.optional(v.string()),
    linkedInvoiceOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const baseRows = args.status
      ? await ctx.db.query("events").withIndex("by_status", (q) => q.eq("status", args.status!)).take(200)
      : await ctx.db.query("events").withIndex("by_createdAt").take(200);
    const q = args.query?.trim().toLowerCase();
    const rows = baseRows.filter((row) => {
      if (args.linkedInvoiceOnly && !row.invoiceId) return false;
      if (!q) return true;
      const haystack = [row.title, row.venueName, row.eventType, row.host, ...(row.teamsInterested ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
    return rows.sort((a, b) => b.startAt - a.startAt);
  },
});

export const listForDashboard = query({
  args: {
    status: v.optional(v.union(v.literal("draft"), v.literal("active"), v.literal("completed"), v.literal("cancelled"))),
    query: v.optional(v.string()),
    linkedInvoiceOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const baseRows = args.status
      ? await ctx.db.query("events").withIndex("by_status", (q) => q.eq("status", args.status!)).take(200)
      : await ctx.db.query("events").withIndex("by_createdAt").take(200);
    const q = args.query?.trim().toLowerCase();
    const rows = baseRows.filter((row) => {
      if (args.linkedInvoiceOnly && !row.invoiceId) return false;
      if (!q) return true;
      const haystack = [row.title, row.venueName, row.eventType, row.host, ...(row.teamsInterested ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

    const sortedRows = rows.sort((a, b) => b.startAt - a.startAt);
    const withSchedule = [];
    for (const row of sortedRows) {
      const blocks = await ctx.db
        .query("eventScheduleBlocks")
        .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", row._id))
        .take(200);
      const shifts = await ctx.db
        .query("eventCrewShifts")
        .withIndex("by_eventId", (q) => q.eq("eventId", row._id))
        .take(500);
      const assignedCrewCount = new Set(
        shifts
          .map((shift) => shift.userId?.trim())
          .filter((userId): userId is string => Boolean(userId)),
      ).size;
      const assignedCrewUserIds = Array.from(
        new Set(
          shifts
            .map((shift) => shift.userId?.trim())
            .filter((userId): userId is string => Boolean(userId)),
        ),
      );
      const assignedCrew = [];
      for (const userId of assignedCrewUserIds) {
        const userById = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
          model: "user",
          where: [{ field: "id", value: userId }],
        })) as AuthUserRecord | null;
        const userByDocId = !userById
          ? ((await ctx.runQuery(components.betterAuth.adapter.findOne, {
              model: "user",
              where: [{ field: "_id", value: userId }],
            })) as AuthUserRecord | null)
          : null;
        const user = userById ?? userByDocId;
        assignedCrew.push({
          userId,
          name: user?.name ?? user?.email ?? userId,
          email: user?.email ?? "",
          image: user?.image ?? undefined,
        });
      }
      const setupBlock = blocks.find((block) => block.blockType === "setup");
      const showBlock = blocks.find((block) => block.blockType === "show");
      const strikeBlock = blocks.find((block) => block.blockType === "strike");
      const blockSummaries = blocks
        .sort((a, b) => a.startsAt - b.startsAt)
        .map((block) => ({
          blockType: block.blockType,
          label: block.label,
          startsAt: block.startsAt,
          endsAt: block.endsAt,
        }));
      withSchedule.push({
        ...row,
        assignedCrewCount,
        assignedCrew,
        scheduleSummary: {
          setupAt: setupBlock?.startsAt,
          showAt: showBlock?.startsAt ?? row.startAt,
          strikeAt: strikeBlock?.startsAt,
          blocks: blockSummaries,
        },
      });
    }
    return withSchedule;
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
    requiresShowWindow: v.optional(v.boolean()),
    venueName: v.optional(v.string()),
    eventType: v.optional(eventTypeValue),
    teamsInterested: v.optional(v.array(eventTeamValue)),
    category: v.optional(v.string()),
    host: v.optional(v.string()),
    expectedTurnout: v.optional(v.number()),
    budgetUsd: v.optional(v.number()),
    dayOfLeadUserId: v.optional(v.string()),
    eventManagerUserId: v.optional(v.string()),
    crewCostUsd: v.optional(v.number()),
    bandsCostUsd: v.optional(v.number()),
    externalRentalsCostUsd: v.optional(v.number()),
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
      timezone: EVENT_TIMEZONE,
      spansMultipleDays,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: args.requiresShowWindow ?? true,
      venueName: trimOptional(args.venueName),
      eventType: args.eventType,
      teamsInterested: args.teamsInterested && args.teamsInterested.length > 0 ? args.teamsInterested : undefined,
      category: trimOptional(args.category),
      host: trimOptional(args.host),
      expectedTurnout: args.expectedTurnout,
      budgetUsd: args.budgetUsd,
      dayOfLeadUserId: trimOptional(args.dayOfLeadUserId),
      eventManagerUserId: trimOptional(args.eventManagerUserId),
      crewCostUsd: args.crewCostUsd,
      bandsCostUsd: args.bandsCostUsd,
      externalRentalsCostUsd: args.externalRentalsCostUsd,
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
    requiresShowWindow: v.optional(v.boolean()),
    venueName: v.optional(v.string()),
    eventType: v.optional(eventTypeValue),
    teamsInterested: v.optional(v.array(eventTeamValue)),
    category: v.optional(v.string()),
    host: v.optional(v.string()),
    expectedTurnout: v.optional(v.number()),
    budgetUsd: v.optional(v.number()),
    dayOfLeadUserId: v.optional(v.string()),
    eventManagerUserId: v.optional(v.string()),
    crewCostUsd: v.optional(v.number()),
    bandsCostUsd: v.optional(v.number()),
    externalRentalsCostUsd: v.optional(v.number()),
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
      timezone: EVENT_TIMEZONE,
      spansMultipleDays,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: args.requiresShowWindow ?? existing.requiresShowWindow,
      venueName: args.venueName?.trim() ?? existing.venueName,
      eventType: args.eventType ?? existing.eventType,
      teamsInterested: args.teamsInterested ?? existing.teamsInterested,
      category: args.category?.trim() ?? existing.category,
      host: args.host?.trim() ?? existing.host,
      expectedTurnout: args.expectedTurnout ?? existing.expectedTurnout,
      budgetUsd: args.budgetUsd ?? existing.budgetUsd,
      dayOfLeadUserId: args.dayOfLeadUserId?.trim() ?? existing.dayOfLeadUserId,
      eventManagerUserId: args.eventManagerUserId?.trim() ?? existing.eventManagerUserId,
      crewCostUsd: args.crewCostUsd ?? existing.crewCostUsd,
      bandsCostUsd: args.bandsCostUsd ?? existing.bandsCostUsd,
      externalRentalsCostUsd: args.externalRentalsCostUsd ?? existing.externalRentalsCostUsd,
      notes: args.notes?.trim() ?? existing.notes,
      updatedAt: Date.now(),
    });
  },
});

export const setStatus = mutation({
  args: {
    id: v.id("events"),
    status: v.union(v.literal("draft"), v.literal("active"), v.literal("completed"), v.literal("cancelled")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Event not found.");
    await ctx.db.patch(args.id, { status: args.status, updatedAt: Date.now() });
  },
});

export const duplicate = mutation({
  args: { id: v.id("events") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Event not found.");
    const now = Date.now();
    const newId = await ctx.db.insert("events", {
      title: `${existing.title} (Copy)`,
      status: "draft",
      visibility: existing.visibility,
      invoiceId: existing.invoiceId,
      publicToken: makePublicToken(),
      startAt: existing.startAt,
      endAt: existing.endAt,
      timezone: EVENT_TIMEZONE,
      spansMultipleDays: existing.spansMultipleDays,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: existing.requiresShowWindow,
      venueName: existing.venueName,
      eventType: existing.eventType,
      teamsInterested: existing.teamsInterested,
      category: existing.category,
      host: existing.host,
      expectedTurnout: existing.expectedTurnout,
      budgetUsd: existing.budgetUsd,
      dayOfLeadUserId: existing.dayOfLeadUserId,
      eventManagerUserId: existing.eventManagerUserId,
      crewCostUsd: existing.crewCostUsd,
      bandsCostUsd: existing.bandsCostUsd,
      externalRentalsCostUsd: existing.externalRentalsCostUsd,
      notes: existing.notes,
      createdAt: now,
      updatedAt: now,
    });
    const blocks = await ctx.db
      .query("eventScheduleBlocks")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.id))
      .take(500);
    for (const block of blocks) {
      await ctx.db.insert("eventScheduleBlocks", {
        eventId: newId,
        blockType: block.blockType,
        label: block.label,
        dayIndex: block.dayIndex,
        startsAt: block.startsAt,
        endsAt: block.endsAt,
        notes: block.notes,
        createdAt: now,
        updatedAt: now,
      });
    }
    return newId;
  },
});
