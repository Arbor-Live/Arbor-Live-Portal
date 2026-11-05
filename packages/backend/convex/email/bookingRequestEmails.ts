import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { bookingDeclineReasonLabel } from "@arbor/format";
import { listAdminEmailsForVertical } from "../lib/auth";
import {
  bookingRequestsAdminUrl,
  requestTrackingUrl,
  subjectForTemplate,
} from "./constants";
import { enqueueEmail } from "./enqueue";

export async function scheduleBookingRequestReceivedEmail(
  ctx: MutationCtx,
  request: Pick<
    Doc<"eventRequests">,
    | "_id"
    | "email"
    | "firstName"
    | "lastName"
    | "requestNumber"
    | "eventName"
    | "eventDateText"
    | "organization"
    | "publicToken"
    | "submittedAt"
  >,
) {
  const requestNumber = request.requestNumber ?? `LEGACY-${request._id}`;
  const publicToken = request.publicToken;
  if (!publicToken) return;

  const recipientName = request.firstName.trim() || undefined;
  const eventName = request.eventName?.trim() || "Your event";
  await enqueueEmail(ctx, {
    template: "booking_request_received",
    to: request.email,
    booking: { ref: { requestId: request._id } },
    idempotencyKey: `booking_request_received:${request._id}:${request.submittedAt}`,
    payload: {
      recipientName,
      requestNumber,
      eventName,
      eventDateText: request.eventDateText,
      trackingUrl: requestTrackingUrl(publicToken),
    },
  });

  const requesterName =
    [request.firstName, request.lastName].map((part) => part.trim()).filter(Boolean).join(" ") ||
    recipientName ||
    "Requester";
  const reviewUrl = bookingRequestsAdminUrl(request._id);
  const adminSubject = subjectForTemplate("booking_request_admin", eventName);

  for (const to of await listAdminEmailsForVertical(ctx, "Crew")) {
    await enqueueEmail(ctx, {
      template: "booking_request_admin",
      to,
      subject: adminSubject,
      idempotencyKey: `booking_request_admin:${request._id}:${to}`,
      payload: {
        requesterName,
        requesterEmail: request.email,
        requestNumber,
        eventName,
        eventDateText: request.eventDateText,
        organization: request.organization?.trim() || undefined,
        reviewUrl,
      },
    });
  }
}

export async function scheduleBookingRequestDeclinedEmail(
  ctx: MutationCtx,
  request: Pick<
    Doc<"eventRequests">,
    | "_id"
    | "email"
    | "firstName"
    | "requestNumber"
    | "eventName"
    | "eventDateText"
    | "publicToken"
    | "declinedAt"
    | "declineReasonCode"
    | "declineReasonNote"
  >,
) {
  const publicToken = request.publicToken;
  if (!publicToken) return;
  const requestNumber = request.requestNumber ?? `LEGACY-${request._id}`;
  await enqueueEmail(ctx, {
    template: "booking_request_declined",
    to: request.email,
    booking: { ref: { requestId: request._id } },
    idempotencyKey: `booking_request_declined:${request._id}:${request.declinedAt ?? "na"}`,
    payload: {
      recipientName: request.firstName.trim() || undefined,
      requestNumber,
      eventName: request.eventName?.trim() || undefined,
      eventDateText: request.eventDateText,
      reasonLabel: bookingDeclineReasonLabel(request.declineReasonCode),
      reasonNote: request.declineReasonNote?.trim() || undefined,
      trackingUrl: requestTrackingUrl(publicToken),
    },
  });
}

export async function scheduleBookingQuoteReadyEmail(
  ctx: MutationCtx,
  args: {
    request: Pick<
      Doc<"eventRequests">,
      "_id" | "email" | "firstName" | "requestNumber" | "eventName" | "publicToken"
    >;
    invoice: Pick<
      Doc<"invoices">,
      | "_id"
      | "invoiceNumber"
      | "totalUsd"
      | "managerName"
      | "managerEmail"
      | "clientReviewReadyAt"
      | "clientReadyMessage"
      | "billingFinalizedAt"
      | "paymentOpenedEarlyAt"
    >;
  },
) {
  const { request, invoice } = args;
  const publicToken = request.publicToken;
  const readyAt = invoice.clientReviewReadyAt;
  const managerMessage = invoice.clientReadyMessage?.trim();
  if (!publicToken || !readyAt || !managerMessage) return;

  const requestNumber = request.requestNumber ?? `LEGACY-${request._id}`;
  const recipientName = request.firstName.trim() || undefined;
  const eventName = request.eventName?.trim() || undefined;
  const managerEmail = invoice.managerEmail?.trim();

  await enqueueEmail(ctx, {
    template: "booking_quote_ready",
    to: request.email,
    booking: { ref: { requestId: request._id } },
    idempotencyKey: `booking_quote_ready:${invoice._id}:${readyAt}`,
    payload: {
      recipientName,
      requestNumber,
      eventName,
      invoiceNumber: invoice.invoiceNumber,
      quoteTotalUsd: invoice.totalUsd,
      paymentOpen: Boolean(invoice.billingFinalizedAt || invoice.paymentOpenedEarlyAt),
      trackingUrl: requestTrackingUrl(publicToken),
      managerName: invoice.managerName,
      managerEmail,
      managerMessage,
      invoiceId: invoice._id,
    },
  });
}
