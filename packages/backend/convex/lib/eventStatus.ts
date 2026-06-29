import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { listEventsByInvoiceId } from "./invoiceEvents";

export const EVENT_PIPELINE_STATUSES = [
  "tentative",
  "logistics",
  "scheduling",
  "ready",
] as const;

export type EventPipelineStatus = (typeof EVENT_PIPELINE_STATUSES)[number];

export const LEGACY_EVENT_STATUSES = ["draft", "active", "completed"] as const;

export type LegacyEventStatus = (typeof LEGACY_EVENT_STATUSES)[number];

export type EventStatus = EventPipelineStatus | "cancelled";

export const eventStatusValue = v.union(
  v.literal("tentative"),
  v.literal("logistics"),
  v.literal("scheduling"),
  v.literal("ready"),
  v.literal("cancelled"),
  v.literal("draft"),
  v.literal("active"),
  v.literal("completed"),
);

export function normalizeEventStatus(status: string | undefined): EventStatus {
  switch (status) {
    case "draft":
      return "tentative";
    case "active":
      return "scheduling";
    case "completed":
      return "ready";
    case "tentative":
    case "logistics":
    case "scheduling":
    case "ready":
    case "cancelled":
      return status;
    default:
      return "tentative";
  }
}

export function isQuoteApproved(clientApprovalStatus: string | undefined) {
  return clientApprovalStatus === "approved";
}

/** Advance Tentative → Logistics when a linked quote is approved. */
export async function syncLinkedEventStatusFromInvoice(
  ctx: MutationCtx,
  invoiceId: Id<"invoices">,
  clientApprovalStatus: string | undefined,
) {
  const events = await listEventsByInvoiceId(ctx, invoiceId);
  if (!events.length) return;

  const now = Date.now();

  for (const event of events) {
    const status = normalizeEventStatus(event.status);

    if (isQuoteApproved(clientApprovalStatus) && status === "tentative") {
      await ctx.db.patch(event._id, { status: "logistics", updatedAt: now });
      continue;
    }

    if (
      (clientApprovalStatus === "pending" || clientApprovalStatus === "changes_requested") &&
      status === "logistics"
    ) {
      await ctx.db.patch(event._id, { status: "tentative", updatedAt: now });
    }
  }
}

export async function syncEventStatusForLinkedInvoice(
  ctx: MutationCtx,
  eventId: Id<"events">,
  invoiceId: Id<"invoices"> | undefined,
  currentStatus: string | undefined,
) {
  if (!invoiceId) return normalizeEventStatus(currentStatus);
  const invoice = await ctx.db.get(invoiceId);
  if (!invoice) return normalizeEventStatus(currentStatus);

  const status = normalizeEventStatus(currentStatus);
  if (isQuoteApproved(invoice.clientApprovalStatus) && status === "tentative") {
    await ctx.db.patch(eventId, { status: "logistics", updatedAt: Date.now() });
    return "logistics" as const;
  }
  return status;
}
