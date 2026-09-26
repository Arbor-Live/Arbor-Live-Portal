import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { listEventsLinkedToInvoice } from "../lib/invoiceEvents";
import {
  EVENT_TIMEZONE,
  formatEventDateRange,
  invoiceDashboardUrl,
  subjectForTemplate,
} from "./constants";
import { enqueueEmail } from "./enqueue";

/** Notify the invoice manager when a client approves a quote. */
export async function scheduleQuoteApprovedEmail(
  ctx: MutationCtx,
  args: { invoice: Doc<"invoices">; approvedAt: number },
) {
  const managerEmail = args.invoice.managerEmail?.trim().toLowerCase();
  if (!managerEmail) return;

  const linkedEvents = await listEventsLinkedToInvoice(ctx, args.invoice._id);
  const event = linkedEvents[0] ?? null;
  const eventTitle =
    event?.title?.trim() ||
    args.invoice.clientGroupName?.trim() ||
    args.invoice.invoiceNumber;
  const dateRangeLabel = event
    ? formatEventDateRange(event.startAt, event.endAt, event.timezone || EVENT_TIMEZONE)
    : "—";

  await enqueueEmail(ctx, {
    template: "quote_approved",
    to: managerEmail,
    subject: subjectForTemplate("quote_approved", eventTitle),
    eventId: event?._id,
    idempotencyKey: `quote_approved:${args.invoice._id}:${args.approvedAt}`,
    payload: {
      recipientName: args.invoice.managerName,
      eventTitle,
      venueName: event?.venueName,
      dateRangeLabel,
      invoiceNumber: args.invoice.invoiceNumber,
      quoteTotalUsd: args.invoice.totalUsd,
      clientContactName: args.invoice.clientContactName,
      clientGroupName: args.invoice.clientGroupName,
      invoiceUrl: invoiceDashboardUrl(args.invoice._id),
    },
  });
}
