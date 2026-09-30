import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { listEventsLinkedToInvoice } from "../lib/invoiceEvents";
import { resolvePortalTokenForInvoice } from "../lib/paymentProof";
import {
  EVENT_TIMEZONE,
  formatEventDateRange,
  publicQuoteUrl,
  requestTrackingUrl,
  subjectForTemplate,
} from "./constants";
import { enqueueEmail } from "./enqueue";

/** Tell the client an approved quote changed and needs their approval again. */
export async function scheduleQuoteUpdatedEmail(
  ctx: MutationCtx,
  args: {
    invoice: Doc<"invoices">;
    previousTotalUsd: number;
    newTotalUsd: number;
    changeNote?: string;
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

  await enqueueEmail(ctx, {
    template: "quote_updated",
    to: clientEmail,
    subject: subjectForTemplate("quote_updated", eventTitle),
    eventId: event?._id,
    idempotencyKey: `quote_updated:${args.invoice._id}:${args.revisionNumber}`,
    replyTo: args.invoice.managerEmail ? [args.invoice.managerEmail] : undefined,
    payload: {
      recipientName: args.invoice.clientContactName,
      eventTitle,
      venueName: event?.venueName,
      dateRangeLabel,
      invoiceNumber: args.invoice.invoiceNumber,
      previousTotalUsd: args.previousTotalUsd,
      newTotalUsd: args.newTotalUsd,
      changeNote: args.changeNote,
      portalUrl:
        portal.portal === "request" ? requestTrackingUrl(portal.token) : publicQuoteUrl(portal.token),
      managerName: args.invoice.managerName,
      managerEmail: args.invoice.managerEmail,
    },
  });
}
