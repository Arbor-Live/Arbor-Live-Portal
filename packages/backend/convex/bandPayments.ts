import { formatDateTime, formatUsd } from "@arbor/format";
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
import { getUserId, getActiveOrganizationContextOrNull, requireArborInternalContext, requireAuth, requireBandContext } from "./lib/auth";
import {
  BAND_PAYMENT_SETTINGS_KEY,
  bandPaymentHasAgreementPdf,
  bandPaymentStatusLabel,
  computeBandPaymentTotal,
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
import { allocateBandPaymentConfirmationToken } from "./lib/publicReferenceIds";
import {
  scheduleBandPaymentCompletedEmails,
  scheduleBandPaymentConfirmationEmail,
  scheduleBandPaymentPayeeRequiredEmail,
} from "./email/bandPaymentEmails";
import { upsertEventBandParticipation } from "./eventBands";
import { EVENT_TIMEZONE } from "./email/constants";

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
  designatedPayeePayoutMethod: v.optional(v.union(v.literal("pickup"), v.literal("delivery"))),
  payeeComplete: v.boolean(),
  status: statusValue,
  statusLabel: v.string(),
  confirmationToken: v.string(),
  confirmationEmailSentAt: v.optional(v.number()),
  confirmationSentByUserId: v.optional(v.string()),
  confirmationSentByName: v.optional(v.string()),
  confirmedAt: v.optional(v.number()),
  signedByUserId: v.optional(v.string()),
  signatureTypedName: v.optional(v.string()),
  confirmationReplyFrom: v.optional(v.string()),
  confirmationReplyBody: v.optional(v.string()),
  servicePaymentNumber: v.optional(v.string()),
  paidAt: v.optional(v.number()),
  photoAlbumUrl: v.optional(v.string()),
  eventEnded: v.boolean(),
  canDownloadAgreementPdf: v.boolean(),
});

const bandFacingPaymentRowValidator = v.object({
  _id: v.id("eventBandPayments"),
  eventId: v.id("events"),
  eventTitle: v.string(),
  eventStartAt: v.number(),
  venueName: v.optional(v.string()),
  pricingMode: pricingModeValue,
  ratePerMemberPerHourUsd: v.optional(v.number()),
  performanceHours: v.optional(v.number()),
  memberCount: v.optional(v.number()),
  totalUsd: v.number(),
  designatedPayeeName: v.optional(v.string()),
  status: statusValue,
  statusLabel: v.string(),
  confirmationToken: v.string(),
  confirmationEmailSentAt: v.optional(v.number()),
  confirmedAt: v.optional(v.number()),
  signatureTypedName: v.optional(v.string()),
  servicePaymentNumber: v.optional(v.string()),
  paidAt: v.optional(v.number()),
  canSign: v.boolean(),
  canDownloadAgreementPdf: v.boolean(),
});

const agreementDocumentValidator = v.object({
  confirmationToken: v.string(),
  bandName: v.string(),
  eventTitle: v.string(),
  venueName: v.optional(v.string()),
  eventDateLabel: v.string(),
  pricingMode: pricingModeValue,
  ratePerMemberPerHourUsd: v.optional(v.number()),
  performanceHoursLabel: v.string(),
  memberCount: v.optional(v.number()),
  totalUsd: v.number(),
  designatedPayeeName: v.string(),
  designatedPayeeEmail: v.optional(v.string()),
  designatedPayeeMailingAddress: v.optional(v.string()),
  designatedPayeePayoutMethod: v.optional(v.union(v.literal("pickup"), v.literal("delivery"))),
  adminRequesterName: v.optional(v.string()),
  adminRequesterEmail: v.optional(v.string()),
  adminApproverName: v.optional(v.string()),
  adminApproverEmail: v.optional(v.string()),
  adminSentAtLabel: v.optional(v.string()),
  signatureTypedName: v.optional(v.string()),
  signedAtLabel: v.optional(v.string()),
  legacyReplyFrom: v.optional(v.string()),
  servicePaymentNumber: v.optional(v.string()),
  paidAtLabel: v.optional(v.string()),
  status: statusValue,
});

