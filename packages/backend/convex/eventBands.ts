import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { components } from "./_generated/api";
import { requireArborInternalContext, requireAuth, requireBandContext, getUserId } from "./lib/auth";
import { listBandLinkedEvents } from "./lib/eventBandAccess";
import {
  bandPaymentHasAgreementPdf,
  bandPaymentStatusLabel,
  isBandPayeeComplete,
  payeeFieldsFromProfile,
} from "./lib/bandPayments";
import { scheduleBandAssignedEmails } from "./email/bandAssignmentEmails";

const participationRoleValue = v.union(
  v.literal("headliner"),
  v.literal("support"),
  v.literal("other"),
);

const paymentStatusValue = v.union(
  v.literal("draft"),
  v.literal("pending_payee"),
  v.literal("pending_email"),
  v.literal("awaiting_confirmation"),
  v.literal("confirmed"),
  v.literal("paid"),
  v.literal("cancelled"),
);

const participationRowValidator = v.object({
  _id: v.id("eventBandParticipations"),
  eventId: v.id("events"),
  organizationId: v.string(),
  role: participationRoleValue,
  dayIndexes: v.optional(v.array(v.number())),
  bandName: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

type AuthOrganization = { id?: string; _id?: string; name?: string };

function getRecordId(row: { id?: string; _id?: string } | null | undefined) {
  return row?.id ?? row?._id ?? "";
}

/** Empty / missing day lists mean "all days" and are stored as absent. */
function normalizeDayIndexes(dayIndexes: number[] | undefined) {
  const cleaned = [...new Set(dayIndexes ?? [])]
    .filter((day) => Number.isInteger(day) && day >= 0)
    .sort((a, b) => a - b);
  return cleaned.length > 0 ? cleaned : undefined;
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

function paymentChipLabel(args: {
  hasPayment: boolean;
  status?:
    | "draft"
    | "pending_payee"
    | "pending_email"
    | "awaiting_confirmation"
    | "confirmed"
    | "paid"
    | "cancelled";
}): string {
  if (!args.hasPayment || !args.status) return "No payout yet";
  switch (args.status) {
    case "draft":
      return "Confirmed";
    case "pending_payee":
    case "pending_email":
    case "confirmed":
      return "Payment pending";
    case "awaiting_confirmation":
      return "Needs signature";
    case "paid":
      return "Paid";
    case "cancelled":
      return "No payout yet";
    default:
      return "Payment pending";
  }
}

export async function upsertEventBandParticipation(
  ctx: MutationCtx,
  args: {
    eventId: Id<"events">;
    organizationId: string;
    role: "headliner" | "support" | "other";
    dayIndexes?: number[];
  },
) {
  const now = Date.now();
  const dayIndexes = normalizeDayIndexes(args.dayIndexes);
  const existing = await ctx.db
    .query("eventBandParticipations")
    .withIndex("by_eventId_and_organizationId", (q) =>
      q.eq("eventId", args.eventId).eq("organizationId", args.organizationId),
    )
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, { role: args.role, dayIndexes, updatedAt: now });
    return existing._id;
  }
  const participationId = await ctx.db.insert("eventBandParticipations", {
    eventId: args.eventId,
    organizationId: args.organizationId,
    role: args.role,
    dayIndexes,
    createdAt: now,
    updatedAt: now,
  });
  await scheduleBandAssignedEmails(ctx, {
    eventId: args.eventId,
    organizationId: args.organizationId,
    role: args.role,
  });
  return participationId;
}

export const listByEvent = query({
  args: { eventId: v.id("events") },
  returns: v.array(participationRowValidator),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const rows = await ctx.db
      .query("eventBandParticipations")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(50);
    const result = [];
    for (const row of rows) {
      result.push({
        _id: row._id,
        eventId: row.eventId,
        organizationId: row.organizationId,
        role: row.role,
        dayIndexes: row.dayIndexes,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        bandName: await getOrganizationName(ctx, row.organizationId),
      });
    }
    return result;
  },
});

