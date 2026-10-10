import { v } from "convex/values";
import { requireOutreachAccess } from "./lib/outreachAccess";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { requireArborInternalContext, requireAuth, requireBandContext, getUserId } from "./lib/auth";
import { inviteEmailToBandOrg, provisionBandOrganization } from "./lib/bandOrgInvite";
import { scheduleBandEventOnboardingInviteEmail } from "./email/bandEventInviteEmails";
import { listBandLinkedEvents } from "./lib/eventBandAccess";
import { resolveUserContact } from "./lib/userContact";
import { resolveVenueLocation } from "./lib/crewTraineeIntro";
import { loadShowRiderCandidates, pickShowRider } from "./lib/showRider";
import { riderStatusValue } from "./lib/riderSchema";
import { syncInvoiceLineForSlot } from "./lib/artistLineSync";
import {
  claimSlot,
  unclaimSlot,
  upsertEventBandParticipation,
} from "./lib/eventBandParticipation";

// Existing callers (and this module) keep importing these from here.
export { unclaimSlot, upsertEventBandParticipation };
import {
  bandPaymentHasAgreementPdf,
  bandPaymentStatusLabel,
  isBandPayeeComplete,
  payeeFieldsFromProfile,
} from "./lib/bandPayments";
import { scheduleBandAssignedEmails } from "./email/bandAssignmentEmails";
import { scheduleBandTimeEmails } from "./email/bandScheduleEmails";
import { returnActTimesToPosition } from "./lib/actPositions";
import {
  deleteActBlocks,
  inheritSlotTimes,
  syncNeedBlocks,
  syncParticipationBlocks,
} from "./lib/runOfShow";
import { appError, withReportableErrors } from "./lib/errors";

const participationRoleValue = v.union(
  v.literal("headliner"),
  v.literal("support"),
  v.literal("other"),
);

const bandPricingModeValue = v.union(
  v.literal("per_member_hourly"),
  v.literal("fixed_total"),
);

const paymentStatusValue = v.union(
  v.literal("draft"),
  v.literal("pending_onboarding"),
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

function paymentChipLabel(args: {
  hasPayment: boolean;
  status?:
    | "draft"
    | "pending_onboarding"
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
    case "pending_onboarding":
      return "Pending onboarding";
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
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        bandName: await getOrganizationName(ctx, row.organizationId),
      });
    }
    return result;
  },
});

const performerRowFields = {
  participationId: v.id("eventBandParticipations"),
  organizationId: v.string(),
  bandName: v.string(),
  role: participationRoleValue,
  /** Slot this act fills, when it was booked against one. */
  needId: v.union(v.id("eventArtistNeeds"), v.null()),
  setStartsAt: v.union(v.number(), v.null()),
  setEndsAt: v.union(v.number(), v.null()),
  soundcheckStartsAt: v.union(v.number(), v.null()),
  soundcheckEndsAt: v.union(v.number(), v.null()),
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
  onboardingStatus: v.union(
    v.literal("not_started"),
    v.literal("in_progress"),
    v.literal("completed"),
    v.literal("waived"),
    v.null(),
  ),
  awaitingOnboarding: v.boolean(),
};

const performerRowValidator = v.object(performerRowFields);

async function listPerformerRowsForEvent(ctx: QueryCtx, event: Doc<"events">) {
  const participations = await ctx.db
    .query("eventBandParticipations")
    .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
    .take(50);

  const payments = await ctx.db
    .query("eventBandPayments")
    .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
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
    const onboarding = await ctx.db
      .query("organizationOnboarding")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", row.organizationId))
      .unique();
    const onboardingStatus = onboarding?.status ?? null;
    const awaitingOnboarding =
      onboardingStatus !== "completed" && onboardingStatus !== "waived";
    result.push({
      participationId: row._id,
      organizationId: row.organizationId,
      bandName: await getOrganizationName(ctx, row.organizationId),
      role: row.role,
      needId: row.needId ?? null,
      setStartsAt: row.setStartsAt ?? null,
      setEndsAt: row.setEndsAt ?? null,
      soundcheckStartsAt: row.soundcheckStartsAt ?? null,
      soundcheckEndsAt: row.soundcheckEndsAt ?? null,
      onboardingStatus,
      awaitingOnboarding,
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
}

export const listPerformersForEvent = query({
  args: { eventId: v.id("events") },
  returns: v.array(performerRowValidator),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) return [];
    return await listPerformerRowsForEvent(ctx, event);
  },
});