async function resolveAuthUserIdentity(
  ctx: QueryCtx | MutationCtx,
  userId: string | undefined,
): Promise<{ name: string; email: string } | null> {
  if (!userId) return null;
  const user = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "user",
    where: [{ field: "id", value: userId }],
  })) as { id?: string; email?: string; name?: string } | null;
  const email = user?.email?.trim();
  if (!email) return null;
  const name = user?.name?.trim() || email;
  return { name, email };
}

async function resolveBandName(ctx: QueryCtx | MutationCtx, organizationId: string) {
  const profile = await ctx.db
    .query("organizationProfiles")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .unique();
  const displayName = profile?.displayName?.trim();
  if (displayName) return displayName;

  // Prefer `_id` (adapter fast path), then `id`, matching lib/auth.ts.
  let org = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "organization",
    where: [{ field: "_id", value: organizationId }],
  })) as { name?: string } | null;
  if (!org) {
    org = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "organization",
      where: [{ field: "id", value: organizationId }],
    })) as { name?: string } | null;
  }
  const orgName = org?.name?.trim();
  if (orgName) return orgName;

  return "Band";
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
    designatedPayeePayoutMethod: payeeSnapshot.designatedPayeePayoutMethod,
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
    payment.designatedPayeeMailingAddress !== patch.designatedPayeeMailingAddress ||
    payment.designatedPayeePayoutMethod !== patch.designatedPayeePayoutMethod;
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
    designatedPayeePayoutMethod: effectivePayee.designatedPayeePayoutMethod,
    payeeComplete: isBandPayeeComplete(effectivePayee),
    status: payment.status,
    statusLabel: bandPaymentStatusLabel(payment.status),
    confirmationToken: payment.confirmationToken,
    confirmationEmailSentAt: payment.confirmationEmailSentAt,
    confirmationSentByUserId: payment.confirmationSentByUserId,
    confirmationSentByName: payment.confirmationSentByName,
    confirmedAt: payment.confirmedAt,
    signedByUserId: payment.signedByUserId,
    signatureTypedName: payment.signatureTypedName,
    confirmationReplyFrom: payment.confirmationReplyFrom,
    confirmationReplyBody: payment.confirmationReplyBody,
    servicePaymentNumber: payment.servicePaymentNumber,
    paidAt: payment.paidAt,
    photoAlbumUrl: payment.photoAlbumUrl,
    eventEnded: event.endAt <= nowMs,
    canDownloadAgreementPdf: bandPaymentHasAgreementPdf(payment),
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
    await requireArborInternalContext(ctx);
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
    designatedPayeePayoutMethod: v.optional(v.union(v.literal("pickup"), v.literal("delivery"))),
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
      // Count via async iteration so the queue badges stay accurate past 500
      // rows per status. Band-payout cardinality is bounded (events × bands for
      // one production org), so scanning each status index is cheap here; if
      // this table ever grows unbounded, switch to a denormalized counter
      // maintained on each status transition.
      let count = 0;
      for await (const _row of ctx.db
        .query("eventBandPayments")
        .withIndex("by_status", (q) => q.eq("status", status))) {
        count += 1;
      }
      counts[key] = count;
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
      designatedPayeePayoutMethod: payeeSnapshot.designatedPayeePayoutMethod,
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
      await upsertEventBandParticipation(ctx, {
        eventId: args.eventId,
        organizationId: args.organizationId,
        role: "headliner",
      });
      return existing._id;
    }

    const paymentId = await ctx.db.insert("eventBandPayments", {
      ...payload,
      confirmationToken: await allocateBandPaymentConfirmationToken(ctx),
      createdAt: now,
    });
    await syncEventBandsCost(ctx, args.eventId);
    await upsertEventBandParticipation(ctx, {
      eventId: args.eventId,
      organizationId: args.organizationId,
      role: "headliner",
    });
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
        synced.designatedPayeeMailingAddress !== payment.designatedPayeeMailingAddress ||
        synced.designatedPayeePayoutMethod !== payment.designatedPayeePayoutMethod
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
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const existing = await ctx.db.get(args.paymentId);
    if (!existing) throw new Error("Band payment not found.");
    const payment = await syncPayeeFromOrganizationForPayment(ctx, existing, Date.now());
    if (payment.status === "paid" || payment.status === "cancelled") {
      throw new Error("This payment is no longer active.");
    }
    if (payment.status !== "pending_email" && payment.status !== "awaiting_confirmation") {
      throw new Error("Signature request emails can only be sent from the payment queue.");
    }
    const effectivePayee = await getEffectivePayeeForPayment(ctx, payment);
    if (!isBandPayeeComplete(effectivePayee)) {
      throw new Error(
        "Designated payee name, email, mailing address, and payout method are required before sending.",
      );
    }
    if (!effectivePayee.designatedPayeeUserId) {
      throw new Error("Designated payee must be linked to a band member account before sending.");
    }

    const event = await ctx.db.get(payment.eventId);
    if (!event) throw new Error("Event not found.");

    const senderUserId = getUserId(user);
    const senderIdentity = await resolveAuthUserIdentity(ctx, senderUserId);
    const senderName =
      senderIdentity?.name ||
      user.name?.trim() ||
      user.email?.trim() ||
      "Arbor staff";
    const senderEmail = senderIdentity?.email || user.email?.trim() || undefined;

    await scheduleBandPaymentConfirmationEmail(ctx, { payment, event });

    await ctx.db.patch(payment._id, {
      designatedPayeeName: effectivePayee.designatedPayeeName,
      designatedPayeeEmail: effectivePayee.designatedPayeeEmail,
      designatedPayeeUserId: effectivePayee.designatedPayeeUserId,
      designatedPayeeMailingAddress: effectivePayee.designatedPayeeMailingAddress,
      designatedPayeePayoutMethod: effectivePayee.designatedPayeePayoutMethod,
      status: "awaiting_confirmation",
      confirmationEmailSentAt: Date.now(),
      confirmationSentByUserId: senderUserId || undefined,
      confirmationSentByName: senderName,
      confirmationSentByEmail: senderEmail,
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
      throw new Error("Band e-signature is required before marking paid.");
    }

    const servicePaymentNumber = args.servicePaymentNumber.trim();
    if (!servicePaymentNumber) throw new Error("Transfer / Service Payment number is required.");

    const event = await ctx.db.get(payment.eventId);
    if (!event) throw new Error("Event not found.");

    const now = Date.now();
    const paidByUserId = getUserId(user);
    const paidByIdentity = await resolveAuthUserIdentity(ctx, paidByUserId);
    const paidByName =
      paidByIdentity?.name || user.name?.trim() || user.email?.trim() || "Arbor staff";
    const paidByEmail = paidByIdentity?.email || user.email?.trim() || undefined;

    await ctx.db.patch(payment._id, {
      status: "paid",
      servicePaymentNumber,
      paidAt: now,
      paidByUserId,
      paidByName,
      paidByEmail,
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
        designatedPayeePayoutMethod: payeeSnapshot.designatedPayeePayoutMethod,
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
        designatedPayeePayoutMethod: payeeSnapshot.designatedPayeePayoutMethod,
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
        synced.designatedPayeeMailingAddress !== payment.designatedPayeeMailingAddress ||
        synced.designatedPayeePayoutMethod !== payment.designatedPayeePayoutMethod
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

export const listForActiveBand = query({
  args: {},
  returns: v.array(bandFacingPaymentRowValidator),
  handler: async (ctx) => {
    const bandContext = await requireBandContext(ctx);
    const user = await requireAuth(ctx);
    const userId = getUserId(user);
    const payments = await ctx.db
      .query("eventBandPayments")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", bandContext.organizationId))
      .take(200);
    const rows = [];
    for (const payment of payments) {
      if (payment.status === "cancelled" || payment.status === "draft") continue;
      const event = await ctx.db.get(payment.eventId);
      if (!event) continue;
      const canSign =
        payment.status === "awaiting_confirmation" &&
        Boolean(payment.designatedPayeeUserId) &&
        payment.designatedPayeeUserId === userId;
      rows.push({
        _id: payment._id,
        eventId: payment.eventId,
        eventTitle: event.title,
        eventStartAt: event.startAt,
        venueName: event.venueName,
        pricingMode: payment.pricingMode,
        ratePerMemberPerHourUsd: payment.ratePerMemberPerHourUsd,
        performanceHours: payment.performanceHours,
        memberCount: payment.memberCount,
        totalUsd: payment.totalUsd,
        designatedPayeeName: payment.designatedPayeeName,
        status: payment.status,
        statusLabel: bandPaymentStatusLabel(payment.status),
        confirmationToken: payment.confirmationToken,
        confirmationEmailSentAt: payment.confirmationEmailSentAt,
        confirmedAt: payment.confirmedAt,
        signatureTypedName: payment.signatureTypedName,
        servicePaymentNumber: payment.servicePaymentNumber,
        paidAt: payment.paidAt,
        canSign,
        canDownloadAgreementPdf: bandPaymentHasAgreementPdf(payment),
      });
    }
    return rows.sort((a, b) => b.eventStartAt - a.eventStartAt);
  },
});

export const countPendingActionsForActiveBand = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const bandContext = await requireBandContext(ctx);
    const user = await requireAuth(ctx);
    const userId = getUserId(user);
    const profile = await ctx.db
      .query("organizationProfiles")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", bandContext.organizationId))
      .unique();
    const payeeComplete = isBandPayeeComplete(payeeFieldsFromProfile(profile));

    const payments = await ctx.db
      .query("eventBandPayments")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", bandContext.organizationId))
      .take(200);

    let awaitingSignatureForMe = 0;
    let waitingOnPayeeSetup = 0;
    for (const payment of payments) {
      if (payment.status === "cancelled" || payment.status === "draft") continue;
      if (
        payment.status === "awaiting_confirmation" &&
        payment.designatedPayeeUserId &&
        payment.designatedPayeeUserId === userId
      ) {
        awaitingSignatureForMe += 1;
      }
      if (payment.status === "pending_payee" && !payeeComplete) {
        waitingOnPayeeSetup += 1;
      }
    }

    // Count payee-setup as one actionable chip item for the band, not one per payment.
    return awaitingSignatureForMe + (waitingOnPayeeSetup > 0 ? 1 : 0);
  },
});

