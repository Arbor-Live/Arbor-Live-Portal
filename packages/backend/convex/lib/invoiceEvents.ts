import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

const MAX_EVENTS_PER_INVOICE = 50;

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
