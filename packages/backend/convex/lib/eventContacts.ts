import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { contactDisplayName } from "./contactName";

/** A ready-to-print contact row (venue, host billing, band, or manual). */
export type EventContact = {
  roleLabel: string;
  person: string;
  contact?: string;
  notes?: string;
};

/**
 * Hard cap on contacts per event. Matches the read limit used by the editor,
 * brief, and print freshness so a save can never persist rows the UI cannot
 * load back (which would orphan them).
 */
export const MAX_EVENT_CONTACTS = 200;

/** Provenance of an inherited contact, surfaced as a tag in the editor. */
export type EventContactSource = "venue" | "invoice" | "band";

export function joinContact(email?: string, phone?: string): string | undefined {
  const value = [email, phone]
    .filter((entry): entry is string => Boolean(entry?.trim()))
    .join(" · ");
  return value || undefined;
}

/**
 * On-site venue contact, preferring the room's own contact and falling back to
 * the nearest ancestor that has one (same walk as the venue address).
 */
export async function resolveVenueContact(
  ctx: QueryCtx,
  venue: Doc<"venues"> | null,
): Promise<EventContact | undefined> {
  let current = venue;
  while (current) {
    const name = current.contactName?.trim();
    const contact = joinContact(current.contactEmail, current.contactPhone);
    if (name || contact) {
      return {
        roleLabel: "Venue contact",
        person: name || current.path || current.name,
        contact,
      };
    }
    current = current.parentId ? await ctx.db.get(current.parentId) : null;
  }
  return undefined;
}

/** Primary billing contact for the host org — active, most recently used first. */
export async function resolveInvoiceContact(
  ctx: QueryCtx,
  hostGroupId: Id<"invoiceGroups"> | null | undefined,
): Promise<EventContact | undefined> {
  if (!hostGroupId) return undefined;
  const contacts = await ctx.db
    .query("invoiceContacts")
    .withIndex("by_groupId", (q) => q.eq("groupId", hostGroupId))
    .take(200);
  const primary = contacts
    .filter((contact) => contact.active)
    .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))[0];
  if (!primary) return undefined;
  const person = contactDisplayName(primary);
  const contact = joinContact(primary.email, primary.phone);
  if (!person && !contact) return undefined;
  return { roleLabel: "Host contact", person: person || "Host", contact };
}

/** One row per band on the event that carries contact info on its rider. */
export function buildBandContacts(
  rows: Array<{
    bandName: string;
    rider: {
      contactName?: string;
      contactEmail?: string;
      contactPhone?: string;
    } | null;
  }>,
): EventContact[] {
  return rows.flatMap((row) => {
    const rider = row.rider;
    if (!rider) return [];
    const name = rider.contactName?.trim();
    const contact = joinContact(rider.contactEmail, rider.contactPhone);
    if (!name && !contact) return [];
    return [
      {
        roleLabel: "Band contact",
        person: name || row.bandName,
        contact,
        notes: row.bandName,
      },
    ];
  });
}

export type ManualEventContact = {
  _id: Id<"eventContacts">;
  name: string;
  position?: string;
  email?: string;
  phone?: string;
};

export async function listManualEventContacts(
  ctx: QueryCtx,
  eventId: Id<"events">,
): Promise<ManualEventContact[]> {
  const rows = await ctx.db
    .query("eventContacts")
    .withIndex("by_eventId_and_sortOrder", (q) => q.eq("eventId", eventId))
    .take(MAX_EVENT_CONTACTS);
  return rows.map((row) => ({
    _id: row._id,
    name: row.name,
    position: row.position,
    email: row.email,
    phone: row.phone,
  }));
}

export function manualContactToBriefContact(contact: ManualEventContact): EventContact {
  return {
    roleLabel: contact.position?.trim() || "Contact",
    person: contact.name,
    contact: joinContact(contact.email, contact.phone),
  };
}