export const signPayment = mutation({
  args: {
    paymentId: v.id("eventBandPayments"),
    typedName: v.string(),
    agreed: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const bandContext = await requireBandContext(ctx);
    const user = await requireAuth(ctx);
    const userId = getUserId(user);
    if (!userId) throw new Error("You must be signed in.");
    if (!args.agreed) throw new Error("You must agree to the payment amount before signing.");

    const typedName = args.typedName.trim();
    if (typedName.length < 2) throw new Error("Enter your full legal name to sign.");

    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.organizationId !== bandContext.organizationId) {
      throw new Error("Band payment not found.");
    }
    if (payment.status !== "awaiting_confirmation") {
      throw new Error("This payment is not awaiting signature.");
    }
    if (!payment.designatedPayeeUserId) {
      throw new Error("Designated payee is not linked to a band member account.");
    }
    if (payment.designatedPayeeUserId !== userId) {
      throw new Error("Only the designated payee can sign this payment.");
    }

    const effectivePayee = await getEffectivePayeeForPayment(ctx, payment);

    await ctx.db.patch(payment._id, {
      status: "confirmed",
      confirmedAt: Date.now(),
      signedByUserId: userId,
      signatureTypedName: typedName,
      // Freeze current org payee details (incl. payout method) onto the payment
      // so agreement PDFs don't depend on later profile edits.
      designatedPayeeName: effectivePayee.designatedPayeeName ?? payment.designatedPayeeName,
      designatedPayeeEmail: effectivePayee.designatedPayeeEmail ?? payment.designatedPayeeEmail,
      designatedPayeeMailingAddress:
        effectivePayee.designatedPayeeMailingAddress ?? payment.designatedPayeeMailingAddress,
      designatedPayeePayoutMethod:
        effectivePayee.designatedPayeePayoutMethod ?? payment.designatedPayeePayoutMethod,
      updatedAt: Date.now(),
    });
    return null;
  },
});

