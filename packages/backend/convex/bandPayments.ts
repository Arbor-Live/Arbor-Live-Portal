import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { components, internal } from "./_generated/api";
import { getUserId, requireArborInternalContext, requireAuth } from "./lib/auth";
import {
  BAND_PAYMENT_SETTINGS_KEY,
  bandPaymentStatusLabel,
  computeBandPaymentTotal,
  createBandPaymentConfirmationToken,
  formatBandPaymentDate,
  formatPerformanceHours,
  getBandPaymentSettings,
  isBandPayeeComplete,
  payeeFieldsFromProfile,
  queueStatusForEndedEvent,
  resolvePayeeSnapshot,
  shouldPromoteBandPaymentToQueue,
  type BandPaymentPricingMode,
  type BandPaymentStatus,
} from "./lib/bandPayments";
import {
  scheduleBandPaymentCompletedEmails,
  scheduleBandPaymentConfirmationEmail,
  scheduleBandPaymentPayeeRequiredEmail,
} from "./email/bandPaymentEmails";

const pricingModeValue = v.union(v.literal("per_member_hourly"), v.literal("fixed_total"));
const statusValue = v.union(
  v.literal("draft"),
  v.literal("pending_payee"),
  v.literal("pending_email"),
  v.literal("awaiting_confirmation"),
  v.literal("confirmed"),
  v.literal("paid"),
  v.literal("cancelled"),
);
const queueValue = v.union(
  v.literal("needs_payee"),
  v.literal("needs_email"),
  v.literal("awaiting_reply"),
  v.literal("ready_to_pay"),
  v.literal("paid"),
  v.literal("all_pending"),
);

const bandPaymentRowValidator = v.object({
  _id: v.id("eventBandPayments"),
  eventId: v.id("events"),
  organizationId: v.string(),
  bandName: v.string(),
  eventTitle: v.string(),
  eventStartAt: v.number(),
  venueName: v.optional(v.string()),
  pricingMode: pricingModeValue,
  ratePerMemberPerHourUsd: v.optional(v.number()),
  performanceHours: v.optional(v.number()),
  memberCount: v.optional(v.number()),
  totalUsd: v.number(),
  designatedPayeeName: v.optional(v.string()),
  designatedPayeeEmail: v.optional(v.string()),
  designatedPayeeUserId: v.optional(v.string()),
  designatedPayeeMailingAddress: v.optional(v.string()),
  payeeComplete: v.boolean(),
  status: statusValue,
  statusLabel: v.string(),
  confirmationToken: v.string(),
  confirmationEmailSentAt: v.optional(v.number()),
  confirmedAt: v.optional(v.number()),
  confirmationReplyFrom: v.optional(v.string()),
  confirmationReplyBody: v.optional(v.string()),
  servicePaymentNumber: v.optional(v.string()),
  paidAt: v.optional(v.number()),
  photoAlbumUrl: v.optional(v.string()),
  eventEnded: v.boolean(),
});

async function resolveBandName(ctx: QueryCtx | MutationCtx, organizationId: string) {
  const profile = await ctx.db
    .query("organizationProfiles")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .unique();
  return profile?.displayName?.trim() || organizationId;
}

async function getOrganizationProfilePayee(ctx: QueryCtx | MutationCtx, organizationId: string) {
  const profile = await ctx.db
    .query("organizationProfiles")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .unique();
  return payeeFieldsFromProfile(profile);
}

async function refreshPayeeSnapshot(
  ctx: MutationCtx | QueryCtx,
  organizationId: string,
  overrides?: {
    designatedPayeeName?: string;
    designatedPayeeEmail?: string;
    designatedPayeeUserId?: string;
  },
) {
  const orgPayee = await getOrganizationProfilePayee(ctx, organizationId);
  const snapshot = resolvePayeeSnapshot(orgPayee, overrides);
  return {
    ...snapshot,
    payeeComplete: isBandPayeeComplete(snapshot),
  };
}

async function getEffectivePayeeForPayment(
  ctx: QueryCtx | MutationCtx,
  payment: Doc<"eventBandPayments">,
) {
  const orgPayee = await getOrganizationProfilePayee(ctx, payment.organizationId);
  return resolvePayeeSnapshot(orgPayee, payeeFieldsFromProfile(payment));
}

