import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { findAuthUserById } from "./auth";
import { resolveInheritedVenueFields } from "./venues";

export const CREW_STORAGE_CLOSET_MAPS_URL = "https://maps.app.goo.gl/8d2dQF96sLV2QrBk7";
export const CREW_STORAGE_CLOSET_LABEL = "Old Union storage closet";

export type TraineePresenceMode = "entire_event" | "first_8_hours" | "schedule_block";

export type TraineeIntroContact = {
  role: "event_manager" | "day_of_lead";
  name: string;
  email: string;
  phone: string;
  userId?: string;
};

export type TraineeIntroReady = {
  eventTitle: string;
  startAt: number;
  endAt: number;
  venueName: string;
  venueAddress: string;
  venueGoogleMapsUrl?: string;
  callTime: number;
  startsAt: number;
  endsAt: number;
  scheduleBlockId?: Id<"eventScheduleBlocks">;
  contacts: TraineeIntroContact[];
  /** True when manager and lead resolve to the same person. */
  contactsCollapsed: boolean;
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function resolveTraineePresenceWindow(
  event: Pick<Doc<"events">, "startAt" | "endAt">,
  presenceMode: Exclude<TraineePresenceMode, "schedule_block">,
  setupBlockStartsAt: number | undefined,
): { startsAt: number; endsAt: number } {
  if (presenceMode === "entire_event") {
    return { startsAt: event.startAt, endsAt: event.endAt };
  }
  const windowStart = setupBlockStartsAt ?? event.startAt;
  const endsAt = Math.min(windowStart + 8 * 3_600_000, event.endAt);
  return { startsAt: windowStart, endsAt };
}

async function resolveVenueLocation(
  ctx: QueryCtx | MutationCtx,
  event: Doc<"events">,
): Promise<{ venueName?: string; address?: string; googleMapsUrl?: string }> {
  const venueName = event.venueName?.trim() || undefined;
  if (!event.venueId) {
    return { venueName };
  }
  const venue = await ctx.db.get(event.venueId);
  if (!venue) {
    return { venueName };
  }
  const inherited = await resolveInheritedVenueFields(ctx, venue.parentId);
  const address = venue.address?.trim() || inherited.address?.value.trim() || undefined;
  const googleMapsUrl =
    venue.googleMapsUrl?.trim() || inherited.googleMapsUrl?.value.trim() || undefined;
  return {
    venueName: venueName || venue.path || venue.name,
    address,
    googleMapsUrl,
  };
}

async function resolveUserContact(
  ctx: QueryCtx | MutationCtx,
  userId: string,
): Promise<{ name?: string; email?: string; phone?: string } | null> {
  const user = await findAuthUserById(ctx, userId);
  if (!user) return null;
  const profile = await ctx.db
    .query("userAdminProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  return {
    name: user.name?.trim() || undefined,
    email: user.email?.trim().toLowerCase() || undefined,
    phone: profile?.phone?.trim() || undefined,
  };
}

async function resolveRoleContact(
  ctx: QueryCtx | MutationCtx,
  args: {
    eventId: Id<"events">;
    role: "event_manager" | "day_of_lead";
    userId?: string;
  },
): Promise<{ contact?: TraineeIntroContact; missing: string[] }> {
  const missing: string[] = [];
  const roleLabel = args.role === "event_manager" ? "Event manager" : "Event lead";

  if (args.userId?.trim()) {
    const userContact = await resolveUserContact(ctx, args.userId.trim());
    if (!userContact) {
      missing.push(`${roleLabel}: user not found`);
      return { missing };
    }
    if (!userContact.name) missing.push(`${roleLabel}: name`);
    if (!userContact.email || !isValidEmail(userContact.email)) missing.push(`${roleLabel}: email`);
    if (!userContact.phone) missing.push(`${roleLabel}: phone`);
    if (missing.length > 0) return { missing };
    return {
      contact: {
        role: args.role,
        name: userContact.name!,
        email: userContact.email!,
        phone: userContact.phone!,
        userId: args.userId.trim(),
      },
      missing: [],
    };
  }

  const assignmentType = args.role === "event_manager" ? "event_manager" : "day_of_lead";
  const assignment = await ctx.db
    .query("eventPeopleAssignments")
    .withIndex("by_eventId_and_assignmentType", (q) =>
      q.eq("eventId", args.eventId).eq("assignmentType", assignmentType),
    )
    .first();

  if (!assignment) {
    return { missing: [] };
  }

  if (assignment.userId?.trim()) {
    return resolveRoleContact(ctx, {
      eventId: args.eventId,
      role: args.role,
      userId: assignment.userId,
    });
  }

  const name = assignment.personName?.trim();
  const email = assignment.contactEmail?.trim().toLowerCase();
  const phone = assignment.contactPhone?.trim();
  if (!name) missing.push(`${roleLabel}: name`);
  if (!email || !isValidEmail(email)) missing.push(`${roleLabel}: email`);
  if (!phone) missing.push(`${roleLabel}: phone`);
  if (missing.length > 0) return { missing };
  return {
    contact: {
      role: args.role,
      name: name!,
      email: email!,
      phone: phone!,
    },
    missing: [],
  };
}

/**
 * Validates everything needed for trainee ICS + intro email.
 * Throws with a clear bullet list of missing fields; does not send or write.
 */
export async function assertTraineeIntroReady(
  ctx: QueryCtx | MutationCtx,
  args: {
    eventId: Id<"events">;
    callTime: number;
    presenceMode: TraineePresenceMode;
    scheduleBlockId?: Id<"eventScheduleBlocks">;
    startsAt?: number;
    endsAt?: number;
  },
): Promise<TraineeIntroReady> {
  const missing: string[] = [];
  const event = await ctx.db.get(args.eventId);
  if (!event) {
    throw new Error("Event not found.");
  }

  const eventTitle = event.title?.trim();
  if (!eventTitle) missing.push("Event title");
  if (!event.startAt) missing.push("Event start time");
  if (!event.endAt) missing.push("Event end time");
  if (event.startAt && event.endAt && event.endAt <= event.startAt) {
    missing.push("Event end time (must be after start)");
  }

  if (!Number.isFinite(args.callTime) || args.callTime <= 0) {
    missing.push("Trainee call time");
  }

  const blocks = await ctx.db
    .query("eventScheduleBlocks")
    .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", args.eventId))
    .take(500);
  const setupStarts = blocks
    .filter((block) => block.blockType === "setup")
    .map((block) => block.startsAt);
  const earliestSetup = setupStarts.length > 0 ? Math.min(...setupStarts) : undefined;

  let startsAt = 0;
  let endsAt = 0;
  let scheduleBlockId: Id<"eventScheduleBlocks"> | undefined;

  if (args.presenceMode === "schedule_block") {
    if (!args.scheduleBlockId) {
      missing.push("Schedule block");
    } else {
      const block = blocks.find((entry) => entry._id === args.scheduleBlockId);
      if (!block) {
        missing.push("Schedule block (must belong to this event)");
      } else {
        scheduleBlockId = block._id;
        startsAt = args.startsAt ?? block.startsAt;
        endsAt = args.endsAt ?? block.endsAt;
      }
    }
    if (startsAt && endsAt && endsAt <= startsAt) {
      missing.push("Trainee shift window (end must be after start)");
    }
  } else if (event.startAt && event.endAt && event.endAt > event.startAt) {
    const window = resolveTraineePresenceWindow(event, args.presenceMode, earliestSetup);
    startsAt = window.startsAt;
    endsAt = window.endsAt;
    if (endsAt <= startsAt) {
      missing.push("Trainee presence window (start/end)");
    }
  }

  const venue = await resolveVenueLocation(ctx, event);
  if (!venue.venueName) missing.push("Venue name");
  if (!venue.address) missing.push("Venue address");

  const managerResult = await resolveRoleContact(ctx, {
    eventId: args.eventId,
    role: "event_manager",
    userId: event.eventManagerUserId,
  });
  const leadResult = await resolveRoleContact(ctx, {
    eventId: args.eventId,
    role: "day_of_lead",
    userId: event.dayOfLeadUserId,
  });
  missing.push(...managerResult.missing, ...leadResult.missing);

  if (!managerResult.contact && !leadResult.contact) {
    missing.push("Event manager or Event lead (at least one assigned with name, email, and phone)");
  }

  if (missing.length > 0) {
    throw new Error(
      `Cannot assign trainee — missing required details:\n• ${missing.join("\n• ")}`,
    );
  }

  const contacts: TraineeIntroContact[] = [];
  if (managerResult.contact) contacts.push(managerResult.contact);
  if (leadResult.contact) {
    const sameAsManager =
      managerResult.contact &&
      ((managerResult.contact.userId &&
        leadResult.contact.userId &&
        managerResult.contact.userId === leadResult.contact.userId) ||
        (managerResult.contact.email === leadResult.contact.email &&
          managerResult.contact.phone === leadResult.contact.phone &&
          managerResult.contact.name === leadResult.contact.name));
    if (!sameAsManager) {
      contacts.push(leadResult.contact);
    }
  }

  return {
    eventTitle: eventTitle!,
    startAt: event.startAt,
    endAt: event.endAt,
    venueName: venue.venueName!,
    venueAddress: venue.address!,
    venueGoogleMapsUrl: venue.googleMapsUrl,
    callTime: args.callTime,
    startsAt,
    endsAt,
    scheduleBlockId,
    contacts,
    contactsCollapsed: contacts.length === 1 && Boolean(managerResult.contact && leadResult.contact),
  };
}