async function buildAgreementDocumentData(
  ctx: QueryCtx | MutationCtx,
  payment: Doc<"eventBandPayments">,
) {
  if (!bandPaymentHasAgreementPdf(payment)) {
    throw new Error("Agreement PDF is available after the payee signs.");
  }
  const event = await ctx.db.get(payment.eventId);
  if (!event) throw new Error("Event not found.");
  const timezone = event.timezone || EVENT_TIMEZONE;

  const requesterLookup = await resolveAuthUserIdentity(ctx, payment.confirmationSentByUserId);
  const adminRequesterName =
    payment.confirmationSentByName?.trim() || requesterLookup?.name || undefined;
  const adminRequesterEmail =
    payment.confirmationSentByEmail?.trim() || requesterLookup?.email || undefined;

  const paidByLookup = await resolveAuthUserIdentity(ctx, payment.paidByUserId);
  const adminApproverName =
    payment.paidByName?.trim() ||
    paidByLookup?.name ||
    adminRequesterName ||
    undefined;
  const adminApproverEmail =
    payment.paidByEmail?.trim() ||
    paidByLookup?.email ||
    adminRequesterEmail ||
    undefined;

  // Prefer payment snapshot; fall back to org profile for fields added later
  // (e.g. payout method) that older signed rows may not have stored.
  const effectivePayee = await getEffectivePayeeForPayment(ctx, payment);

  return {
    confirmationToken: payment.confirmationToken,
    bandName: await resolveBandName(ctx, payment.organizationId),
    eventTitle: event.title,
    venueName: event.venueName,
    eventDateLabel: formatBandPaymentDate(event.startAt, timezone),
    pricingMode: payment.pricingMode,
    ratePerMemberPerHourUsd: payment.ratePerMemberPerHourUsd,
    performanceHoursLabel: formatPerformanceHours(payment.performanceHours),
    memberCount: payment.memberCount,
    totalUsd: payment.totalUsd,
    designatedPayeeName: effectivePayee.designatedPayeeName ?? "Designated payee",
    designatedPayeeEmail: effectivePayee.designatedPayeeEmail,
    designatedPayeeMailingAddress: effectivePayee.designatedPayeeMailingAddress,
    designatedPayeePayoutMethod: effectivePayee.designatedPayeePayoutMethod,
    adminRequesterName,
    adminRequesterEmail,
    adminApproverName,
    adminApproverEmail,
    adminSentAtLabel: payment.confirmationEmailSentAt
      ? formatDateTime(payment.confirmationEmailSentAt, "long", timezone)
      : undefined,
    signatureTypedName: payment.signatureTypedName,
    signedAtLabel: payment.confirmedAt
      ? formatDateTime(payment.confirmedAt, "long", timezone)
      : undefined,
    legacyReplyFrom: payment.signatureTypedName ? undefined : payment.confirmationReplyFrom,
    servicePaymentNumber: payment.servicePaymentNumber,
    paidAtLabel: payment.paidAt ? formatDateTime(payment.paidAt, "long", timezone) : undefined,
    status: payment.status,
  };
}