async function syncPayeeFromOrganizationForPayment(
  ctx: MutationCtx,
  payment: Doc<"eventBandPayments">,
  nowMs: number,
): Promise<Doc<"eventBandPayments">> {
  if (payment.status !== "pending_payee" && payment.status !== "draft") {
    return payment;
  }
  const payeeSnapshot = await refreshPayeeSnapshot(ctx, payment.organizationId);
  const patch = {
    designatedPayeeName: payeeSnapshot.designatedPayeeName,
    designatedPayeeEmail: payeeSnapshot.designatedPayeeEmail,
    designatedPayeeUserId: payeeSnapshot.designatedPayeeUserId,
    designatedPayeeMailingAddress: payeeSnapshot.designatedPayeeMailingAddress,
    updatedAt: nowMs,
  };
  if (payment.status === "pending_payee" && payeeSnapshot.payeeComplete) {
    await ctx.db.patch(payment._id, { ...patch, status: "pending_email" as const });
    return (await ctx.db.get(payment._id))!;
  }
  const needsPatch =
    payment.designatedPayeeName !== patch.designatedPayeeName ||
    payment.designatedPayeeEmail !== patch.designatedPayeeEmail ||
    payment.designatedPayeeUserId !== patch.designatedPayeeUserId ||
    payment.designatedPayeeMailingAddress !== patch.designatedPayeeMailingAddress;
  if (needsPatch) {
    await ctx.db.patch(payment._id, patch);
    return (await ctx.db.get(payment._id))!;
  }
  return payment;
}

function computeNextStatus(args: {
  existing: Doc<"eventBandPayments"> | null;
  event: Doc<"events">;
  nowMs: number;
  payeeComplete: boolean;
}): BandPaymentStatus {
  const { existing, event, nowMs, payeeComplete } = args;
  if (existing && existing.status !== "draft" && existing.status !== "cancelled") {
    if (existing.status === "pending_payee" && payeeComplete) {
      return "pending_email";
    }
    return existing.status;
  }
  if (!shouldPromoteBandPaymentToQueue(event, nowMs)) {
    return "draft";
  }
  return queueStatusForEndedEvent(payeeComplete);
}

async function buildBandPaymentRow(
  ctx: QueryCtx | MutationCtx,
  payment: Doc<"eventBandPayments">,
  event: Doc<"events">,
  nowMs: number,
) {
  const effectivePayee = await getEffectivePayeeForPayment(ctx, payment);
  return {
    _id: payment._id,
    eventId: payment.eventId,
    organizationId: payment.organizationId,
    bandName: await resolveBandName(ctx, payment.organizationId),
    eventTitle: event.title,
    eventStartAt: event.startAt,
    venueName: event.venueName,
    pricingMode: payment.pricingMode,
    ratePerMemberPerHourUsd: payment.ratePerMemberPerHourUsd,
    performanceHours: payment.performanceHours,
    memberCount: payment.memberCount,
    totalUsd: payment.totalUsd,
    designatedPayeeName: effectivePayee.designatedPayeeName,
    designatedPayeeEmail: effectivePayee.designatedPayeeEmail,
    designatedPayeeUserId: effectivePayee.designatedPayeeUserId,
    designatedPayeeMailingAddress: effectivePayee.designatedPayeeMailingAddress,
    payeeComplete: isBandPayeeComplete(effectivePayee),
    status: payment.status,
    statusLabel: bandPaymentStatusLabel(payment.status),
    confirmationToken: payment.confirmationToken,
    confirmationEmailSentAt: payment.confirmationEmailSentAt,
    confirmedAt: payment.confirmedAt,
    confirmationReplyFrom: payment.confirmationReplyFrom,
    confirmationReplyBody: payment.confirmationReplyBody,
    servicePaymentNumber: payment.servicePaymentNumber,
    paidAt: payment.paidAt,
    photoAlbumUrl: payment.photoAlbumUrl,
    eventEnded: event.endAt <= nowMs,
  };
}

type QueueFilter =
  | "needs_payee"
  | "needs_email"
  | "awaiting_reply"
  | "ready_to_pay"
  | "paid"
  | "all_pending";

