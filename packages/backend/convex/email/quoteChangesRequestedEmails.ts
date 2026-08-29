import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { listEventsByInvoiceId } from "../lib/invoiceEvents";
import {
  EVENT_TIMEZONE,
  formatEventDateRange,
  invoiceDashboardUrl,
  subjectForTemplate,
} from "./constants";
import { enqueueEmail } from "./enqueue";

export async function scheduleQuoteChangesRequestedEmail(
  ctx: MutationCtx,
  args: {
    invoice: Doc<"invoices">;
    changeNote: string;
    requestedAt: number;
  },
) {
  const managerEmail = args.invoice.managerEmail?.trim().toLowerCase();
  if (!managerEmail) return;

  const linkedEvents = await listEventsByInvoiceId(ctx, args.invoice._id);
  const event = linkedEvents[0] ?? null;
  const eventTitle =
    event?.title?.trim() ||
    args.invoice.clientGroupName?.trim() ||
    args.invoice.invoiceNumber;
  const dateRangeLabel = event
    ? formatEventDateRange(event.startAt, event.endAt, event.timezone || EVENT_TIMEZONE)
    : "—";

  await enqueueEmail(ctx, {
    template: "quote_changes_requested",
    to: managerEmail,
    subject: subjectForTemplate("quote_changes_requested", eventTitle),
    eventId: event?._id,
    idempotencyKey: `quote_changes_requested:${args.invoice._id}:${args.requestedAt}`,
    replyTo: args.invoice.clientEmail ? [args.invoice.clientEmail] : undefined,
    payload: {
      recipientName: args.invoice.managerName,
      eventTitle,
      venueName: event?.venueName,
      dateRangeLabel,
      invoiceNumber: args.invoice.invoiceNumber,
      clientContactName: args.invoice.clientContactName,
      clientGroupName: args.invoice.clientGroupName,
      changeNote: args.changeNote,
      invoiceUrl: invoiceDashboardUrl(args.invoice._id),
    },
  });
}
