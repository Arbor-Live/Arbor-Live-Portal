import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { listBookingFollowers } from "../lib/bookingFollowers";
import { listEventsLinkedToInvoice } from "../lib/invoiceEvents";
import {
  EVENT_TIMEZONE,
  formatEventDateRange,
  invoiceDashboardUrl,
  subjectForTemplate,
} from "./constants";
import { enqueueEmail } from "./enqueue";

/** Notify the invoice manager, and anyone following the booking, when a client approves a quote. */
export async function scheduleQuoteApprovedEmail(
  ctx: MutationCtx,
  args: { invoice: Doc<"invoices">; approvedAt: number },
) {
  const managerEmail = args.invoice.managerEmail?.trim().toLowerCase();
  const followers = await listBookingFollowers(
    ctx,
    { kind: "invoice", invoiceId: args.invoice._id },
    managerEmail
      ? { userIds: [args.invoice.managerUserId], emails: [managerEmail] }
      : undefined,
  );
  if (!managerEmail && followers.length === 0) return;

  const linkedEvents = await listEventsLinkedToInvoice(ctx, args.invoice._id);
  const event = linkedEvents[0] ?? null;
  const eventTitle =
    event?.title?.trim() ||
    args.invoice.clientGroupName?.trim() ||
    args.invoice.invoiceNumber;
  const dateRangeLabel = event
    ? formatEventDateRange(event.startAt, event.endAt, event.timezone || EVENT_TIMEZONE)
    : "—";

  const recipients = [
    ...(managerEmail
      ? [{ to: managerEmail, name: args.invoice.managerName, keySuffix: "" }]
      : []),
    ...followers.map((follower) => ({
      to: follower.email,
      name: follower.name,
      keySuffix: `:follower:${follower.userId}`,
    })),
  ];
  for (const recipient of recipients) {
    await enqueueEmail(ctx, {
      template: "quote_approved",
      to: recipient.to,
      subject: subjectForTemplate("quote_approved", eventTitle),
      eventId: event?._id,
      idempotencyKey: `quote_approved:${args.invoice._id}:${args.approvedAt}${recipient.keySuffix}`,
      payload: {
        recipientName: recipient.name,
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
}
