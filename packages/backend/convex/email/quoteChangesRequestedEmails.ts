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

export async function scheduleQuoteChangesRequestedEmail(
  ctx: MutationCtx,
  args: {
    invoice: Doc<"invoices">;
    changeNote: string;
    requestedAt: number;
  },
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
      template: "quote_changes_requested",
      to: recipient.to,
      subject: subjectForTemplate("quote_changes_requested", eventTitle),
      eventId: event?._id,
      idempotencyKey: `quote_changes_requested:${args.invoice._id}:${args.requestedAt}${recipient.keySuffix}`,
      replyTo: args.invoice.clientEmail ? [args.invoice.clientEmail] : undefined,
      payload: {
        recipientName: recipient.name,
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
}
