import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { resolveBookingEmail } from "../lib/bookingEmail";
import { listEventsLinkedToInvoice } from "../lib/invoiceEvents";
import { resolvePortalTokenForInvoice } from "../lib/paymentProof";
import {
  EVENT_TIMEZONE,
  formatEventDateRange,
  publicQuoteUrl,
  requestTrackingUrl,
} from "./constants";
import { enqueueEmail } from "./enqueue";

/**
 * Tell the client their quote changed and needs their decision: an approved
 * quote staff changed, our reply to the changes they asked for, or a revision
 * staff sent on their own.
 */
export async function scheduleQuoteUpdatedEmail(
  ctx: MutationCtx,
  args: {
    invoice: Doc<"invoices">;
    reason?: "approved" | "changes_requested" | "revised";
    /**
     * The total they approved, asked about, or were last sent. Missing when
     * they were never sent a version, so there's nothing to compare.
     */
    previousTotalUsd?: number;
    newTotalUsd: number;
    changeNote?: string;
    /** Their change request, when this answers one. */
    requestNote?: string;
    revisionNumber: number;
  },
) {
  const clientEmail = args.invoice.clientEmail?.trim().toLowerCase();
  if (!clientEmail) return;
  const portal = await resolvePortalTokenForInvoice(ctx, args.invoice);
  if (!portal) return;

  const linkedEvents = await listEventsLinkedToInvoice(ctx, args.invoice._id);
  const event = linkedEvents[0] ?? null;
  const eventTitle =
    event?.title?.trim() || args.invoice.clientGroupName?.trim() || args.invoice.invoiceNumber;
  const dateRangeLabel = event
    ? formatEventDateRange(event.startAt, event.endAt, event.timezone || EVENT_TIMEZONE)
    : "—";

  const idempotencyKey = `quote_updated:${args.invoice._id}:${args.revisionNumber}`;
  await enqueueEmail(ctx, {
    template: "quote_updated",
    to: clientEmail,
    ...(await resolveBookingEmail(ctx, { ref: { invoiceId: args.invoice._id }, idempotencyKey })),
    eventId: event?._id,
    idempotencyKey,
    payload: {
      recipientName: args.invoice.clientContactName,
      eventTitle,
      venueName: event?.venueName,
      dateRangeLabel,
      invoiceNumber: args.invoice.invoiceNumber,
      previousTotalUsd: args.previousTotalUsd,
      newTotalUsd: args.newTotalUsd,
      changeNote: args.changeNote,
      reason: args.reason ?? "approved",
      requestNote: args.requestNote,
      portalUrl:
        portal.portal === "request" ? requestTrackingUrl(portal.token) : publicQuoteUrl(portal.token),
      managerName: args.invoice.managerName,
      managerEmail: args.invoice.managerEmail,
    },
  });
}