function statusesForQueue(queue: QueueFilter): BandPaymentStatus[] {
  switch (queue) {
    case "needs_payee":
      return ["pending_payee"];
    case "needs_email":
      return ["pending_email"];
    case "awaiting_reply":
      return ["awaiting_confirmation"];
    case "ready_to_pay":
      return ["confirmed"];
    case "paid":
      return ["paid"];
    case "all_pending":
      return ["pending_payee", "pending_email", "awaiting_confirmation", "confirmed"];
  }
}

function paymentMatchesQueue(payment: Doc<"eventBandPayments">, queue: QueueFilter) {
  return statusesForQueue(queue).includes(payment.status);
}

async function syncEventBandsCost(ctx: MutationCtx, eventId: Id<"events">) {
  const payments = await ctx.db
    .query("eventBandPayments")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(50);
  const total = payments
    .filter((payment) => payment.status !== "cancelled")
    .reduce((sum, payment) => sum + payment.totalUsd, 0);
  await ctx.db.patch(eventId, { bandsCostUsd: total, updatedAt: Date.now() });
}

export const listBandMemberEmails = internalQuery({
  args: { userIds: v.array(v.string()) },
  returns: v.array(
    v.object({
      userId: v.string(),
      email: v.string(),
      name: v.string(),
      bandName: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = [];
    for (const userId of args.userIds) {
      const user = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: "user",
        where: [{ field: "id", value: userId }],
      })) as { id?: string; email?: string; name?: string } | null;
      if (!user?.email) continue;
      const membership = await ctx.db
        .query("userOrganizationMemberships")
        .withIndex("by_userId_and_organizationId", (q) => q.eq("userId", userId))
        .first();
      const bandName = membership
        ? await resolveBandName(ctx, membership.organizationId)
        : "your band";
      rows.push({
        userId,
        email: user.email,
        name: user.name ?? user.email,
        bandName,
      });
    }
    return rows;
  },
});

export const getSettings = query({
  args: {},
  returns: v.object({
    photoAlbumUrl: v.string(),
  }),
  handler: async (ctx) => {
    await requireArborInternalContext(ctx);
    return await getBandPaymentSettings(ctx);
  },
});

export const updateSettings = mutation({
  args: {
    photoAlbumUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const now = Date.now();
    const existing = await ctx.db
      .query("bandPaymentSettings")
      .withIndex("by_key", (q) => q.eq("key", BAND_PAYMENT_SETTINGS_KEY))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        photoAlbumUrl: args.photoAlbumUrl?.trim() || undefined,
        updatedAt: now,
      });
      return null;
    }
    await ctx.db.insert("bandPaymentSettings", {
      key: BAND_PAYMENT_SETTINGS_KEY,
      photoAlbumUrl: args.photoAlbumUrl?.trim() || undefined,
      updatedAt: now,
    });
    return null;
  },
});

export const listByEvent = query({
  args: { eventId: v.id("events") },
  returns: v.array(bandPaymentRowValidator),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) return [];
    const payments = await ctx.db
      .query("eventBandPayments")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(50);
    const nowMs = Date.now();
    const rows = [];
    for (const payment of payments) {
      if (payment.status === "cancelled") continue;
      rows.push(await buildBandPaymentRow(ctx, payment, event, nowMs));
    }
    return rows.sort((a, b) => a.bandName.localeCompare(b.bandName));
  },
});

