import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireArborInternalContext, requireAuth } from "./lib/auth";
import { requireEventEditAccess } from "./lib/eventAccess";
import {
  listManualEventContacts,
  resolveInvoiceContact,
  resolveVenueContact,
  type EventContact,
  type ManualEventContact,
} from "./lib/eventContacts";

const contactValidator = v.object({
  roleLabel: v.string(),
  person: v.string(),
  contact: v.optional(v.string()),
  notes: v.optional(v.string()),
});

const manualContactValidator = v.object({
  _id: v.id("eventContacts"),
  name: v.string(),
  position: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
});

/**
 * Contacts board for the event editor: inherited venue/invoice contacts
 * (read-only) plus the manually added event contacts (editable). Band contacts
 * are read from the event's riders by the caller so the overview does not load
 * rider documents twice.
 */
export const getBoard = query({
  args: { eventId: v.id("events") },
  returns: v.object({
    venue: v.union(v.null(), contactValidator),
    invoice: v.union(v.null(), contactValidator),
    manual: v.array(manualContactValidator),
  }),
  handler: async (ctx, args): Promise<{
    venue: EventContact | null;
    invoice: EventContact | null;
    manual: ManualEventContact[];
  }> => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    const venue = event.venueId ? await ctx.db.get(event.venueId) : null;
    return {
      venue: (await resolveVenueContact(ctx, venue)) ?? null,
      invoice: (await resolveInvoiceContact(ctx, event.hostGroupId)) ?? null,
      manual: await listManualEventContacts(ctx, args.eventId),
    };
  },
});

/** Replaces the event's manual contacts with the submitted list. */
export const upsertForEvent = mutation({
  args: {
    eventId: v.id("events"),
    contacts: v.array(
      v.object({
        id: v.optional(v.id("eventContacts")),
        name: v.string(),
        position: v.optional(v.string()),
        email: v.optional(v.string()),
        phone: v.optional(v.string()),
      }),
    ),
  },
  returns: v.array(manualContactValidator),
  handler: async (ctx, args): Promise<ManualEventContact[]> => {
    await requireArborInternalContext(ctx);
    await requireEventEditAccess(ctx, args.eventId);

    const existing = await ctx.db
      .query("eventContacts")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(200);
    const existingById = new Map(existing.map((row) => [row._id, row]));
    const keepIds = new Set(
      args.contacts
        .filter((contact) => contact.name.trim())
        .map((contact) => contact.id)
        .filter((id): id is NonNullable<typeof id> => Boolean(id)),
    );
    for (const row of existing) {
      if (!keepIds.has(row._id)) await ctx.db.delete(row._id);
    }

    const now = Date.now();
    let sortOrder = 0;
    for (const contact of args.contacts) {
      const name = contact.name.trim();
      if (!name) continue;
      const fields = {
        name,
        position: contact.position?.trim() || undefined,
        email: contact.email?.trim() || undefined,
        phone: contact.phone?.trim() || undefined,
        sortOrder: sortOrder++,
        updatedAt: now,
      };
      if (contact.id) {
        if (!existingById.has(contact.id)) {
          throw new Error("Contact not found on this event.");
        }
        await ctx.db.patch(contact.id, fields);
      } else {
        await ctx.db.insert("eventContacts", {
          eventId: args.eventId,
          ...fields,
          createdAt: now,
        });
      }
    }
    return await listManualEventContacts(ctx, args.eventId);
  },
});
