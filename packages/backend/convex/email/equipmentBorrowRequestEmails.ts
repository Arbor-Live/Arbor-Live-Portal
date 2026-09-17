import { formatDateTimeRange } from "@arbor/format";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { listAdminEmailsForVertical } from "../lib/auth";
import { equipmentBorrowRequestsUrl, subjectForTemplate } from "./constants";
import { enqueueEmail } from "./enqueue";

type BorrowRequestSummary = Pick<
  Doc<"equipmentBorrowRequests">,
  | "_id"
  | "requestNumber"
  | "purpose"
  | "requesterName"
  | "requesterEmail"
  | "startAt"
  | "endAt"
  | "lines"
>;

function summarizeLines(request: BorrowRequestSummary) {
  if (request.lines.length === 0) return "No equipment";
  return request.lines.map((line) => `${line.quantity}× ${line.label}`).join(", ");
}

export async function scheduleEquipmentBorrowRequestSubmittedEmail(
  ctx: MutationCtx,
  request: BorrowRequestSummary,
) {
  const dateRangeLabel = formatDateTimeRange(request.startAt, request.endAt);
  const itemSummary = summarizeLines(request);
  const reviewUrl = equipmentBorrowRequestsUrl();
  const subject = subjectForTemplate("equipment_borrow_request_admin", request.purpose);

  for (const to of await listAdminEmailsForVertical(ctx, "Crew")) {
    await enqueueEmail(ctx, {
      template: "equipment_borrow_request_admin",
      to,
      subject,
      idempotencyKey: `equipment_borrow_request_admin:${request._id}:${to}`,
      payload: {
        requesterName: request.requesterName,
        requesterEmail: request.requesterEmail,
        requestNumber: request.requestNumber,
        purpose: request.purpose,
        dateRangeLabel,
        itemSummary,
        reviewUrl,
      },
    });
  }
}

export async function scheduleEquipmentBorrowRequestDecidedEmail(
  ctx: MutationCtx,
  args: {
    request: BorrowRequestSummary;
    approved: boolean;
    reviewNote?: string;
  },
) {
  const { request, approved, reviewNote } = args;
  if (!request.requesterEmail) return;

  const dateRangeLabel = formatDateTimeRange(request.startAt, request.endAt);
  const subject = subjectForTemplate(
    "equipment_borrow_request_decided",
    `${request.purpose} — ${approved ? "approved" : "not approved"}`,
  );

  await enqueueEmail(ctx, {
    template: "equipment_borrow_request_decided",
    to: request.requesterEmail,
    subject,
    idempotencyKey: `equipment_borrow_request_decided:${request._id}:${approved ? "approved" : "rejected"}`,
    payload: {
      recipientName: request.requesterName,
      requestNumber: request.requestNumber,
      purpose: request.purpose,
      dateRangeLabel,
      approved,
      reviewNote: reviewNote?.trim() || undefined,
      requestsUrl: equipmentBorrowRequestsUrl(),
    },
  });
}
