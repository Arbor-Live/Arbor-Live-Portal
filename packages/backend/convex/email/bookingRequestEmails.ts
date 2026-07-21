import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
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
  const subject = subjectForTemplate("booking_request_received", eventName);

  await enqueueEmail(ctx, {
    template: "booking_request_received",
    to: request.email,
    subject,
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

export async function scheduleBookingQuoteReadyEmail(
  ctx: MutationCtx,
  args: {
    request: Pick<
      Doc<"eventRequests">,
      "_id" | "email" | "firstName" | "requestNumber" | "eventName" | "publicToken"
    >;
    invoice: Pick<
      Doc<"invoices">,
      "_id" | "invoiceNumber" | "totalUsd" | "managerName" | "managerEmail" | "clientReviewReadyAt"
    >;
  },
) {
  const { request, invoice } = args;
  const publicToken = request.publicToken;
  const readyAt = invoice.clientReviewReadyAt;
  if (!publicToken || !readyAt) return;

  const requestNumber = request.requestNumber ?? `LEGACY-${request._id}`;
  const recipientName = request.firstName.trim() || undefined;
  const eventName = request.eventName?.trim() || undefined;
  const subjectContext = eventName ?? requestNumber;
  const managerEmail = invoice.managerEmail?.trim();

  await enqueueEmail(ctx, {
    template: "booking_quote_ready",
    to: request.email,
    cc: managerEmail ? [managerEmail] : undefined,
    replyTo: managerEmail ? [managerEmail] : undefined,
    subject: subjectForTemplate("booking_quote_ready", subjectContext),
    idempotencyKey: `booking_quote_ready:${invoice._id}:${readyAt}`,
    payload: {
      recipientName,
      requestNumber,
      eventName,
      invoiceNumber: invoice.invoiceNumber,
      quoteTotalUsd: invoice.totalUsd,
      trackingUrl: requestTrackingUrl(publicToken),
      managerName: invoice.managerName,
      managerEmail,
      invoiceId: invoice._id,
    },
  });
}
