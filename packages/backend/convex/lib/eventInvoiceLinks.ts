import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Extra invoices on an event, beyond `events.invoiceId` (the primary).
 * 12 is past the split bills we expect (usually 2–3: deposit, balance, a
 * second host). Revisit if a real event needs more.
 */
export const MAX_ADDITIONAL_INVOICES_PER_EVENT = 12;

/** Same ceiling as `listEventsByInvoiceId` — one invoice rarely covers more events than that. */
const MAX_LINKS_PER_LOOKUP = 50;

export type LinkedInvoiceSummary = {
  _id: Id<"invoices">;
  invoiceNumber: string;
  clientGroupName?: string;
  clientApprovalStatus: Doc<"invoices">["clientApprovalStatus"];
  totalUsd: number;
  artistsSubtotalUsd: number;
  externalRentalsSubtotalUsd: number;
  isPrimary: boolean;
};

/**
 * Drop blanks, duplicates, and the primary. The first id becomes the primary
 * when none was chosen, so a non-empty link set always has one invoice that
 * owns status, the pull list, and the host.
 */
export function splitPrimaryAndAdditional(
  primaryInvoiceId: Id<"invoices"> | undefined,
  additionalInvoiceIds: Id<"invoices">[],
): { primary: Id<"invoices"> | undefined; additional: Id<"invoices">[] } {
  const deduped: Id<"invoices">[] = [];
  const seen = new Set<string>();
  for (const invoiceId of additionalInvoiceIds) {
    if (seen.has(invoiceId)) continue;
    seen.add(invoiceId);
    deduped.push(invoiceId);
  }
  const primary = primaryInvoiceId ?? deduped[0];
  if (!primary) return { primary: undefined, additional: [] };
  const additional = deduped.filter((invoiceId) => invoiceId !== primary);
  if (additional.length > MAX_ADDITIONAL_INVOICES_PER_EVENT) {
    throw new Error(
      `Additional invoices max ${MAX_ADDITIONAL_INVOICES_PER_EVENT}, got ${additional.length}.`,
    );
  }
  return { primary, additional };
}

export function normalizeAdditionalInvoiceIds(
  invoiceIds: Id<"invoices">[],
  primaryInvoiceId: Id<"invoices"> | undefined,
): Id<"invoices">[] {
  const seen = new Set<string>();
  const next: Id<"invoices">[] = [];
  for (const invoiceId of invoiceIds) {
    if (primaryInvoiceId && invoiceId === primaryInvoiceId) continue;
    if (seen.has(invoiceId)) continue;
    seen.add(invoiceId);
    next.push(invoiceId);
  }
  if (next.length > MAX_ADDITIONAL_INVOICES_PER_EVENT) {
    throw new Error(
      `Additional invoices max ${MAX_ADDITIONAL_INVOICES_PER_EVENT}, got ${next.length}.`,
    );
  }
  return next;
}

export async function listAdditionalInvoiceIds(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
): Promise<Id<"invoices">[]> {
  const links = await ctx.db
    .query("eventInvoiceLinks")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(MAX_LINKS_PER_LOOKUP);
  const ids: Id<"invoices">[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    if (seen.has(link.invoiceId)) continue;
    seen.add(link.invoiceId);
    ids.push(link.invoiceId);
  }
  return ids;
}

export async function loadLinkedInvoiceSummaries(
  ctx: QueryCtx | MutationCtx,
  event: Doc<"events">,
): Promise<LinkedInvoiceSummary[]> {
  const extraIds = await listAdditionalInvoiceIds(ctx, event._id);
  const ids: Id<"invoices">[] = [];
  if (event.invoiceId) ids.push(event.invoiceId);
  for (const invoiceId of extraIds) {
    if (invoiceId !== event.invoiceId) ids.push(invoiceId);
  }
  const summaries: LinkedInvoiceSummary[] = [];
  for (const invoiceId of ids) {
    const invoice = await ctx.db.get(invoiceId);
    if (!invoice) continue;
    summaries.push({
      _id: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      clientGroupName: invoice.clientGroupName,
      clientApprovalStatus: invoice.clientApprovalStatus,
      totalUsd: invoice.totalUsd,
      artistsSubtotalUsd: invoice.artistsSubtotalUsd,
      externalRentalsSubtotalUsd: invoice.externalRentalsSubtotalUsd,
      isPrimary: invoice._id === event.invoiceId,
    });
  }
  return summaries;
}

/** Events that reference this invoice as an additional link, not as their primary. */
export async function listAdditionallyLinkedEvents(
  ctx: QueryCtx | MutationCtx,
  invoiceId: Id<"invoices">,
): Promise<Doc<"events">[]> {
  const links = await ctx.db
    .query("eventInvoiceLinks")
    .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoiceId))
    .take(MAX_LINKS_PER_LOOKUP);
  const events: Doc<"events">[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    if (seen.has(link.eventId)) continue;
    seen.add(link.eventId);
    const event = await ctx.db.get(link.eventId);
    if (!event || event.invoiceId === invoiceId) continue;
    events.push(event);
  }
  return events.sort((a, b) => a.startAt - b.startAt || a._creationTime - b._creationTime);
}

/** Replace the event's additional invoices. Caller has already removed the primary. */
export async function replaceAdditionalInvoiceLinks(
  ctx: MutationCtx,
  eventId: Id<"events">,
  invoiceIds: Id<"invoices">[],
) {
  const nextIds = normalizeAdditionalInvoiceIds(invoiceIds, undefined);
  for (const invoiceId of nextIds) {
    const invoice = await ctx.db.get(invoiceId);
    if (!invoice) throw new Error("Invoice not found.");
  }
  const existing = await ctx.db
    .query("eventInvoiceLinks")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(MAX_LINKS_PER_LOOKUP);
  const remaining = new Set(nextIds);
  for (const row of existing) {
    if (remaining.has(row.invoiceId)) {
      remaining.delete(row.invoiceId);
      continue;
    }
    await ctx.db.delete(row._id);
  }
  const now = Date.now();
  for (const invoiceId of remaining) {
    await ctx.db.insert("eventInvoiceLinks", { eventId, invoiceId, createdAt: now });
  }
}

export async function detachInvoiceFromAdditionalLinks(
  ctx: MutationCtx,
  eventId: Id<"events">,
  invoiceId: Id<"invoices">,
) {
  const rows = await ctx.db
    .query("eventInvoiceLinks")
    .withIndex("by_eventId_and_invoiceId", (q) =>
      q.eq("eventId", eventId).eq("invoiceId", invoiceId),
    )
    .take(5);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
}

export async function deleteEventInvoiceLinksForEvent(ctx: MutationCtx, eventId: Id<"events">) {
  const rows = await ctx.db
    .query("eventInvoiceLinks")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(MAX_LINKS_PER_LOOKUP);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
}

export async function deleteEventInvoiceLinksForInvoice(
  ctx: MutationCtx,
  invoiceId: Id<"invoices">,
) {
  const rows = await ctx.db
    .query("eventInvoiceLinks")
    .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoiceId))
    .take(MAX_LINKS_PER_LOOKUP);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
}
