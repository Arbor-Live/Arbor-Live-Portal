import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { findAuthUsersByIds } from "./auth";
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

/**
 * One row per band on the event. The band profile's main contact is the booking
 * contact and wins whenever it is set; the rider's own day-of contact is only a
 * fallback for artists who never filled the profile.
 */
export function buildBandContacts(
  rows: Array<{
    bandName: string;
    rider: {
      contactName?: string;
      contactEmail?: string;
      contactPhone?: string;
    } | null;
    contact?: {
      name?: string;
      email?: string;
      phone?: string;
    };
  }>,
): EventContact[] {
  return rows.flatMap((row) => {
    const rider = row.rider;
    const profileName = row.contact?.name?.trim();
    const profileContact = joinContact(row.contact?.email, row.contact?.phone);
    const name = profileName || rider?.contactName?.trim();
    const contact = profileContact || (rider ? joinContact(rider.contactEmail, rider.contactPhone) : undefined);
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

type TeamShift = Pick<
  Doc<"eventCrewShifts">,
  "role" | "personName" | "userId" | "crewApplicationId" | "startsAt"
>;

/**
 * The event's own people with a way to reach them: event manager and day-of
 * lead (email · phone), then everyone on a shift in call order, with their
 * phone (email when they have none). Trainees come from their application.
 */
export async function buildEventTeamContacts(
  ctx: QueryCtx,
  event: Pick<Doc<"events">, "eventManagerUserId" | "dayOfLeadUserId">,
  shifts: readonly TeamShift[],
): Promise<EventContact[]> {
  const leads = [
    { userId: event.eventManagerUserId?.trim(), roleLabel: "Event manager" },
    { userId: event.dayOfLeadUserId?.trim(), roleLabel: "Day-of lead" },
  ].filter((lead): lead is { userId: string; roleLabel: string } => Boolean(lead.userId));

  type Person = { userId?: string; applicationId?: Id<"crewApplications">; name?: string; roles: string[] };
  const crew = new Map<string, Person>();
  for (const shift of [...shifts].sort((a, b) => a.startsAt - b.startsAt)) {
    const userId = shift.userId?.trim();
    const key = userId ?? (shift.crewApplicationId ? `application:${shift.crewApplicationId}` : null);
    if (!key) continue;
    const person = crew.get(key) ?? {
      userId,
      applicationId: userId ? undefined : shift.crewApplicationId,
      name: shift.personName?.trim() || undefined,
      roles: [],
    };
    const role = shift.role.trim();
    if (role && !person.roles.includes(role)) person.roles.push(role);
    crew.set(key, person);
  }

  const userIds = [...new Set([...leads.map((lead) => lead.userId), ...[...crew.values()].flatMap((person) => (person.userId ? [person.userId] : []))])];
  const [userByKey, phoneByUserId] = await Promise.all([
    findAuthUsersByIds(ctx, userIds),
    loadProfilePhones(ctx, userIds),
  ]);

  const rows: EventContact[] = leads.map(({ userId, roleLabel }) => {
    const user = userByKey.get(userId);
    return {
      roleLabel,
      person: user?.name?.trim() || user?.email?.trim() || "Assigned",
      contact: joinContact(user?.email, phoneByUserId.get(userId)),
    };
  });
  const leadIds = new Set(leads.map((lead) => lead.userId));

  for (const person of crew.values()) {
    if (person.userId) {
      if (leadIds.has(person.userId)) continue;
      const user = userByKey.get(person.userId);
      rows.push({
        roleLabel: person.roles.join(", ") || "Crew",
        person: person.name || user?.name?.trim() || user?.email?.trim() || "Crew",
        contact: phoneByUserId.get(person.userId) || user?.email?.trim() || undefined,
      });
      continue;
    }
    const application = person.applicationId ? await ctx.db.get(person.applicationId) : null;
    rows.push({
      roleLabel: "Trainee",
      person: person.name || application?.name?.trim() || "Trainee",
      contact: application?.phone?.trim() || application?.email?.trim() || undefined,
    });
  }
  return rows;
}

async function loadProfilePhones(ctx: QueryCtx, userIds: readonly string[]) {
  const phones = new Map<string, string>();
  await Promise.all(
    userIds.map(async (userId) => {
      const [profile] = await ctx.db
        .query("userAdminProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(1);
      const phone = profile?.phone?.trim();
      if (phone) phones.set(userId, phone);
    }),
  );
  return phones;
}
