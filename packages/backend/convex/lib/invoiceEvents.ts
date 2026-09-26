import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { listAdditionallyLinkedEvents } from "./eventInvoiceLinks";

const MAX_EVENTS_PER_INVOICE = 50;

/**
 * Approved quotes that are not stored on `events.invoiceId`. Follow-up quotes
 * share an event that already points at the original invoice, so they never
 * appear in that index. Cap matches the payment queue's event scan (500). A
 * school year is ~300 events, so 500 approvals inside the 90-day lookback is
 * past normal traffic; raise it if recent follow-up quotes drop off the queue.
 */
const APPROVED_INVOICES_WITHOUT_EVENT_CAP = 500;

export async function listEventsByInvoiceId(
  ctx: QueryCtx | MutationCtx,
  invoiceId: Id<"invoices">,
): Promise<Doc<"events">[]> {
  const events = await ctx.db
    .query("events")
    .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoiceId))
    .take(MAX_EVENTS_PER_INVOICE);
  return [...events].sort((a, b) => a.startAt - b.startAt || a._creationTime - b._creationTime);
}

/** Primary `events.invoiceId` plus invoices linked as additional bills on an event. */
export async function listEventsLinkedToInvoice(
  ctx: QueryCtx | MutationCtx,
  invoiceId: Id<"invoices">,
): Promise<Doc<"events">[]> {
  const primary = await listEventsByInvoiceId(ctx, invoiceId);
  const additional = await listAdditionallyLinkedEvents(ctx, invoiceId);
  const seen = new Set(primary.map((event) => event._id));
  const merged = [...primary];
  for (const event of additional) {
    if (seen.has(event._id)) continue;
    seen.add(event._id);
    merged.push(event);
  }
  return merged.sort((a, b) => a.startAt - b.startAt || a._creationTime - b._creationTime);
}

export async function listApprovedInvoicesWithoutEvent(
  ctx: QueryCtx | MutationCtx,
  approvedSinceMs: number,
  skipInvoiceIds?: ReadonlySet<Id<"invoices">>,
): Promise<Doc<"invoices">[]> {
  const approved = await ctx.db
    .query("invoices")
    .withIndex("by_approvedAt", (q) => q.gte("approvedAt", approvedSinceMs))
    .take(APPROVED_INVOICES_WITHOUT_EVENT_CAP);
  const missing: Doc<"invoices">[] = [];
  for (const invoice of approved) {
    if (invoice.status === "void") continue;
    if ((invoice.clientApprovalStatus ?? "pending") !== "approved") continue;
    if (skipInvoiceIds?.has(invoice._id)) continue;
    const linked = await listEventsLinkedToInvoice(ctx, invoice._id);
    if (linked.length > 0) continue;
    missing.push(invoice);
  }
  return missing;
}