export const getAgreementDocumentData = query({
  args: { paymentId: v.id("eventBandPayments") },
  returns: agreementDocumentValidator,
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("Band payment not found.");

    const orgContext = await getActiveOrganizationContextOrNull(ctx);
    if (!orgContext) throw new Error("You do not have access to this payment agreement.");
    const isArbor = orgContext.organizationType === "arbor_internal";
    const isBandMember = orgContext.organizationId === payment.organizationId;
    if (!isArbor && !isBandMember) {
      throw new Error("You do not have access to this payment agreement.");
    }

    return await buildAgreementDocumentData(ctx, payment);
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
    const subject = `Payment ready for your signature: ${event.title} [${payment.confirmationToken}]`;
    const lines = [
      `Hi ${payeeFirstName}!`,
      "",
      "A payment for your band's performance is ready for your signature in the Arbor Live portal.",
      `Date: ${formatBandPaymentDate(event.startAt, event.timezone)}`,
      `Event: ${event.title}`,
      `Location: ${event.venueName ?? "Arbor Stage"}`,
      `Length of Performance: ${formatPerformanceHours(payment.performanceHours)}`,
    ];
    if (payment.pricingMode === "per_member_hourly") {
      lines.push(`Rate per person per hour: ${formatUsd(payment.ratePerMemberPerHourUsd ?? 0)}`);
    }
    lines.push(
      `Total (paid to you to distribute among your band): ${formatUsd(payment.totalUsd)}`,
      "",
      `Band designated payee: ${payment.designatedPayeeName}`,
      "",
      "Sign in to the band portal to review the amount and e-sign your agreement.",
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
