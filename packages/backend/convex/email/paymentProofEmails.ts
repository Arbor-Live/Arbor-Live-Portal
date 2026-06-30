import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { PaymentProofMethod } from "../lib/paymentProof";
import { paymentMethodLabel } from "../lib/paymentProof";
import {
  EVENT_TIMEZONE,
  formatEventDateRange,
  publicQuoteUrl,
  requestTrackingUrl,
  subjectForTemplate,
} from "./constants";
import { enqueueEmail } from "./enqueue";

type PaymentProofPortal = "quote" | "request";

function portalUrl(portal: PaymentProofPortal, token: string) {
  return portal === "request" ? requestTrackingUrl(token) : publicQuoteUrl(token);
}

function buildSubmittedPayload(
  invoice: Doc<"invoices">,
  event: Doc<"events">,
  args: {
    paymentMethod: PaymentProofMethod;
    paymentReference: string;
    financeContactEmail?: string;
    publicQuoteToken: string;
    portal: PaymentProofPortal;
    recipientName?: string;
  },
) {
  return {
    eventTitle: event.title,
    venueName: event.venueName,
    dateRangeLabel: formatEventDateRange(event.startAt, event.endAt, event.timezone || EVENT_TIMEZONE),
    invoiceNumber: invoice.invoiceNumber,
    quoteTotalUsd: invoice.totalUsd,
    paymentMethodLabel: paymentMethodLabel(args.paymentMethod),
    paymentReference: args.paymentReference,
    financeContactEmail: args.financeContactEmail,
    portalUrl: portalUrl(args.portal, args.publicQuoteToken),
    recipientName: args.recipientName,
    managerName: invoice.managerName,
    managerEmail: invoice.managerEmail,
  };
}

export async function schedulePaymentProofSubmittedEmails(
  ctx: MutationCtx,
  args: {
    invoice: Doc<"invoices">;
    event: Doc<"events">;
    paymentMethod: PaymentProofMethod;
    paymentReference: string;
    financeContactEmail?: string;
    publicQuoteToken: string;
    portal: PaymentProofPortal;
  },
) {
  const subject = subjectForTemplate("payment_proof_submitted", args.event.title);
  const fingerprint = `${args.event._id}:${args.paymentReference}:${Date.now()}`;
  const clientEmail = args.invoice.clientEmail?.trim().toLowerCase();

  if (clientEmail) {
    await enqueueEmail(ctx, {
      template: "payment_proof_submitted",
      to: clientEmail,
      subject,
      eventId: args.event._id,
      idempotencyKey: `payment_proof_submitted:${fingerprint}:client:${clientEmail}`,
      payload: buildSubmittedPayload(args.invoice, args.event, {
        ...args,
        recipientName: args.invoice.clientContactName ?? undefined,
      }),
      replyTo: args.invoice.managerEmail ? [args.invoice.managerEmail] : undefined,
    });
  }

  if (args.financeContactEmail && args.financeContactEmail !== clientEmail) {
    await enqueueEmail(ctx, {
      template: "payment_proof_submitted",
      to: args.financeContactEmail,
      subject,
      eventId: args.event._id,
      idempotencyKey: `payment_proof_submitted:${fingerprint}:finance:${args.financeContactEmail}`,
      payload: buildSubmittedPayload(args.invoice, args.event, args),
      replyTo: args.invoice.managerEmail ? [args.invoice.managerEmail] : undefined,
    });
  }

  if (args.invoice.managerEmail) {
    const managerEmail = args.invoice.managerEmail.trim().toLowerCase();
    if (managerEmail && managerEmail !== clientEmail && managerEmail !== args.financeContactEmail) {
      await enqueueEmail(ctx, {
        template: "payment_proof_submitted",
        to: managerEmail,
        subject: subjectForTemplate("payment_proof_submitted", `${args.event.title} (internal)`),
        eventId: args.event._id,
        idempotencyKey: `payment_proof_submitted:${fingerprint}:manager:${managerEmail}`,
        payload: buildSubmittedPayload(args.invoice, args.event, {
          ...args,
          recipientName: args.invoice.managerName,
        }),
      });
    }
  }
}

export async function schedulePaymentProofReminderEmail(
  ctx: MutationCtx,
  args: {
    invoice: Doc<"invoices">;
    event: Doc<"events">;
    reminderKey: string;
    publicQuoteToken: string;
    portal: PaymentProofPortal;
    recipient: { email: string; name?: string };
    reminderKind: "first" | "weekly";
    lateFeeUsd: number;
    isOverdue: boolean;
    weeksUntilLateFee: number;
  },
) {
  await enqueueEmail(ctx, {
    template: "payment_proof_reminder",
    to: args.recipient.email,
    subject: subjectForTemplate("payment_proof_reminder", args.event.title),
    eventId: args.event._id,
    idempotencyKey: `payment_proof_reminder:${args.event._id}:${args.reminderKey}:${args.recipient.email}`,
    payload: {
      eventTitle: args.event.title,
      venueName: args.event.venueName,
      dateRangeLabel: formatEventDateRange(
        args.event.startAt,
        args.event.endAt,
        args.event.timezone || EVENT_TIMEZONE,
      ),
      invoiceNumber: args.invoice.invoiceNumber,
      quoteTotalUsd: args.invoice.totalUsd,
      portalUrl: portalUrl(args.portal, args.publicQuoteToken),
      recipientName: args.recipient.name,
      reminderKind: args.reminderKind,
      lateFeeUsd: args.lateFeeUsd,
      isOverdue: args.isOverdue,
      weeksUntilLateFee: args.weeksUntilLateFee,
    },
  });
}
