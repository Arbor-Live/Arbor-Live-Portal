import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { resolveInheritedVenueFields } from "./venues";
import { resolveUserContact } from "./userContact";
import { appError } from "./errors";

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

export type TraineeScheduleSpan = {
  /** Earliest setup block. First-8-hours starts here. */
  earliestSetupStartsAt?: number;
  /** Earliest schedule block (setup, show, strike, or custom). */
  earliestBlockStartsAt?: number;
  /** Latest schedule block end. Entire-event ends here, including strike after the show. */
  latestBlockEndsAt?: number;
};

const EIGHT_HOURS_MS = 8 * 3_600_000;

/**
 * Event `startAt`/`endAt` is the show window. Setup starts before it and strike
 * ends after it, so "entire event" must span the schedule blocks, not the show.
 */
export function resolveTraineePresenceWindow(
  event: Pick<Doc<"events">, "startAt" | "endAt">,
  presenceMode: Exclude<TraineePresenceMode, "schedule_block">,
  span: TraineeScheduleSpan,
): { startsAt: number; endsAt: number } {
  if (presenceMode === "entire_event") {
    return {
      startsAt: span.earliestBlockStartsAt ?? event.startAt,
      endsAt: span.latestBlockEndsAt ?? event.endAt,
    };
  }
  const windowStart = span.earliestSetupStartsAt ?? event.startAt;
  const endsAt = Math.min(windowStart + EIGHT_HOURS_MS, event.endAt);
  return { startsAt: windowStart, endsAt };
}

export function traineeScheduleSpan(
  blocks: Array<{ blockType: string; startsAt: number; endsAt: number }>,
): TraineeScheduleSpan {
  let earliestSetupStartsAt: number | undefined;
  let earliestBlockStartsAt: number | undefined;
  let latestBlockEndsAt: number | undefined;
  for (const block of blocks) {
    if (earliestBlockStartsAt === undefined || block.startsAt < earliestBlockStartsAt) {
      earliestBlockStartsAt = block.startsAt;
    }
    if (latestBlockEndsAt === undefined || block.endsAt > latestBlockEndsAt) {
      latestBlockEndsAt = block.endsAt;
    }
    if (
      block.blockType === "setup" &&
      (earliestSetupStartsAt === undefined || block.startsAt < earliestSetupStartsAt)
    ) {
      earliestSetupStartsAt = block.startsAt;
    }
  }
  return { earliestSetupStartsAt, earliestBlockStartsAt, latestBlockEndsAt };
}

/** An event's venue label, address and map link, inheriting from parent venues. */
export async function resolveVenueLocation(
  ctx: QueryCtx | MutationCtx,
  event: Doc<"events">,
): Promise<TraineeVenueStatus> {
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
    venueId: venue._id,
    venueName: venueName || venue.path || venue.name,
    address,
    googleMapsUrl,
  };
}

export type TraineeVenueStatus = {
  /** Unset when the event only has a free-text venue name (no saved venue, so no address). */
  venueId?: Id<"venues">;
  venueName?: string;
  address?: string;
  googleMapsUrl?: string;
};

export type TraineeContactStatus = {
  role: "event_manager" | "day_of_lead";
  userId: string;
  name?: string;
  /** Fields the intro email needs that this person lacks ("name", "email", "phone"), or "user" when the account is gone. */
  missing: Array<"user" | "name" | "email" | "phone">;
  contact?: TraineeIntroContact;
};

/** What an event still needs before a trainee intro can go out (venue and a reachable contact). */
export type TraineeEventReadiness = {
  venue: TraineeVenueStatus;
  eventManager?: TraineeContactStatus;
  dayOfLead?: TraineeContactStatus;
  /** Complete contacts, manager first; the same person once. */
  contacts: TraineeIntroContact[];
  /** True when manager and lead resolve to the same person. */
  contactsCollapsed: boolean;
  /** Gaps on the event itself (title, times), fixed on the event page rather than in the dialog. */
  eventMissing: string[];
  /** Plain-words list of everything missing, event gaps included; empty when ready. */
  missing: string[];
};

const ROLE_LABELS = { event_manager: "Event manager", day_of_lead: "Event lead" } as const;

