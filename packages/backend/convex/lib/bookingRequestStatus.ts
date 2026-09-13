import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { isQuoteApproved } from "./eventStatus";
import { recordEventRequestStatusTransition } from "./statusTransitions";

export type BookingRequestStatus =
  | "submitted"
  | "action_required"
  | "pending_client"
  | "converted"
  | "declined"
  /** @deprecated Legacy status; migrated to action_required. */
  | "in_review";

type LinkedInvoice = Pick<
  Doc<"invoices">,
  | "_id"
  | "status"
  | "clientApprovalStatus"
  | "clientReviewReadyAt"
  | "sourceEventRequestId"
>;

function nextStatusFromInvoice(invoice: LinkedInvoice): Exclude<BookingRequestStatus, "submitted" | "in_review"> {
  if (invoice.status === "void") return "declined";
  if (isQuoteApproved(invoice.clientApprovalStatus)) return "converted";
  const awaitingClient =
    Boolean(invoice.clientReviewReadyAt) &&
    (invoice.clientApprovalStatus ?? "pending") === "pending";
  if (awaitingClient) return "pending_client";
  // Draft / not sent / changes_requested — staff still has work.
  return "action_required";
}

/**
 * Keep the booking request status aligned with its linked quote.
 * - approved → converted
 * - void → declined
 * - sent to client, awaiting decision → pending_client
 * - otherwise (draft / not sent / changes_requested) → action_required
 */
export async function syncBookingRequestStatusFromInvoice(
  ctx: MutationCtx,
  invoice: LinkedInvoice,
  options?: { actorUserId?: string; at?: number },
) {
  const requestId = invoice.sourceEventRequestId;
  if (!requestId) return;

  const request = await ctx.db.get(requestId);
  if (!request) return;

  const now = options?.at ?? Date.now();
  const fromStatus = request.status;
  const toStatus = nextStatusFromInvoice(invoice);
  if (fromStatus === toStatus) return;

  if (toStatus === "declined") {
    await ctx.db.patch(requestId, {
      status: "declined",
      declinedAt: now,
      declineReasonCode: request.declineReasonCode ?? "client_withdrew",
      updatedAt: now,
    });
    await recordEventRequestStatusTransition(ctx, requestId, fromStatus, "declined", {
      actorUserId: options?.actorUserId,
      at: now,
      reasonCode: "client_withdrew",
      reasonNote: "Linked quote voided",
    });
    return;
  }

  if (toStatus === "converted") {
    await ctx.db.patch(requestId, {
      status: "converted",
      convertedAt: request.convertedAt ?? now,
      reviewedAt: request.reviewedAt ?? now,
      declinedAt: undefined,
      declineReasonCode: undefined,
      declineReasonNote: undefined,
      updatedAt: now,
    });
    await recordEventRequestStatusTransition(ctx, requestId, fromStatus, "converted", {
      actorUserId: options?.actorUserId,
      at: now,
    });
    return;
  }

  await ctx.db.patch(requestId, {
    status: toStatus,
    convertedAt: undefined,
    declinedAt: undefined,
    declineReasonCode: undefined,
    declineReasonNote: undefined,
    reviewedAt: request.reviewedAt ?? now,
    updatedAt: now,
  });
  await recordEventRequestStatusTransition(ctx, requestId, fromStatus, toStatus, {
    actorUserId: options?.actorUserId,
    at: now,
  });
}

export async function syncBookingRequestStatusForInvoiceId(
  ctx: MutationCtx,
  invoiceId: Id<"invoices">,
  options?: { actorUserId?: string; at?: number },
) {
  const invoice = await ctx.db.get(invoiceId);
  if (!invoice) return;
  await syncBookingRequestStatusFromInvoice(ctx, invoice, options);
}