export const getBandPayeeForOrganization = query({
  args: { organizationId: v.string() },
  returns: v.object({
    designatedPayeeUserId: v.optional(v.string()),
    designatedPayeeName: v.optional(v.string()),
    designatedPayeeEmail: v.optional(v.string()),
    designatedPayeeMailingAddress: v.optional(v.string()),
    payeeComplete: v.boolean(),
    performerHourlyRateUsd: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const profile = await ctx.db
      .query("organizationProfiles")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .unique();
    const payee = payeeFieldsFromProfile(profile);
    return {
      ...payee,
      payeeComplete: isBandPayeeComplete(payee),
      performerHourlyRateUsd: profile?.performerHourlyRateUsd,
    };
  },
});

export const getQueueCounts = query({
  args: {},
  returns: v.object({
    needs_payee: v.number(),
    needs_email: v.number(),
    awaiting_reply: v.number(),
    ready_to_pay: v.number(),
    paid: v.number(),
  }),
  handler: async (ctx) => {
    await requireArborInternalContext(ctx);
    const counts = {
      needs_payee: 0,
      needs_email: 0,
      awaiting_reply: 0,
      ready_to_pay: 0,
      paid: 0,
    };
    const statusKeys: Array<[BandPaymentStatus, keyof typeof counts]> = [
      ["pending_payee", "needs_payee"],
      ["pending_email", "needs_email"],
      ["awaiting_confirmation", "awaiting_reply"],
      ["confirmed", "ready_to_pay"],
      ["paid", "paid"],
    ];
    for (const [status, key] of statusKeys) {
      const rows = await ctx.db
        .query("eventBandPayments")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(500);
      counts[key] = rows.length;
    }
    return counts;
  },
});

export const upsertForEvent = mutation({
  args: {
    eventId: v.id("events"),
    paymentId: v.optional(v.id("eventBandPayments")),
    organizationId: v.string(),
    pricingMode: pricingModeValue,
    ratePerMemberPerHourUsd: v.optional(v.number()),
    performanceHours: v.optional(v.number()),
    memberCount: v.optional(v.number()),
    totalUsd: v.optional(v.number()),
    designatedPayeeName: v.optional(v.string()),
    designatedPayeeEmail: v.optional(v.string()),
    designatedPayeeUserId: v.optional(v.string()),
    photoAlbumUrl: v.optional(v.string()),
  },
  returns: v.id("eventBandPayments"),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");

    const totalUsd = computeBandPaymentTotal({
      pricingMode: args.pricingMode as BandPaymentPricingMode,
      ratePerMemberPerHourUsd: args.ratePerMemberPerHourUsd,
      performanceHours: args.performanceHours,
      memberCount: args.memberCount,
      totalUsd: args.totalUsd,
    });

    const now = Date.now();
    const settings = await getBandPaymentSettings(ctx);

    let existing: Doc<"eventBandPayments"> | null = null;
    if (args.paymentId) {
      const payment = await ctx.db.get(args.paymentId);
      if (!payment || payment.eventId !== args.eventId) {
        throw new Error("Band payment not found.");
      }
      existing = payment;
    } else {
      existing = await ctx.db
        .query("eventBandPayments")
        .withIndex("by_eventId_and_organizationId", (q) =>
          q.eq("eventId", args.eventId).eq("organizationId", args.organizationId),
        )
        .unique();
    }

    if (
      existing &&
      args.paymentId &&
      existing.organizationId !== args.organizationId
    ) {
      const duplicate = await ctx.db
        .query("eventBandPayments")
        .withIndex("by_eventId_and_organizationId", (q) =>
          q.eq("eventId", args.eventId).eq("organizationId", args.organizationId),
        )
        .unique();
      if (duplicate && duplicate._id !== existing._id && duplicate.status !== "cancelled") {
        throw new Error("This band is already linked to the event.");
      }
    }

    const payeeSnapshot = await refreshPayeeSnapshot(ctx, args.organizationId, {
      designatedPayeeName: args.designatedPayeeName,
      designatedPayeeEmail: args.designatedPayeeEmail,
      designatedPayeeUserId: args.designatedPayeeUserId,
    });

    const nextStatus = computeNextStatus({
      existing: existing?.status === "cancelled" ? null : existing,
      event,
      nowMs: now,
      payeeComplete: payeeSnapshot.payeeComplete,
    });

    const payload = {
      eventId: args.eventId,
      organizationId: args.organizationId,
      pricingMode: args.pricingMode,
      ratePerMemberPerHourUsd: args.ratePerMemberPerHourUsd,
      performanceHours: args.performanceHours,
      memberCount: args.memberCount,
      totalUsd,
      designatedPayeeName: payeeSnapshot.designatedPayeeName,
      designatedPayeeEmail: payeeSnapshot.designatedPayeeEmail,
      designatedPayeeUserId: payeeSnapshot.designatedPayeeUserId,
      designatedPayeeMailingAddress: payeeSnapshot.designatedPayeeMailingAddress,
      status: nextStatus,
      photoAlbumUrl: args.photoAlbumUrl?.trim() || settings.photoAlbumUrl || undefined,
      updatedAt: now,
    };

    if (existing) {
      if (existing.status === "paid") {
        throw new Error("This band payment has already been marked paid.");
      }
      await ctx.db.patch(existing._id, payload);
      await syncEventBandsCost(ctx, args.eventId);
      return existing._id;
    }

    const paymentId = await ctx.db.insert("eventBandPayments", {
      ...payload,
      confirmationToken: createBandPaymentConfirmationToken(),
      createdAt: now,
    });
    await syncEventBandsCost(ctx, args.eventId);
    return paymentId;
  },
});

