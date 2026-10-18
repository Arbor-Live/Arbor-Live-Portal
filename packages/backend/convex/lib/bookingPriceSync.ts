import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { bandPaymentStatusStamp, type BandPaymentStatus } from "./bandPayments";
import {
  bookingPriceFromPayout,
  bookingPriceFromProfile,
  eventArtistCostUsd,
  payoutFieldsFromPrice,
  payoutFollowsBooking,
  payoutPaysPrice,
  sameBookingPrice,
  type BookingPrice,
} from "./bookingPrice";

/**
 * Recompute `events.bandsCostUsd` from what the event pays its acts (see
 * `eventArtistCostUsd`). It is derived only; nothing edits it by hand.
 */
export async function syncEventBandsCost(ctx: MutationCtx, eventId: Id<"events">) {
  const event = await ctx.db.get(eventId);
  if (!event) return;
  const [payouts, positions, acts] = await Promise.all([
    ctx.db
      .query("eventBandPayments")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .take(100),
    ctx.db
      .query("eventArtistNeeds")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .take(100),
    ctx.db
      .query("eventBandParticipations")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .take(100),
  ]);
  const seatedOrgByNeed = new Map(
    acts.flatMap((act) => (act.needId ? [[act.needId, act.organizationId] as const] : [])),
  );
  const total = eventArtistCostUsd({
    payouts,
    positions: positions.map((position) => ({
      seatedOrganizationId: seatedOrgByNeed.get(position._id),
      price: position.price,
    })),
  });
  if (event.bandsCostUsd === total) return;
  await ctx.db.patch(eventId, { bandsCostUsd: total, updatedAt: Date.now() });
}

/**
 * Signed (or sent-for-signature) payouts whose amount changes go back to
 * "needs signature request": the artist signed for the old amount.
 */
const SIGNATURE_STATUSES: ReadonlySet<BandPaymentStatus> = new Set([
  "awaiting_confirmation",
  "confirmed",
]);

/** Point an unpaid payout at a price; paid and cancelled payouts never change. */
export async function payPayoutAtPrice(
  ctx: MutationCtx,
  payout: Doc<"eventBandPayments">,
  price: BookingPrice,
) {
  if (!payoutFollowsBooking(payout.status) || payoutPaysPrice(payout, price)) return false;
  const now = Date.now();
  const amountChanged = payout.totalUsd !== price.totalUsd;
  const needsNewSignature = amountChanged && SIGNATURE_STATUSES.has(payout.status);
  await ctx.db.patch(payout._id, {
    ...payoutFieldsFromPrice(price),
    ...(needsNewSignature
      ? {
          status: "pending_email" as const,
          ...bandPaymentStatusStamp(payout.status, "pending_email", now),
          confirmationEmailSentAt: undefined,
          confirmedAt: undefined,
          signedByUserId: undefined,
          signatureTypedName: undefined,
          emailConfirmationStorageFileId: undefined,
          emailConfirmedByName: undefined,
        }
      : {}),
    updatedAt: now,
  });
  return true;
}

/** Bring the act in this position's unpaid payout to the position's price. */
export async function syncPayoutToBooking(ctx: MutationCtx, needId: Id<"eventArtistNeeds">) {
  const slot = await ctx.db.get(needId);
  if (!slot?.price) return;
  const act = await ctx.db
    .query("eventBandParticipations")
    .withIndex("by_needId", (q) => q.eq("needId", needId))
    .first();
  if (!act) return;
  const payouts = await ctx.db
    .query("eventBandPayments")
    .withIndex("by_eventId_and_organizationId", (q) =>
      q.eq("eventId", slot.eventId).eq("organizationId", act.organizationId),
    )
    .take(10);
  for (const payout of payouts) await payPayoutAtPrice(ctx, payout, slot.price);
}

/**
 * Set what the act in a position costs, and carry it to the act's unpaid
 * payout and the event's artist cost. Quote lines are the caller's job:
 * a quote save writes this from its lines, and a Lineup edit goes through
 * `invoices.applyBookingPriceToQuoteLines` first (which refuses approved and
 * final quotes). `seedPayout` gives a seated act without a payout one at this
 * price (an explicit price, not a profile default).
 */
export async function setPositionPrice(
  ctx: MutationCtx,
  needId: Id<"eventArtistNeeds">,
  price: BookingPrice | undefined,
  opts: { seedPayout?: boolean } = {},
) {
  const slot = await ctx.db.get(needId);
  if (!slot) return;
  if (!sameBookingPrice(slot.price, price)) {
    // `replace`, since `patch` can't clear the price.
    const next: Doc<"eventArtistNeeds"> = { ...slot, updatedAt: Date.now() };
    if (price) next.price = price;
    else delete next.price;
    await ctx.db.replace(needId, next);
  }
  await syncPayoutToBooking(ctx, needId);
  if (opts.seedPayout && price && price.totalUsd > 0) await scheduleSeedPayoutFromBooking(ctx, needId);
  await syncEventBandsCost(ctx, slot.eventId);
}

/**
 * An act booked into a position nothing prices (no price yet, no quote line)
 * starts from the payout it already has on the event, else its band profile:
 * rate per person per hour × members × set length. Copied once; later
 * profile edits don't touch the booking.
 */
export async function seedPositionPrice(
  ctx: MutationCtx,
  needId: Id<"eventArtistNeeds">,
  act: Pick<Doc<"eventBandParticipations">, "organizationId" | "setStartsAt" | "setEndsAt">,
) {
  const slot = await ctx.db.get(needId);
  if (!slot || slot.price) return;
  const line = await ctx.db
    .query("invoiceLineItems")
    .withIndex("by_needId", (q) => q.eq("needId", needId))
    .first();
  if (line) return;
  // An act that already has a payout here (booked before prices lived on the
  // booking) keeps what it was set to be paid.
  const payouts = await ctx.db
    .query("eventBandPayments")
    .withIndex("by_eventId_and_organizationId", (q) =>
      q.eq("eventId", slot.eventId).eq("organizationId", act.organizationId),
    )
    .take(10);
  const payout = payouts.find((row) => row.status !== "cancelled");
  if (payout) {
    await setPositionPrice(ctx, needId, bookingPriceFromPayout(payout));
    return;
  }
  const profile = await ctx.db
    .query("organizationProfiles")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", act.organizationId))
    .unique();
  const price = bookingPriceFromProfile({
    performerHourlyRateUsd: profile?.performerHourlyRateUsd,
    bandMemberCount: profile?.bandMembers?.length ?? 0,
    setStartsAt: act.setStartsAt ?? slot.setStartsAt,
    setEndsAt: act.setEndsAt ?? slot.setEndsAt,
  });
  if (price) await setPositionPrice(ctx, needId, price);
}

/**
 * Give the act filling a priced position a payout at that price, once the
 * booking settles (see `bandPayments.seedFromBookingInternal`; a no-op when
 * the act already has one). Scheduled rather than called so this module stays
 * free of the payouts module's imports.
 */
export async function scheduleSeedPayoutFromBooking(
  ctx: MutationCtx,
  needId: Id<"eventArtistNeeds">,
) {
  await ctx.scheduler.runAfter(0, internal.bandPayments.seedFromBookingInternal, { needId });
}