export const listPerformersForEvent = query({
  args: { eventId: v.id("events") },
  returns: v.array(
    v.object({
      participationId: v.id("eventBandParticipations"),
      organizationId: v.string(),
      bandName: v.string(),
      role: participationRoleValue,
      dayIndexes: v.optional(v.array(v.number())),
      payment: v.union(
        v.null(),
        v.object({
          _id: v.id("eventBandPayments"),
          pricingMode: v.union(v.literal("per_member_hourly"), v.literal("fixed_total")),
          ratePerMemberPerHourUsd: v.optional(v.number()),
          performanceHours: v.optional(v.number()),
          memberCount: v.optional(v.number()),
          totalUsd: v.number(),
          status: paymentStatusValue,
          statusLabel: v.string(),
          confirmationToken: v.string(),
          designatedPayeeName: v.optional(v.string()),
          designatedPayeeEmail: v.optional(v.string()),
          designatedPayeeUserId: v.optional(v.string()),
          designatedPayeeMailingAddress: v.optional(v.string()),
          designatedPayeePayoutMethod: v.optional(
            v.union(v.literal("pickup"), v.literal("delivery")),
          ),
          payeeComplete: v.boolean(),
          photoAlbumUrl: v.optional(v.string()),
          eventEnded: v.boolean(),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) return [];

    const participations = await ctx.db
      .query("eventBandParticipations")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(50);

    const payments = await ctx.db
      .query("eventBandPayments")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(50);
    const paymentByOrg = new Map(
      payments
        .filter((row) => row.status !== "cancelled")
        .map((row) => [row.organizationId, row] as const),
    );

    const nowMs = Date.now();
    const result = [];
    for (const row of participations) {
      const payment = paymentByOrg.get(row.organizationId) ?? null;
      const payeeComplete = payment
        ? isBandPayeeComplete({
            designatedPayeeName: payment.designatedPayeeName,
            designatedPayeeEmail: payment.designatedPayeeEmail,
            designatedPayeeMailingAddress: payment.designatedPayeeMailingAddress,
            designatedPayeePayoutMethod: payment.designatedPayeePayoutMethod,
          })
        : false;
      result.push({
        participationId: row._id,
        organizationId: row.organizationId,
        bandName: await getOrganizationName(ctx, row.organizationId),
        role: row.role,
        dayIndexes: row.dayIndexes,
        payment: payment
          ? {
              _id: payment._id,
              pricingMode: payment.pricingMode,
              ratePerMemberPerHourUsd: payment.ratePerMemberPerHourUsd,
              performanceHours: payment.performanceHours,
              memberCount: payment.memberCount,
              totalUsd: payment.totalUsd,
              status: payment.status,
              statusLabel: bandPaymentStatusLabel(payment.status),
              confirmationToken: payment.confirmationToken,
              designatedPayeeName: payment.designatedPayeeName,
              designatedPayeeEmail: payment.designatedPayeeEmail,
              designatedPayeeUserId: payment.designatedPayeeUserId,
              designatedPayeeMailingAddress: payment.designatedPayeeMailingAddress,
              designatedPayeePayoutMethod: payment.designatedPayeePayoutMethod,
              payeeComplete,
              photoAlbumUrl: payment.photoAlbumUrl,
              eventEnded: event.endAt <= nowMs,
            }
          : null,
      });
    }

    return result.sort((a, b) => a.bandName.localeCompare(b.bandName));
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
    const linkedEvents = await listBandLinkedEvents(ctx, context.organizationId);
    const result = [];
    for (const row of linkedEvents.values()) {
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

export const listShowsForActiveBand = query({
  args: {},
  returns: v.array(
    v.object({
      eventId: v.id("events"),
      title: v.string(),
      startAt: v.number(),
      endAt: v.number(),
      venueName: v.optional(v.string()),
      role: participationRoleValue,
      paymentChipLabel: v.string(),
      payment: v.union(
        v.null(),
        v.object({
          _id: v.id("eventBandPayments"),
          totalUsd: v.number(),
          status: paymentStatusValue,
          statusLabel: v.string(),
          designatedPayeeName: v.optional(v.string()),
          canSign: v.boolean(),
          canDownloadAgreementPdf: v.boolean(),
          needsPayeeSetup: v.boolean(),
        }),
      ),
    }),
  ),
  handler: async (ctx) => {
    const bandContext = await requireBandContext(ctx);
    const user = await requireAuth(ctx);
    const userId = getUserId(user);
    const linkedEvents = await listBandLinkedEvents(ctx, bandContext.organizationId);

    const profile = await ctx.db
      .query("organizationProfiles")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", bandContext.organizationId))
      .unique();
    const payeeComplete = isBandPayeeComplete(payeeFieldsFromProfile(profile));

    const payments = await ctx.db
      .query("eventBandPayments")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", bandContext.organizationId))
      .take(200);
    const paymentByEvent = new Map(
      payments
        .filter((row) => row.status !== "cancelled")
        .map((row) => [row.eventId, row] as const),
    );

    const result = [];
    for (const row of linkedEvents.values()) {
      const event = await ctx.db.get(row.eventId);
      if (!event) continue;
      const payment = paymentByEvent.get(row.eventId) ?? null;
      const canSign =
        Boolean(payment) &&
        payment!.status === "awaiting_confirmation" &&
        Boolean(payment!.designatedPayeeUserId) &&
        payment!.designatedPayeeUserId === userId;
      const needsPayeeSetup =
        Boolean(payment) && payment!.status === "pending_payee" && !payeeComplete;

      result.push({
        eventId: row.eventId,
        title: event.title,
        startAt: event.startAt,
        endAt: event.endAt,
        venueName: event.venueName,
        role: row.role,
        paymentChipLabel: paymentChipLabel({
          hasPayment: Boolean(payment),
          status: payment?.status,
        }),
        payment: payment
          ? {
              _id: payment._id,
              totalUsd: payment.totalUsd,
              status: payment.status,
              statusLabel: bandPaymentStatusLabel(payment.status),
              designatedPayeeName: payment.designatedPayeeName,
              canSign,
              canDownloadAgreementPdf: bandPaymentHasAgreementPdf(payment),
              needsPayeeSetup,
            }
          : null,
      });
    }

    return result.sort((a, b) => a.startAt - b.startAt);
  },
});

export const syncParticipationsFromPayments = mutation({
  args: {},
  returns: v.object({ synced: v.number() }),
  handler: async (ctx) => {
    await requireArborInternalContext(ctx);
    const payments = await ctx.db.query("eventBandPayments").take(500);
    let synced = 0;
    for (const payment of payments) {
      if (payment.status === "cancelled") continue;
      await upsertEventBandParticipation(ctx, {
        eventId: payment.eventId,
        organizationId: payment.organizationId,
        role: "headliner",
      });
      synced += 1;
    }
    return { synced };
  },
});

export const addParticipation = mutation({
  args: {
    eventId: v.id("events"),
    organizationId: v.string(),
    role: participationRoleValue,
    dayIndexes: v.optional(v.array(v.number())),
  },
  returns: v.id("eventBandParticipations"),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    return await upsertEventBandParticipation(ctx, {
      eventId: args.eventId,
      organizationId: args.organizationId,
      role: args.role,
      dayIndexes: args.dayIndexes,
    });
  },
});

export const setParticipationDays = mutation({
  args: {
    participationId: v.id("eventBandParticipations"),
    dayIndexes: v.array(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const existing = await ctx.db.get(args.participationId);
    if (!existing) throw new Error("Band participation not found.");
    await ctx.db.patch(args.participationId, {
      dayIndexes: normalizeDayIndexes(args.dayIndexes),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const updateParticipationRole = mutation({
  args: {
    eventId: v.id("events"),
    organizationId: v.string(),
    role: participationRoleValue,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const existing = await ctx.db
      .query("eventBandParticipations")
      .withIndex("by_eventId_and_organizationId", (q) =>
        q.eq("eventId", args.eventId).eq("organizationId", args.organizationId),
      )
      .unique();
    if (!existing) throw new Error("Band is not linked to this event.");
    await ctx.db.patch(existing._id, { role: args.role, updatedAt: Date.now() });
    return null;
  },
});

export const removeParticipation = mutation({
  args: {
    eventId: v.id("events"),
    organizationId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const existing = await ctx.db
      .query("eventBandParticipations")
      .withIndex("by_eventId_and_organizationId", (q) =>
        q.eq("eventId", args.eventId).eq("organizationId", args.organizationId),
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }

    const payment = await ctx.db
      .query("eventBandPayments")
      .withIndex("by_eventId_and_organizationId", (q) =>
        q.eq("eventId", args.eventId).eq("organizationId", args.organizationId),
      )
      .unique();
    if (payment && payment.status !== "cancelled") {
      if (payment.status === "paid") {
        throw new Error("Cannot remove a band with a paid payout.");
      }
      await ctx.db.patch(payment._id, {
        status: "cancelled",
        updatedAt: Date.now(),
      });
    }

    const remaining = await ctx.db
      .query("eventBandPayments")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(50);
    let total = 0;
    for (const row of remaining) {
      if (row.status === "cancelled") continue;
      total += row.totalUsd;
    }
    const event = await ctx.db.get(args.eventId);
    if (event) {
      await ctx.db.patch(args.eventId, { bandsCostUsd: total });
    }
    return null;
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
        const payment = await ctx.db
          .query("eventBandPayments")
          .withIndex("by_eventId_and_organizationId", (q) =>
            q.eq("eventId", args.eventId).eq("organizationId", row.organizationId),
          )
          .unique();
        if (payment && payment.status !== "cancelled" && payment.status !== "paid") {
          await ctx.db.patch(payment._id, {
            status: "cancelled",
            updatedAt: Date.now(),
          });
        }
      }
    }
    for (const row of args.participations) {
      await upsertEventBandParticipation(ctx, {
        eventId: args.eventId,
        organizationId: row.organizationId,
        role: row.role,
      });
    }
    const remaining = await ctx.db
      .query("eventBandPayments")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(50);
    let total = 0;
    for (const payment of remaining) {
      if (payment.status === "cancelled") continue;
      total += payment.totalUsd;
    }
    await ctx.db.patch(args.eventId, { bandsCostUsd: total });
    return null;
  },
});
