import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { listEventsByInvoiceId } from "./invoiceEvents";

const MAX_LINKED_DAYS = 50;

/**
 * Events that share an invoice and/or a source booking request with this one,
 * sorted by start time: the day switcher for events outside a multi-day group
 * (a recurring series' occurrences on a shared invoice, or days that moved to
 * another invoice). A multi-day booking's own days come from its group.
 */
export async function listSiblingDayEvents(
  ctx: QueryCtx | MutationCtx,
  event: Doc<"events">,
): Promise<Doc<"events">[]> {
  const byId = new Map<string, Doc<"events">>();
  byId.set(event._id, event);

  if (event.invoiceId) {
    for (const row of await listEventsByInvoiceId(ctx, event.invoiceId)) {
      byId.set(row._id, row);
    }
  }

  if (event.sourceEventRequestId) {
    const byRequest = await ctx.db
      .query("events")
      .withIndex("by_sourceEventRequestId", (q) =>
        q.eq("sourceEventRequestId", event.sourceEventRequestId!),
      )
      .take(MAX_LINKED_DAYS);
    for (const row of byRequest) {
      byId.set(row._id, row);
    }
  }

  return [...byId.values()].sort(
    (a, b) => a.startAt - b.startAt || a._creationTime - b._creationTime,
  );
}
