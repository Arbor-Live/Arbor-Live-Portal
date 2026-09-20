import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { listEventsByInvoiceId } from "./invoiceEvents";

/**
 * Public (token-holder) contact edits are intentionally bounded: a client can
 * add a handful of on-site contacts, not bulk-load a directory. 50 is well past
 * any real event and keeps a leaked link from growing the table unbounded.
 */
const MAX_PUBLIC_EVENT_CONTACTS = 50;

/** Resolves the event a public token holder is editing and confirms they may edit it. */
export async function requirePublicEditableEvent(
  ctx: MutationCtx,
  invoice: Doc<"invoices">,
  eventId: Id<"events">,
): Promise<Doc<"events">> {
  if ((invoice.clientApprovalStatus ?? "pending") !== "approved") {
    throw new Error("You can edit contacts once your quote is approved.");
  }
  const events = await listEventsByInvoiceId(ctx, invoice._id);
  const event = events.find((row) => row._id === eventId);
  if (!event) throw new Error("Event not found on this quote.");
  return event;
}

export async function addPublicEventContact(
  ctx: MutationCtx,
  eventId: Id<"events">,
  input: {
    name: string;
    position?: string;
    email?: string;
    phone?: string;
  },
): Promise<Id<"eventContacts">> {
  const name = input.name.trim();
  if (!name) throw new Error("Contact name is required.");

  const existing = await ctx.db
    .query("eventContacts")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(MAX_PUBLIC_EVENT_CONTACTS + 1);
  if (existing.length >= MAX_PUBLIC_EVENT_CONTACTS) {
    throw new Error(`This event already has the maximum of ${MAX_PUBLIC_EVENT_CONTACTS} contacts.`);
  }
  const maxSortOrder = existing.reduce((max, row) => Math.max(max, row.sortOrder), -1);

  const now = Date.now();
  return await ctx.db.insert("eventContacts", {
    eventId,
    name,
    position: input.position?.trim() || undefined,
    email: input.email?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    sortOrder: maxSortOrder + 1,
    createdAt: now,
    updatedAt: now,
  });
}

export async function deletePublicEventContact(
  ctx: MutationCtx,
  eventId: Id<"events">,
  contactId: Id<"eventContacts">,
): Promise<void> {
  const contact = await ctx.db.get(contactId);
  if (!contact || contact.eventId !== eventId) {
    throw new Error("Contact not found.");
  }
  await ctx.db.delete(contactId);
}
