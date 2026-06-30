import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { listEventsByInvoiceId } from "../lib/invoiceEvents";
import { EVENT_TIMEZONE, formatEventDateRange, subjectForTemplate } from "./constants";
import { enqueueEmail } from "./enqueue";

export function shouldNotifyPayingParty(args: {
  nextClientIsPaymentSubmitter: boolean | undefined;
  nextPayingPartyEmail: string | undefined;
  previousPayingPartyEmail: string | undefined;
  notifiedEmail: string | undefined;
}) {
  const nextEmail = args.nextPayingPartyEmail?.trim().toLowerCase();
  if (args.nextClientIsPaymentSubmitter || !nextEmail) return false;

  const previousEmail = args.previousPayingPartyEmail?.trim().toLowerCase();
  const notifiedEmail = args.notifiedEmail?.trim().toLowerCase();

  if (nextEmail !== previousEmail) return true;
  return notifiedEmail !== nextEmail;
}

export async function schedulePayingPartyAddedEmail(
  ctx: MutationCtx,
  args: {
    invoice: Doc<"invoices">;
    payingPartyEmail: string;
    payingPartyName?: string;
    approvedByName: string;
    idempotencySuffix: string;
  },
) {
  const linkedEvents = await listEventsByInvoiceId(ctx, args.invoice._id);
  const event = linkedEvents[0];

  const managerEmail = args.invoice.managerEmail?.trim();
  const to = args.payingPartyEmail.trim().toLowerCase();
  if (!to) return false;

  const eventTitle =
    event?.title ??
    args.invoice.clientGroupName?.trim() ??
    `Quote ${args.invoice.invoiceNumber}`;
  const dateRangeLabel = event
    ? formatEventDateRange(event.startAt, event.endAt, event.timezone || EVENT_TIMEZONE)
    : `Quote issued ${args.invoice.issueDate}`;

  await enqueueEmail(ctx, {
    template: "paying_party_added",
    to,
    replyTo: managerEmail ? [managerEmail] : undefined,
    subject: subjectForTemplate("paying_party_added", eventTitle),
    eventId: event?._id,
    idempotencyKey: `paying_party_added:${args.invoice._id}:${to}:${args.idempotencySuffix}`,
    payload: {
      recipientName: args.payingPartyName?.trim() || undefined,
      approvedByName: args.approvedByName,
      clientGroupName: args.invoice.clientGroupName?.trim() || undefined,
      eventTitle,
      venueName: event?.venueName ?? undefined,
      dateRangeLabel,
      invoiceNumber: args.invoice.invoiceNumber,
      quoteTotalUsd: args.invoice.totalUsd,
      managerName: args.invoice.managerName,
      managerEmail,
    },
  });

  return true;
}

export async function markPayingPartyNotified(
  ctx: MutationCtx,
  invoiceId: Doc<"invoices">["_id"],
  payingPartyEmail: string,
) {
  const now = Date.now();
  await ctx.db.patch(invoiceId, {
    payingPartyNotifiedEmail: payingPartyEmail.trim().toLowerCase(),
    payingPartyNotifiedAt: now,
    updatedAt: now,
  });
}
