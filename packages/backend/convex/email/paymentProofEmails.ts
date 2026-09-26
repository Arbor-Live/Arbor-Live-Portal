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

function paymentProofEventContext(invoice: Doc<"invoices">, event: Doc<"events"> | null) {
  if (event) {
    return {
      eventTitle: event.title,
      venueName: event.venueName,
      dateRangeLabel: formatEventDateRange(
        event.startAt,
        event.endAt,
        event.timezone || EVENT_TIMEZONE,
      ),
      subjectContext: event.title,
      eventId: event._id,
    };
  }
  const eventTitle = invoice.clientGroupName?.trim() || invoice.invoiceNumber;
  return {
    eventTitle,
    venueName: undefined,
    dateRangeLabel: invoice.dueDate ?? invoice.invoiceNumber,
    subjectContext: eventTitle,
    eventId: undefined,
  };
}

function buildSubmittedPayload(
  invoice: Doc<"invoices">,
  event: Doc<"events"> | null,
  args: {
    paymentMethod: PaymentProofMethod;
    paymentReference: string;
    financeContactEmail?: string;
    publicQuoteToken: string;
    portal: PaymentProofPortal;
    recipientName?: string;
  },
) {
  const context = paymentProofEventContext(invoice, event);
  return {
    eventTitle: context.eventTitle,
    venueName: context.venueName,
    dateRangeLabel: context.dateRangeLabel,
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
    event: Doc<"events"> | null;
    paymentMethod: PaymentProofMethod;
    paymentReference: string;
    financeContactEmail?: string;
    publicQuoteToken: string;
    portal: PaymentProofPortal;
  },
) {
  const context = paymentProofEventContext(args.invoice, args.event);
  const subject = subjectForTemplate("payment_proof_submitted", context.subjectContext);
  const fingerprint = `${context.eventId ?? args.invoice._id}:${args.paymentReference}:${Date.now()}`;
  const clientEmail = args.invoice.clientEmail?.trim().toLowerCase();

  if (clientEmail) {
    await enqueueEmail(ctx, {
      template: "payment_proof_submitted",
      to: clientEmail,
      subject,
      eventId: context.eventId,
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
      eventId: context.eventId,
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
        subject: subjectForTemplate("payment_proof_submitted", `${context.subjectContext} (internal)`),
        eventId: context.eventId,
        idempotencyKey: `payment_proof_submitted:${fingerprint}:manager:${managerEmail}`,
        payload: buildSubmittedPayload(args.invoice, args.event, {
          ...args,
          recipientName: args.invoice.managerName,
        }),
      });
    }
  }
}

export async function schedulePaymentProofRejectedEmails(
  ctx: MutationCtx,
  args: {
    invoice: Doc<"invoices">;
    event: Doc<"events"> | null;
    note: string;
    invalidatedAt: number;
    publicQuoteToken: string;
    portal: PaymentProofPortal;
  },
) {
  const clientEmail = args.invoice.clientEmail?.trim().toLowerCase();
  const payingPartyEmail = args.invoice.paymentSubmitterEmail?.trim().toLowerCase();
  const recipients = new Set<string>();
  if (clientEmail) recipients.add(clientEmail);
  if (payingPartyEmail) recipients.add(payingPartyEmail);

  const context = paymentProofEventContext(args.invoice, args.event);
  for (const to of recipients) {
    await enqueueEmail(ctx, {
      template: "payment_proof_rejected",
      to,
      subject: subjectForTemplate("payment_proof_rejected", context.subjectContext),
      eventId: context.eventId,
      idempotencyKey: `payment_proof_rejected:${context.eventId ?? args.invoice._id}:${to}:${args.invalidatedAt}`,
      replyTo: args.invoice.managerEmail ? [args.invoice.managerEmail] : undefined,
      payload: {
        recipientName:
          to === payingPartyEmail
            ? args.invoice.paymentSubmitterName
            : (args.invoice.clientContactName ?? undefined),
        eventTitle: context.eventTitle,
        venueName: context.venueName,
        dateRangeLabel: context.dateRangeLabel,
        invoiceNumber: args.invoice.invoiceNumber,
        note: args.note,
        portalUrl: portalUrl(args.portal, args.publicQuoteToken),
      },
    });
  }
}

export async function schedulePaymentProofReminderEmail(
  ctx: MutationCtx,
  args: {
    invoice: Doc<"invoices">;
    event: Doc<"events"> | null;
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
  const context = paymentProofEventContext(args.invoice, args.event);
  await enqueueEmail(ctx, {
    template: "payment_proof_reminder",
    to: args.recipient.email,
    subject: subjectForTemplate("payment_proof_reminder", context.subjectContext),
    eventId: context.eventId,
    idempotencyKey: `payment_proof_reminder:${context.eventId ?? args.invoice._id}:${args.reminderKey}:${args.recipient.email}`,
    payload: {
      eventTitle: context.eventTitle,
      venueName: context.venueName,
      dateRangeLabel: context.dateRangeLabel,
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
