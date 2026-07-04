import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { components } from "./_generated/api";
import { requireArborInternalContext, requireAuth, requireBandContext } from "./lib/auth";

const participationRoleValue = v.union(
  v.literal("headliner"),
  v.literal("support"),
  v.literal("other"),
);

const participationRowValidator = v.object({
  _id: v.id("eventBandParticipations"),
  eventId: v.id("events"),
  organizationId: v.string(),
  role: participationRoleValue,
  bandName: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

type AuthOrganization = { id?: string; _id?: string; name?: string };

function getRecordId(row: { id?: string; _id?: string } | null | undefined) {
  return row?.id ?? row?._id ?? "";
}

async function getOrganizationName(ctx: QueryCtx | MutationCtx, organizationId: string) {
  const orgRows = (await ctx.runQuery(components.betterAuth.adapter.findMany, {
    model: "organization",
    paginationOpts: { cursor: null, numItems: 500 },
  })) as { page?: AuthOrganization[] } | null;
  const org = (orgRows?.page ?? []).find((row) => getRecordId(row) === organizationId);
  const profile = await ctx.db
    .query("organizationProfiles")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .unique();
  return profile?.displayName ?? org?.name ?? "Band";
}

export async function upsertEventBandParticipation(
  ctx: MutationCtx,
  args: {
    eventId: Id<"events">;
    organizationId: string;
    role: "headliner" | "support" | "other";
  },
) {
  const now = Date.now();
  const existing = await ctx.db
    .query("eventBandParticipations")
    .withIndex("by_eventId_and_organizationId", (q) =>
      q.eq("eventId", args.eventId).eq("organizationId", args.organizationId),
    )
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, { role: args.role, updatedAt: now });
    return existing._id;
  }
  return await ctx.db.insert("eventBandParticipations", {
    eventId: args.eventId,
    organizationId: args.organizationId,
    role: args.role,
    createdAt: now,
    updatedAt: now,
  });
}

export const listByEvent = query({
  args: { eventId: v.id("events") },
  returns: v.array(participationRowValidator),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const rows = await ctx.db
      .query("eventBandParticipations")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(50);
    const result = [];
    for (const row of rows) {
      result.push({
        ...row,
        bandName: await getOrganizationName(ctx, row.organizationId),
      });
    }
    return result;
  },
});

export const listLinkedEventsForActiveBand = query({
  args: {},
  returns: v.array(
    v.object({
      eventId: v.id("events"),
      title: v.string(),
      startAt: v.number(),
      endAt: v.number(),
      venueName: v.optional(v.string()),
      role: participationRoleValue,
    }),
  ),
  handler: async (ctx) => {
    const context = await requireBandContext(ctx);
    const participations = await ctx.db
      .query("eventBandParticipations")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", context.organizationId))
      .take(100);
    const result = [];
    for (const row of participations) {
      const event = await ctx.db.get(row.eventId);
      if (!event) continue;
      result.push({
        eventId: row.eventId,
        title: event.title,
        startAt: event.startAt,
        endAt: event.endAt,
        venueName: event.venueName,
        role: row.role,
      });
    }
    return result.sort((a, b) => b.startAt - a.startAt);
  },
});

export const upsertParticipations = mutation({
  args: {
    eventId: v.id("events"),
    participations: v.array(
      v.object({
        organizationId: v.string(),
        role: participationRoleValue,
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");

    const existing = await ctx.db
      .query("eventBandParticipations")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(50);
    const keepOrgIds = new Set(args.participations.map((row) => row.organizationId));
    for (const row of existing) {
      if (!keepOrgIds.has(row.organizationId)) {
        await ctx.db.delete(row._id);
      }
    }
    for (const row of args.participations) {
      await upsertEventBandParticipation(ctx, {
        eventId: args.eventId,
        organizationId: row.organizationId,
        role: row.role,
      });
    }
    return null;
  },
});