async function resolveRoleContact(
  ctx: QueryCtx | MutationCtx,
  role: "event_manager" | "day_of_lead",
  rawUserId: string | undefined,
): Promise<TraineeContactStatus | undefined> {
  const userId = rawUserId?.trim();
  if (!userId) return undefined;

  const userContact = await resolveUserContact(ctx, userId);
  if (!userContact) return { role, userId, missing: ["user"] };
  const missing: TraineeContactStatus["missing"] = [];
  if (!userContact.name) missing.push("name");
  if (!userContact.email || !isValidEmail(userContact.email)) missing.push("email");
  if (!userContact.phone) missing.push("phone");
  if (missing.length > 0) return { role, userId, name: userContact.name, missing };
  return {
    role,
    userId,
    name: userContact.name,
    missing,
    contact: {
      role,
      name: userContact.name!,
      email: userContact.email!,
      phone: userContact.phone!,
      userId,
    },
  };
}

function describeContactGap(status: TraineeContactStatus) {
  const label = ROLE_LABELS[status.role];
  if (status.missing.includes("user")) return `${label}: the assigned user no longer exists`;
  return `${label}${status.name ? ` ${status.name}` : ""}: no ${status.missing.join(" or ")} on their profile`;
}

/**
 * The venue and contact half of the trainee send gate, shared by the assign
 * mutation and the early warning in the admin panel. One complete contact is
 * enough: an incomplete manager is skipped when the lead is reachable.
 */
export async function resolveTraineeEventReadiness(
  ctx: QueryCtx | MutationCtx,
  event: Doc<"events">,
): Promise<TraineeEventReadiness> {
  const eventMissing: string[] = [];
  if (!event.title?.trim()) eventMissing.push("Event title");
  if (!event.startAt) eventMissing.push("Event start time");
  if (!event.endAt) eventMissing.push("Event end time");
  if (event.startAt && event.endAt && event.endAt <= event.startAt) {
    eventMissing.push("Event end time (must be after start)");
  }

  const missing: string[] = [...eventMissing];
  const venue = await resolveVenueLocation(ctx, event);
  if (!venue.venueName) missing.push("Venue");
  else if (!venue.address) {
    missing.push(
      venue.venueId
        ? `Venue address for ${venue.venueName}`
        : `Venue address (“${venue.venueName}” isn't a saved venue yet)`,
    );
  }

  const eventManager = await resolveRoleContact(ctx, "event_manager", event.eventManagerUserId);
  const dayOfLead = await resolveRoleContact(ctx, "day_of_lead", event.dayOfLeadUserId);

  const contacts: TraineeIntroContact[] = [];
  if (eventManager?.contact) contacts.push(eventManager.contact);
  if (dayOfLead?.contact) {
    const manager = eventManager?.contact;
    const sameAsManager =
      manager &&
      ((manager.userId && dayOfLead.contact.userId && manager.userId === dayOfLead.contact.userId) ||
        (manager.email === dayOfLead.contact.email &&
          manager.phone === dayOfLead.contact.phone &&
          manager.name === dayOfLead.contact.name));
    if (!sameAsManager) contacts.push(dayOfLead.contact);
  }

  if (contacts.length === 0) {
    const assigned = [eventManager, dayOfLead].filter((entry): entry is TraineeContactStatus => Boolean(entry));
    if (assigned.length === 0) missing.push("Event lead (or an event manager) to be the trainee's contact");
    else missing.push(...assigned.map(describeContactGap));
  }

  return {
    venue,
    eventManager,
    dayOfLead,
    contacts,
    contactsCollapsed: contacts.length === 1 && Boolean(eventManager?.contact && dayOfLead?.contact),
    eventMissing,
    missing,
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
    appError("EVENT_NOT_FOUND", "Event not found.");
  }

  const eventTitle = event.title?.trim();

  if (!Number.isFinite(args.callTime) || args.callTime <= 0) {
    missing.push("Trainee call time");
  }

  const blocks = await ctx.db
    .query("eventScheduleBlocks")
    .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", args.eventId))
    .take(500);
  const span = traineeScheduleSpan(blocks);

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
    const window = resolveTraineePresenceWindow(event, args.presenceMode, span);
    startsAt = window.startsAt;
    endsAt = window.endsAt;
    if (endsAt <= startsAt) {
      missing.push("Trainee presence window (start/end)");
    }
  }

  const readiness = await resolveTraineeEventReadiness(ctx, event);
  missing.push(...readiness.missing);

  if (missing.length > 0) {
    appError(
      "TRAINEE_INTRO_NOT_READY",
      `Cannot assign trainee — missing required details:\n• ${missing.join("\n• ")}`,
    );
  }

  const { venue, contacts, contactsCollapsed } = readiness;

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
    contactsCollapsed,
  };
}