export const listByQueue = query({
  args: { queue: queueValue },
  returns: v.array(bandPaymentRowValidator),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const nowMs = Date.now();
    const payments: Doc<"eventBandPayments">[] = [];
    for (const status of statusesForQueue(args.queue)) {
      const rows = await ctx.db
        .query("eventBandPayments")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(200);
      payments.push(...rows);
    }
    const rows = [];
    for (const payment of payments) {
      if (!paymentMatchesQueue(payment, args.queue)) continue;
      const event = await ctx.db.get(payment.eventId);
      if (!event) continue;
      rows.push(await buildBandPaymentRow(ctx, payment, event, nowMs));
    }
    return rows.sort((a, b) => {
      if (a.eventStartAt !== b.eventStartAt) return b.eventStartAt - a.eventStartAt;
      return a.bandName.localeCompare(b.bandName);
    });
  },
});

export const syncStalePayeePayments = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    await requireArborInternalContext(ctx);
    const now = Date.now();
    const pending = await ctx.db
      .query("eventBandPayments")
      .withIndex("by_status", (q) => q.eq("status", "pending_payee"))
      .take(500);
    let updated = 0;
    for (const payment of pending) {
      const synced = await syncPayeeFromOrganizationForPayment(ctx, payment, now);
      if (
        synced.status !== payment.status ||
        synced.designatedPayeeName !== payment.designatedPayeeName ||
        synced.designatedPayeeEmail !== payment.designatedPayeeEmail ||
        synced.designatedPayeeMailingAddress !== payment.designatedPayeeMailingAddress
      ) {
        updated += 1;
      }
    }
    return updated;
  },
});