/** Performers across several events, each tagged with its `eventId` (multi-day bookings). */
export const listPerformersForEvents = query({
  args: { eventIds: v.array(v.id("events")) },
  returns: v.array(v.object({ ...performerRowFields, eventId: v.id("events") })),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const result = [];
    for (const eventId of args.eventIds) {
      const event = await ctx.db.get(eventId);
      if (!event) continue;
      const rows = await listPerformerRowsForEvent(ctx, event);
      result.push(...rows.map((row) => ({ ...row, eventId })));
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

/** A show's payout as the artist sees it: what it is and what they can do. */
const showPaymentValidator = v.union(
  v.null(),
  v.object({
    _id: v.id("eventBandPayments"),
    totalUsd: v.number(),
    status: paymentStatusValue,
    statusLabel: v.string(),
    confirmationToken: v.string(),
    designatedPayeeName: v.optional(v.string()),
    canSign: v.boolean(),
    canDownloadAgreementPdf: v.boolean(),
    needsPayeeSetup: v.boolean(),
  }),
);

const showFields = {
  eventId: v.id("events"),
  title: v.string(),
  startAt: v.number(),
  endAt: v.number(),
  timezone: v.optional(v.string()),
  venueName: v.optional(v.string()),
  /** The event was cancelled after the act was booked. */
  cancelled: v.boolean(),
  role: participationRoleValue,
  /** Run-of-show windows, when staff have set them. */
  setStartsAt: v.union(v.number(), v.null()),
  setEndsAt: v.union(v.number(), v.null()),
  soundcheckStartsAt: v.union(v.number(), v.null()),
  soundcheckEndsAt: v.union(v.number(), v.null()),
  paymentChipLabel: v.string(),
  payment: showPaymentValidator,
};

type ShowLinkRow = {
  eventId: Id<"events">;
  role: "headliner" | "support" | "other";
  setStartsAt?: number;
  setEndsAt?: number;
  soundcheckStartsAt?: number;
  soundcheckEndsAt?: number;
};

/**
 * Payouts the artist can see: not cancelled, and past staff's draft stage
 * (the Payments tab, `bandPayments.listForActiveBand`, hides drafts too).
 */
function isArtistVisiblePayment(
  payment: Doc<"eventBandPayments"> | null,
): payment is Doc<"eventBandPayments"> {
  return payment !== null && payment.status !== "cancelled" && payment.status !== "draft";
}

async function loadPayeeComplete(ctx: QueryCtx, organizationId: string) {
  const profile = await ctx.db
    .query("organizationProfiles")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .unique();
  return isBandPayeeComplete(payeeFieldsFromProfile(profile));
}

/** The fields shared by the shows list and a single show. */
function buildShow(
  event: Doc<"events">,
  row: ShowLinkRow,
  payment: Doc<"eventBandPayments"> | null,
  viewer: { userId: string; payeeComplete: boolean },
) {
  const canSign =
    payment !== null &&
    payment.status === "awaiting_confirmation" &&
    Boolean(payment.designatedPayeeUserId) &&
    payment.designatedPayeeUserId === viewer.userId;
  return {
    eventId: row.eventId,
    title: event.title,
    startAt: event.startAt,
    endAt: event.endAt,
    timezone: event.timezone,
    venueName: event.venueName,
    cancelled: event.status === "cancelled",
    role: row.role,
    setStartsAt: row.setStartsAt ?? null,
    setEndsAt: row.setEndsAt ?? null,
    soundcheckStartsAt: row.soundcheckStartsAt ?? null,
    soundcheckEndsAt: row.soundcheckEndsAt ?? null,
    paymentChipLabel: paymentChipLabel({
      hasPayment: payment !== null,
      status: payment?.status,
    }),
    payment: payment
      ? {
          _id: payment._id,
          totalUsd: payment.totalUsd,
          status: payment.status,
          statusLabel: bandPaymentStatusLabel(payment.status),
          confirmationToken: payment.confirmationToken,
          designatedPayeeName: payment.designatedPayeeName,
          canSign,
          canDownloadAgreementPdf: bandPaymentHasAgreementPdf(payment),
          needsPayeeSetup: payment.status === "pending_payee" && !viewer.payeeComplete,
        }
      : null,
  };
}

export const listShowsForActiveBand = query({
  args: {},
  returns: v.array(v.object(showFields)),
  handler: async (ctx) => {
    const bandContext = await requireBandContext(ctx);
    const user = await requireAuth(ctx);
    const userId = getUserId(user);
    const linkedEvents = await listBandLinkedEvents(ctx, bandContext.organizationId);
    const payeeComplete = await loadPayeeComplete(ctx, bandContext.organizationId);

    const payments = await ctx.db
      .query("eventBandPayments")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", bandContext.organizationId))
      .take(200);
    const paymentByEvent = new Map(
      payments.filter(isArtistVisiblePayment).map((row) => [row.eventId, row] as const),
    );

    const result = [];
    for (const row of linkedEvents.values()) {
      const event = await ctx.db.get(row.eventId);
      if (!event) continue;
      result.push(
        buildShow(event, row, paymentByEvent.get(row.eventId) ?? null, { userId, payeeComplete }),
      );
    }

    return result.sort((a, b) => a.startAt - b.startAt);
  },
});

/**
 * One show for the artist's detail panel: where it is, the act's own times,
 * who to call on the day, and the payout. Other acts and the rest of the run
 * of show stay staff-only. `null` when the act isn't on the event.
 */
export const getShowForActiveBand = query({
  // A string, not v.id: it comes from a `?show=` link, and a mangled link
  // should read as "not found" rather than fail validation.
  args: { eventId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      ...showFields,
      venueAddress: v.optional(v.string()),
      venueMapsUrl: v.optional(v.string()),
      /** Only acts on the lineup can pick a rider (a payout alone has no lineup row). */
      canChooseRider: v.boolean(),
      /** The rider crew will use for this show, and whether the act picked it. */
      rider: v.union(
        v.null(),
        v.object({
          _id: v.id("bandRiders"),
          name: v.string(),
          status: riderStatusValue,
          chosenForShow: v.boolean(),
        }),
      ),
      /** The Arbor person to reach on the day: the day-of lead, else the event manager. */
      contact: v.union(
        v.null(),
        v.object({
          roleLabel: v.string(),
          name: v.optional(v.string()),
          email: v.optional(v.string()),
          phone: v.optional(v.string()),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const bandContext = await requireBandContext(ctx);
    const user = await requireAuth(ctx);
    const userId = getUserId(user);
    const eventId = ctx.db.normalizeId("events", args.eventId);
    if (!eventId) return null;
    const event = await ctx.db.get(eventId);
    if (!event) return null;

    const participation = await ctx.db
      .query("eventBandParticipations")
      .withIndex("by_eventId_and_organizationId", (q) =>
        q.eq("eventId", eventId).eq("organizationId", bandContext.organizationId),
      )
      .first();
    const payment = await ctx.db
      .query("eventBandPayments")
      .withIndex("by_eventId_and_organizationId", (q) =>
        q.eq("eventId", eventId).eq("organizationId", bandContext.organizationId),
      )
      .unique();
    // Same membership rule as the list (`listBandLinkedEvents`): a lineup row,
    // or any payout that isn't cancelled. A draft payout links the show but
    // isn't shown yet.
    if (!participation && (!payment || payment.status === "cancelled")) return null;
    const activePayment = isArtistVisiblePayment(payment) ? payment : null;

    const row: ShowLinkRow = participation ?? { eventId, role: "headliner" };
    const payeeComplete = await loadPayeeComplete(ctx, bandContext.organizationId);
    const location = await resolveVenueLocation(ctx, event);

    let contact = null;
    for (const lead of [
      { userId: event.dayOfLeadUserId, roleLabel: "Day-of lead" },
      { userId: event.eventManagerUserId, roleLabel: "Event manager" },
    ]) {
      if (!lead.userId?.trim()) continue;
      const person = await resolveUserContact(ctx, lead.userId);
      if (!person) continue;
      contact = { roleLabel: lead.roleLabel, ...person };
      break;
    }

    const riders = await loadShowRiderCandidates(
      ctx,
      bandContext.organizationId,
      participation?.riderId,
    );
    const showRider = pickShowRider(riders, participation?.riderId);

    return {
      ...buildShow(event, row, activePayment, { userId, payeeComplete }),
      canChooseRider: participation !== null,
      rider: showRider.rider
        ? {
            _id: showRider.rider._id,
            name: showRider.rider.name,
            status: showRider.rider.status,
            chosenForShow: showRider.chosenForShow,
          }
        : null,
      venueName: location.venueName,
      venueAddress: location.address,
      venueMapsUrl: location.googleMapsUrl,
      contact,
    };
  },
});

/**
 * The act picks which of its riders crew should use for one show. `null` goes
 * back to the default rider. The show file, night rider and brief all read
 * the pick through `loadEventRiders`.
 */
export const setShowRiderForActiveBand = mutation({
  args: {
    eventId: v.id("events"),
    riderId: v.union(v.id("bandRiders"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const bandContext = await requireBandContext(ctx);
    return await withReportableErrors("eventBands.setShowRiderForActiveBand", async () => {
    const participation = await ctx.db
      .query("eventBandParticipations")
      .withIndex("by_eventId_and_organizationId", (q) =>
        q.eq("eventId", args.eventId).eq("organizationId", bandContext.organizationId),
      )
      .first();
    if (!participation) {
      appError(
        "SHOW_RIDER_NOT_ON_LINEUP",
        "You're not on this show's lineup yet, so there's no rider to pick.",
      );
    }
    const now = Date.now();
    // Past and cancelled shows keep the rider staff worked from.
    const event = await ctx.db.get(args.eventId);
    if (!event || event.status === "cancelled" || event.endAt < now) {
      appError(
        "SHOW_RIDER_LOCKED",
        "This show has ended or was cancelled, so its rider can't change.",
      );
    }
    if (args.riderId === null) {
      // `patch` can't drop a field, so rewrite the row without it.
      const { _id, _creationTime, riderId: _cleared, ...rest } = participation;
      await ctx.db.replace(_id, { ...rest, updatedAt: now });
      return null;
    }
    const rider = await ctx.db.get(args.riderId);
    if (!rider || rider.organizationId !== bandContext.organizationId) {
      appError("SHOW_RIDER_WRONG_ACT", "That rider doesn't belong to your act.");
    }
    await ctx.db.patch(participation._id, { riderId: rider._id, updatedAt: now });
    return null;
    });
  },
});

const syncParticipationStatusValue = v.union(
  v.literal("draft"),
  v.literal("pending_onboarding"),
  v.literal("pending_payee"),
  v.literal("pending_email"),
  v.literal("awaiting_confirmation"),
  v.literal("confirmed"),
  v.literal("paid"),
);

type SyncParticipationStatus =
  | "draft"
  | "pending_onboarding"
  | "pending_payee"
  | "pending_email"
  | "awaiting_confirmation"
  | "confirmed"
  | "paid";

const SYNC_PARTICIPATION_STATUSES: SyncParticipationStatus[] = [
  "draft",
  "pending_onboarding",
  "pending_payee",
  "pending_email",
  "awaiting_confirmation",
  "confirmed",
  "paid",
];

const SYNC_PARTICIPATIONS_BATCH = 200;

async function runSyncParticipationsPage(
  ctx: MutationCtx,
  status: SyncParticipationStatus,
  cursor: string | null,
): Promise<number> {
  const page = await ctx.db
    .query("eventBandPayments")
    .withIndex("by_status", (q) => q.eq("status", status))
    .paginate({ cursor, numItems: SYNC_PARTICIPATIONS_BATCH });

  let synced = 0;
  for (const payment of page.page) {
    await upsertEventBandParticipation(ctx, {
      eventId: payment.eventId,
      organizationId: payment.organizationId,
      role: "headliner",
    });
    synced += 1;
  }

  const nextStatus = page.isDone
    ? SYNC_PARTICIPATION_STATUSES[SYNC_PARTICIPATION_STATUSES.indexOf(status) + 1]
    : status;
  if (nextStatus) {
    await ctx.scheduler.runAfter(0, internal.eventBands.syncParticipationsPage, {
      status: nextStatus,
      cursor: page.isDone ? null : page.continueCursor,
    });
  }
  return synced;
}

export const syncParticipationsPage = internalMutation({
  args: {
    status: syncParticipationStatusValue,
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.object({ synced: v.number() }),
  handler: async (ctx, args) => {
    const synced = await runSyncParticipationsPage(ctx, args.status, args.cursor);
    return { synced };
  },
});

export const syncParticipationsFromPayments = mutation({
  args: {},
  returns: v.object({ synced: v.number() }),
  handler: async (ctx) => {
    await requireArborInternalContext(ctx);
    return await withReportableErrors("eventBands.syncParticipationsFromPayments", async () => {
    // Cancelled payments are skipped by only walking the non-cancelled statuses
    // on `by_status`, so the full backlog drains instead of truncating at 500.
    const synced = await runSyncParticipationsPage(ctx, "draft", null);
    return { synced };
    });
  },
});

export const addParticipation = mutation({
  args: {
    eventId: v.id("events"),
    organizationId: v.string(),
    role: participationRoleValue,
    needId: v.optional(v.id("eventArtistNeeds")),
  },
  returns: v.id("eventBandParticipations"),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    return await withReportableErrors("eventBands.addParticipation", async () => {
    const event = await ctx.db.get(args.eventId);
    if (!event) appError("EVENT_NOT_FOUND", "Event not found.");
    return await upsertEventBandParticipation(ctx, {
      eventId: args.eventId,
      organizationId: args.organizationId,
      role: args.role,
      needId: args.needId,
    });
    });
  },
});

/**
 * Set an act's run-of-show windows (set + soundcheck) and which slot it fills,
 * mirroring the windows into schedule blocks. Uses `replace` because Convex
 * `patch` ignores `undefined` and would never clear a field.
 */
export const updateParticipationLineup = mutation({
  args: {
    participationId: v.id("eventBandParticipations"),
    needId: v.union(v.id("eventArtistNeeds"), v.null()),
    /** Omit to keep the current times — the Run of Show owns them now. */
    setStartsAt: v.optional(v.union(v.number(), v.null())),
    setEndsAt: v.optional(v.union(v.number(), v.null())),
    soundcheckStartsAt: v.optional(v.union(v.number(), v.null())),
    soundcheckEndsAt: v.optional(v.union(v.number(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    return await withReportableErrors("eventBands.updateParticipationLineup", async () => {
    const existing = await ctx.db.get(args.participationId);
    if (!existing) appError("ARTIST_NOT_ON_EVENT", "Artist is not linked to this event.");
    const previousNeedId = existing.needId;
    if (args.setStartsAt != null && args.setEndsAt != null && args.setEndsAt <= args.setStartsAt) {
      appError("ACT_SET_TIME_ORDER", "Set end time must be after the start time.");
    }
    if (
      args.soundcheckStartsAt != null &&
      args.soundcheckEndsAt != null &&
      args.soundcheckEndsAt <= args.soundcheckStartsAt
    ) {
      appError("ACT_SOUNDCHECK_TIME_ORDER", "Soundcheck end time must be after the start time.");
    }
    if (args.needId) {
      await claimSlot(ctx, {
        needId: args.needId,
        eventId: existing.eventId,
        participationId: existing._id,
      });
    }

    const next: Doc<"eventBandParticipations"> = { ...existing, updatedAt: Date.now() };
    if (args.needId) next.needId = args.needId;
    else delete next.needId;
    for (const field of [
      "setStartsAt",
      "setEndsAt",
      "soundcheckStartsAt",
      "soundcheckEndsAt",
    ] as const) {
      const value = args[field];
      if (value === undefined) continue;
      if (value === null) delete next[field];
      else next[field] = value;
    }
    await ctx.db.replace(args.participationId, next);
    await scheduleBandTimeEmails(ctx, existing, next);
    if (args.needId) await inheritSlotTimes(ctx, args.participationId, args.needId);
    await syncParticipationBlocks(ctx, args.participationId);
    for (const needId of new Set([previousNeedId, args.needId])) {
      if (needId) await syncNeedBlocks(ctx, needId);
    }
    const now2 = next.updatedAt;
    if (args.needId) await syncInvoiceLineForSlot(ctx, args.needId, now2);
    if (previousNeedId && previousNeedId !== args.needId) {
      await syncInvoiceLineForSlot(ctx, previousNeedId, now2);
    }
    return null;
    });
  },
});

export const inviteBandFromEvent = mutation({
  args: {
    eventId: v.id("events"),
    email: v.string(),
    artistName: v.string(),
    role: participationRoleValue,
    needId: v.optional(v.id("eventArtistNeeds")),
    pricingMode: bandPricingModeValue,
    ratePerMemberPerHourUsd: v.optional(v.number()),
    performanceHours: v.optional(v.number()),
    memberCount: v.optional(v.number()),
    totalUsd: v.optional(v.number()),
  },
  returns: v.object({
    organizationId: v.string(),
    participationId: v.id("eventBandParticipations"),
  }),
  handler: async (ctx, args) => {
    await requireOutreachAccess(ctx);
    const staff = await requireAuth(ctx);
    const inviterId = getUserId(staff);
    if (!inviterId) throw new Error("Unable to resolve your account.");

    const event = await ctx.db.get(args.eventId);
    if (!event) appError("EVENT_NOT_FOUND", "Event not found.");

    // `provisionBandOrganization` is a shared helper (lib/bandOrgInvite) that
    // throws expected input errors, so it runs before the reportable wrapper.
    const { organizationId, displayName, contactEmail } = await provisionBandOrganization(ctx, {
      displayName: args.artistName,
      contactEmail: args.email,
      rejectExistingOrganization: true,
    });

    const existingParticipation = await ctx.db
      .query("eventBandParticipations")
      .withIndex("by_eventId_and_organizationId", (q) =>
        q.eq("eventId", args.eventId).eq("organizationId", organizationId),
      )
      .unique();
    if (existingParticipation) {
      appError("ARTIST_ALREADY_ON_EVENT", `${displayName} is already assigned to this event.`);
    }

    const invite = await inviteEmailToBandOrg(ctx, {
      email: contactEmail,
      organizationId,
      role: "org_admin",
      inviterId,
      preserveDefaultOrganization: true,
    });
    if (!invite) appError("INVITE_EMAIL_INVALID", "Enter a valid email address.");

    return await withReportableErrors("eventBands.inviteBandFromEvent", async () => {
    const participationId = await upsertEventBandParticipation(ctx, {
      eventId: args.eventId,
      organizationId,
      role: args.role,
      needId: args.needId,
    });

    await ctx.runMutation(internal.bandPayments.upsertForEventInternal, {
      eventId: args.eventId,
      organizationId,
      role: args.role,
      pricingMode: args.pricingMode,
      ratePerMemberPerHourUsd: args.ratePerMemberPerHourUsd,
      performanceHours: args.performanceHours,
      memberCount: args.memberCount,
      totalUsd: args.totalUsd,
    });

    await scheduleBandEventOnboardingInviteEmail(ctx, {
      eventId: args.eventId,
      organizationId,
      bandName: displayName,
      contactEmail,
      role: args.role,
    });

    return { organizationId, participationId };
    });
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
    return await withReportableErrors("eventBands.updateParticipationRole", async () => {
    const existing = await ctx.db
      .query("eventBandParticipations")
      .withIndex("by_eventId_and_organizationId", (q) =>
        q.eq("eventId", args.eventId).eq("organizationId", args.organizationId),
      )
      .unique();
    if (!existing) appError("ARTIST_NOT_ON_EVENT", "Artist is not linked to this event.");
    await ctx.db.patch(existing._id, { role: args.role, updatedAt: Date.now() });
    return null;
    });
  },
});

/**
 * Takes an act off the event: returns its times to its position, deletes its
 * run-of-show blocks, and cancels its unpaid payout. Throws on a paid payout.
 * Shared with `eventArtistNeeds.removeFromBill` so act and position go together.
 */
export async function removeParticipationFromEvent(
  ctx: MutationCtx,
  eventId: Id<"events">,
  organizationId: string,
) {
  const existing = await ctx.db
    .query("eventBandParticipations")
    .withIndex("by_eventId_and_organizationId", (q) =>
      q.eq("eventId", eventId).eq("organizationId", organizationId),
    )
    .unique();
  if (existing) {
    await returnActTimesToPosition(ctx, existing);
    await ctx.db.delete(existing._id);
    await scheduleBandTimeEmails(ctx, existing, null);
    await deleteActBlocks(ctx, { participationId: existing._id });
    if (existing.needId) await syncNeedBlocks(ctx, existing.needId);
  }

  const payment = await ctx.db
    .query("eventBandPayments")
    .withIndex("by_eventId_and_organizationId", (q) =>
      q.eq("eventId", eventId).eq("organizationId", organizationId),
    )
    .unique();
  if (payment && payment.status !== "cancelled") {
    if (payment.status === "paid") {
      appError("PARTICIPATION_PAID_PAYOUT", "Cannot remove an artist with a paid payout.");
    }
    await ctx.db.patch(payment._id, {
      status: "cancelled",
      updatedAt: Date.now(),
    });
  }

  const remaining = await ctx.db
    .query("eventBandPayments")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(50);
  let total = 0;
  for (const row of remaining) {
    if (row.status === "cancelled") continue;
    total += row.totalUsd;
  }
  const event = await ctx.db.get(eventId);
  if (event) {
    await ctx.db.patch(eventId, { bandsCostUsd: total });
  }
}

export const removeParticipation = mutation({
  args: {
    eventId: v.id("events"),
    organizationId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    return await withReportableErrors("eventBands.removeParticipation", async () => {
      await removeParticipationFromEvent(ctx, args.eventId, args.organizationId);
      return null;
    });
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
    return await withReportableErrors("eventBands.upsertParticipations", async () => {
    const event = await ctx.db.get(args.eventId);
    if (!event) appError("EVENT_NOT_FOUND", "Event not found.");

    const existing = await ctx.db
      .query("eventBandParticipations")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(50);
    const keepOrgIds = new Set(args.participations.map((row) => row.organizationId));
    for (const row of existing) {
      if (!keepOrgIds.has(row.organizationId)) {
        await returnActTimesToPosition(ctx, row);
        await ctx.db.delete(row._id);
        await scheduleBandTimeEmails(ctx, row, null);
        await deleteActBlocks(ctx, { participationId: row._id });
        if (row.needId) await syncNeedBlocks(ctx, row.needId);
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
    });
  },
});