export const sendConfirmationEmail = mutation({
  args: { paymentId: v.id("eventBandPayments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const existing = await ctx.db.get(args.paymentId);
    if (!existing) throw new Error("Band payment not found.");
    const payment = await syncPayeeFromOrganizationForPayment(ctx, existing, Date.now());
    if (payment.status === "paid" || payment.status === "cancelled") {
      throw new Error("This payment is no longer active.");
    }
    if (payment.status !== "pending_email" && payment.status !== "awaiting_confirmation") {
      throw new Error("Confirmation email can only be sent from the payment queue.");
    }
    const effectivePayee = await getEffectivePayeeForPayment(ctx, payment);
    if (!isBandPayeeComplete(effectivePayee)) {
      throw new Error("Designated payee name, email, and mailing address are required before sending.");
    }

    const event = await ctx.db.get(payment.eventId);
    if (!event) throw new Error("Event not found.");

    await scheduleBandPaymentConfirmationEmail(ctx, { payment, event });

    await ctx.db.patch(payment._id, {
      status: "awaiting_confirmation",
      confirmationEmailSentAt: Date.now(),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const sendPayeeRequiredEmail = mutation({
  args: { paymentId: v.id("eventBandPayments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("Band payment not found.");
    if (payment.status !== "pending_payee") {
      throw new Error("Payee reminder emails can only be sent for payments awaiting payee info.");
    }
    const event = await ctx.db.get(payment.eventId);
    if (!event) throw new Error("Event not found.");
    const bandName = await resolveBandName(ctx, payment.organizationId);
    await scheduleBandPaymentPayeeRequiredEmail(ctx, { payment, event, bandName });
    return null;
  },
});

export const markPaid = mutation({
  args: {
    paymentId: v.id("eventBandPayments"),
    servicePaymentNumber: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("Band payment not found.");
    if (payment.status !== "confirmed") {
      throw new Error("Band confirmation is required before marking paid.");
    }

    const servicePaymentNumber = args.servicePaymentNumber.trim();
    if (!servicePaymentNumber) throw new Error("Service Payment number is required.");

    const event = await ctx.db.get(payment.eventId);
    if (!event) throw new Error("Event not found.");

    const now = Date.now();
    await ctx.db.patch(payment._id, {
      status: "paid",
      servicePaymentNumber,
      paidAt: now,
      paidByUserId: getUserId(user),
      updatedAt: now,
    });

    await scheduleBandPaymentCompletedEmails(ctx, { payment, event, servicePaymentNumber });
    await ctx.db.patch(payment._id, { bandNotifiedAt: Date.now(), updatedAt: Date.now() });
    return null;
  },
});

export const cancelPayment = mutation({
  args: { paymentId: v.id("eventBandPayments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("Band payment not found.");
    if (payment.status === "paid") throw new Error("Paid band payments cannot be cancelled.");
    await ctx.db.patch(payment._id, {
      status: "cancelled",
      updatedAt: Date.now(),
    });
    await syncEventBandsCost(ctx, payment.eventId);
    return null;
  },
});

export const promoteEndedPayments = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now();
    const drafts = await ctx.db
      .query("eventBandPayments")
      .withIndex("by_status", (q) => q.eq("status", "draft"))
      .take(500);
    let promoted = 0;
    for (const payment of drafts) {
      const event = await ctx.db.get(payment.eventId);
      if (!event || !shouldPromoteBandPaymentToQueue(event, now)) continue;
      const payeeSnapshot = await refreshPayeeSnapshot(ctx, payment.organizationId);
      const nextStatus = queueStatusForEndedEvent(payeeSnapshot.payeeComplete);
      await ctx.db.patch(payment._id, {
        designatedPayeeName: payeeSnapshot.designatedPayeeName,
        designatedPayeeEmail: payeeSnapshot.designatedPayeeEmail,
        designatedPayeeUserId: payeeSnapshot.designatedPayeeUserId,
        designatedPayeeMailingAddress: payeeSnapshot.designatedPayeeMailingAddress,
        status: nextStatus,
        updatedAt: now,
      });
      if (nextStatus === "pending_payee") {
        await ctx.scheduler.runAfter(0, internal.bandPayments.sendPayeeRequiredEmailInternal, {
          paymentId: payment._id,
        });
      }
      promoted += 1;
    }

    const pendingPayee = await ctx.db
      .query("eventBandPayments")
      .withIndex("by_status", (q) => q.eq("status", "pending_payee"))
      .take(500);
    for (const payment of pendingPayee) {
      const payeeSnapshot = await refreshPayeeSnapshot(ctx, payment.organizationId);
      if (!payeeSnapshot.payeeComplete) continue;
      await ctx.db.patch(payment._id, {
        designatedPayeeName: payeeSnapshot.designatedPayeeName,
        designatedPayeeEmail: payeeSnapshot.designatedPayeeEmail,
        designatedPayeeUserId: payeeSnapshot.designatedPayeeUserId,
        designatedPayeeMailingAddress: payeeSnapshot.designatedPayeeMailingAddress,
        status: "pending_email",
        updatedAt: now,
      });
    }

    return promoted;
  },
});

export const refreshPendingPayeePaymentsForOrg = internalMutation({
  args: { organizationId: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const payments = await ctx.db
      .query("eventBandPayments")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .take(200);
    let updated = 0;
    for (const payment of payments) {
      if (payment.status !== "pending_payee" && payment.status !== "draft") continue;
      const synced = await syncPayeeFromOrganizationForPayment(ctx, payment, now);
      if (
        synced.status !== payment.status ||
        synced.designatedPayeeName !== payment.designatedPayeeName ||
        synced.designatedPayeeEmail !== payment.designatedPayeeEmail ||
        synced.designatedPayeeMailingAddress !== payment.designatedPayeeMailingAddress
      ) {
        updated += 1;
      }
    }
    return updated;
  },
});

export const sendPayeeRequiredEmailInternal = internalMutation({
  args: { paymentId: v.id("eventBandPayments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.status !== "pending_payee") return null;
    const event = await ctx.db.get(payment.eventId);
    if (!event) return null;
    const bandName = await resolveBandName(ctx, payment.organizationId);
    await scheduleBandPaymentPayeeRequiredEmail(ctx, { payment, event, bandName });
    return null;
  },
});

export const listBandOrgNotificationEmails = internalQuery({
  args: { organizationId: v.string() },
  returns: v.array(
    v.object({
      email: v.string(),
      name: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("userOrganizationMemberships")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .take(200);
    const active = memberships.filter((row) => row.active);
    const admins = active.filter((row) => row.role === "org_admin");
    const targets = admins.length > 0 ? admins : active;
    const rows = [];
    for (const membership of targets) {
      const user = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: "user",
        where: [{ field: "id", value: membership.userId }],
      })) as { email?: string; name?: string } | null;
      if (!user?.email) continue;
      rows.push({
        email: user.email,
        name: user.name ?? user.email,
      });
    }
    return rows;
  },
});

export const getByConfirmationToken = internalQuery({
  args: { confirmationToken: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("eventBandPayments"),
      designatedPayeeEmail: v.optional(v.string()),
      status: statusValue,
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const payment = await ctx.db
      .query("eventBandPayments")
      .withIndex("by_confirmationToken", (q) => q.eq("confirmationToken", args.confirmationToken))
      .unique();
    if (!payment) return null;
    return {
      _id: payment._id,
      designatedPayeeEmail: payment.designatedPayeeEmail,
      status: payment.status,
    };
  },
});

export const recordConfirmationReply = internalMutation({
  args: {
    paymentId: v.id("eventBandPayments"),
    replyFrom: v.string(),
    replyBody: v.string(),
    replyEmailId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) return null;
    if (payment.status === "paid" || payment.status === "cancelled") return null;
    await ctx.db.patch(payment._id, {
      status: "confirmed",
      confirmedAt: Date.now(),
      confirmationReplyFrom: args.replyFrom.trim(),
      confirmationReplyBody: args.replyBody.trim(),
      confirmationReplyEmailId: args.replyEmailId,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const markConfirmationEmailSent = internalMutation({
  args: {
    paymentId: v.id("eventBandPayments"),
    notificationId: v.id("emailNotifications"),
    resendId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.paymentId, {
      confirmationEmailNotificationId: args.notificationId,
      confirmationResendEmailId: args.resendId,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const buildConfirmationPreview = query({
  args: { paymentId: v.id("eventBandPayments") },
  returns: v.object({
    subject: v.string(),
    body: v.string(),
  }),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("Band payment not found.");
    const event = await ctx.db.get(payment.eventId);
    if (!event) throw new Error("Event not found.");
    const payeeFirstName =
      payment.designatedPayeeName?.split(" ")[0] ?? payment.designatedPayeeName ?? "there";
    const subject = `Payment confirmation needed: ${event.title} [${payment.confirmationToken}]`;
    const lines = [
      `Hi ${payeeFirstName}!`,
      "",
      "As part of payment processing for your band's performance, could you confirm the following details are accurate?",
      `Date: ${formatBandPaymentDate(event.startAt, event.timezone)}`,
      `Event: ${event.title}`,
      `Location: ${event.venueName ?? "Arbor Stage"}`,
      `Length of Performance: ${formatPerformanceHours(payment.performanceHours)}`,
    ];
    if (payment.pricingMode === "per_member_hourly") {
      lines.push(`Rate per person per hour: $${payment.ratePerMemberPerHourUsd ?? 0}`);
    }
    lines.push(
      `Total (paid to you to distribute among your band): $${payment.totalUsd}`,
      "",
      `Band designated payee: ${payment.designatedPayeeName}`,
      "",
      "If all these details are correct, email me back your confirmation and I can get started on the payment process.",
      "",
    );
    if (payment.photoAlbumUrl) {
      lines.push(
        "Additionally, if you have any videos or photos of the event, uploading them to the following photo album would be much appreciated!",
        "",
        payment.photoAlbumUrl,
        "",
      );
    }
    return { subject, body: lines.join("\n") };
  },
});
