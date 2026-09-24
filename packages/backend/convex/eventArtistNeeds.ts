import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getUserId, requireArborInternalContext, requireAuth, requireBandContext } from "./lib/auth";
import { resolveBandName } from "./lib/bandIdentity";
import {
  artistNeedStatusValue,
  artistNeedTypeValue,
  ARTIST_NEED_TYPE_LABELS,
  artistTypeMatchesNeed,
  effectiveArtistNeedStatus,
  resolveEventArtistBooking,
  slotIsBooked,
  type ArtistNeedStatus,
  type ArtistNeedType,
  type EffectiveArtistNeedStatus,
} from "./lib/eventArtistNeeds";
import { scheduleArtistNeedInquiryEmail } from "./email/artistNeedInquiryEmails";
import { unclaimSlot } from "./eventBands";
import { normalizeEventStatus } from "./lib/eventStatus";

const MAX_NEED_CANDIDATES = 60;

function trimOptional(value: string | undefined) {
  const out = value?.trim();
  return out ? out : undefined;
}

/** True when the event is a public, non-cancelled, upcoming show. */
function isArtistListableEvent(event: Doc<"events"> | null, now: number): event is Doc<"events"> {
  return Boolean(
    event &&
      event.visibility === "public" &&
      normalizeEventStatus(event.status) !== "cancelled" &&
      event.startAt >= now,
  );
}

async function loadSlotsForEvent(ctx: QueryCtx, eventId: Id<"events">) {
  const rows = await ctx.db
    .query("eventArtistNeeds")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(100);
  // Bill order; rows created before ordering existed fall back to creation order.
  return rows.sort(
    (a, b) =>
      (a.sortOrder ?? a.createdAt) - (b.sortOrder ?? b.createdAt) || a.createdAt - b.createdAt,
  );
}

async function nameFor(ctx: QueryCtx, organizationId: string) {
  return await resolveBandName(ctx, organizationId);
}

async function nameMap(ctx: QueryCtx, organizationIds: readonly string[]) {
  const unique = [...new Set(organizationIds)];
  const entries = await Promise.all(
    unique.map(async (id) => [id, await nameFor(ctx, id)] as const),
  );
  return new Map(entries);
}

/** One indexed read answers "is this slot filled" — do not resolve the whole booking. */
async function findActForSlot(ctx: QueryCtx, needId: Id<"eventArtistNeeds">) {
  return await ctx.db
    .query("eventBandParticipations")
    .withIndex("by_needId", (q) => q.eq("needId", needId))
    .first();
}

export const getForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const slots = await loadSlotsForEvent(ctx, args.eventId);
    const booking = await resolveEventArtistBooking(ctx, args.eventId);

    const names = await nameMap(ctx, booking.lineup.map((row) => row.organizationId));

    const inquiries = await ctx.db
      .query("eventArtistInquiries")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(200);
    const inquiryNames = await nameMap(
      ctx,
      inquiries.map((row) => row.organizationId),
    );

    const describe = (row: (typeof booking.lineup)[number]) => ({
      participationId: row.participationId,
      organizationId: row.organizationId,
      name: names.get(row.organizationId) ?? "Artist",
      role: row.role,
    });

    return {
      slots: slots.map((slot) => {
        const filledBy = booking.lineup.filter((row) => row.needId === slot._id);
        return {
          needId: slot._id,
          sortOrder: slot.sortOrder ?? slot.createdAt,
          label: slot.label ?? "",
          artistType: slot.artistType,
          genres: slot.genres ?? "",
          status: slot.status,
          effectiveStatus: effectiveArtistNeedStatus(
            slot.status,
            slotIsBooked(slot, booking.filledSlotIds),
          ),
          externalArtistName: slot.externalArtistName ?? "",
          setStartsAt: slot.setStartsAt ?? null,
          setEndsAt: slot.setEndsAt ?? null,
          soundcheckStartsAt: slot.soundcheckStartsAt ?? null,
          soundcheckEndsAt: slot.soundcheckEndsAt ?? null,
          filledBy: filledBy.map(describe),
          inquiries: inquiries
            .filter((row) => row.needId === slot._id)
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((row) => ({
              _id: row._id,
              organizationId: row.organizationId,
              name: inquiryNames.get(row.organizationId) ?? "Artist",
              message: row.message ?? "",
              status: row.status,
              createdAt: row.createdAt,
            })),
        };
      }),
      /** Acts on the bill that were not booked against a slot. */
      unslotted: booking.lineup.filter((row) => !row.needId).map(describe),
    };
  },
});

/** Open slot counts per event, for annotating invoice artist rows. */
export const listNeedStatusForEvents = query({
  args: { eventIds: v.array(v.id("events")) },
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const out: Array<{
      eventId: Id<"events">;
      artistType: ArtistNeedType;
      status: EffectiveArtistNeedStatus;
      genres: string;
    }> = [];
    for (const eventId of args.eventIds.slice(0, MAX_NEED_CANDIDATES)) {
      const slots = await loadSlotsForEvent(ctx, eventId);
      if (slots.length === 0) continue;
      const { filledSlotIds } = await resolveEventArtistBooking(ctx, eventId);
      for (const slot of slots) {
        const booked = slotIsBooked(slot, filledSlotIds);
        out.push({
          eventId,
          artistType: slot.artistType,
          status: effectiveArtistNeedStatus(slot.status, booked),
          genres: slot.genres ?? "",
        });
      }
    }
    return out;
  },
});

export const upsertSlot = mutation({
  args: {
    eventId: v.id("events"),
    needId: v.optional(v.id("eventArtistNeeds")),
    label: v.optional(v.string()),
    artistType: artistNeedTypeValue,
    genres: v.optional(v.string()),
    status: artistNeedStatusValue,
    /** Set to create the position already filled by an outside act. */
    externalArtistName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const author = await requireAuth(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    const now = Date.now();
    const label = trimOptional(args.label);
    const genres = trimOptional(args.genres);

    if (args.needId) {
      const existing = await ctx.db.get(args.needId);
      if (!existing || existing.eventId !== args.eventId) {
        throw new Error("Slot not found on this event.");
      }
      await ctx.db.patch(existing._id, {
        label,
        artistType: args.artistType,
        genres,
        status: args.status,
        externalArtistName: trimOptional(args.externalArtistName),
        updatedAt: now,
      });
      return { needId: existing._id };
    }

    const existingRows = await loadSlotsForEvent(ctx, args.eventId);
    const needId = await ctx.db.insert("eventArtistNeeds", {
      eventId: args.eventId,
      sortOrder: (existingRows.at(-1)?.sortOrder ?? existingRows.at(-1)?.createdAt ?? now) + 1,
      label,
      artistType: args.artistType,
      genres,
      status: args.status,
      externalArtistName: trimOptional(args.externalArtistName),
      createdByUserId: getUserId(author),
      createdAt: now,
      updatedAt: now,
    });
    return { needId };
  },
});

/** Staff drag cards to set the bill order. */
export const reorderSlots = mutation({
  args: {
    eventId: v.id("events"),
    needIds: v.array(v.id("eventArtistNeeds")),
  },
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const now = Date.now();
    for (const [index, needId] of args.needIds.entries()) {
      const slot = await ctx.db.get(needId);
      if (!slot || slot.eventId !== args.eventId) continue;
      if (slot.sortOrder === index) continue;
      await ctx.db.patch(needId, { sortOrder: index, updatedAt: now });
    }
    return null;
  },
});

/**
 * Fill a position with an outside act — a name only, no platform organization —
 * and set its run of show. Uses `replace` because `patch` ignores `undefined`.
 */
export const updateSlotLineup = mutation({
  args: {
    needId: v.id("eventArtistNeeds"),
    externalArtistName: v.union(v.string(), v.null()),
    setStartsAt: v.union(v.number(), v.null()),
    setEndsAt: v.union(v.number(), v.null()),
    soundcheckStartsAt: v.union(v.number(), v.null()),
    soundcheckEndsAt: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const slot = await ctx.db.get(args.needId);
    if (!slot) throw new Error("Position not found.");
    if (args.setStartsAt != null && args.setEndsAt != null && args.setEndsAt <= args.setStartsAt) {
      throw new Error("Set end time must be after the start time.");
    }
    if (
      args.soundcheckStartsAt != null &&
      args.soundcheckEndsAt != null &&
      args.soundcheckEndsAt <= args.soundcheckStartsAt
    ) {
      throw new Error("Soundcheck end time must be after the start time.");
    }
    const name = args.externalArtistName?.trim() || undefined;
    if (name && (await findActForSlot(ctx, slot._id))) {
      throw new Error("This position is filled by an artist already on the bill.");
    }
    const next: Doc<"eventArtistNeeds"> = { ...slot, updatedAt: Date.now() };
    if (name) next.externalArtistName = name;
    else delete next.externalArtistName;
    if (args.setStartsAt != null) next.setStartsAt = args.setStartsAt;
    else delete next.setStartsAt;
    if (args.setEndsAt != null) next.setEndsAt = args.setEndsAt;
    else delete next.setEndsAt;
    if (args.soundcheckStartsAt != null) next.soundcheckStartsAt = args.soundcheckStartsAt;
    else delete next.soundcheckStartsAt;
    if (args.soundcheckEndsAt != null) next.soundcheckEndsAt = args.soundcheckEndsAt;
    else delete next.soundcheckEndsAt;
    await ctx.db.replace(slot._id, next);
    return null;
  },
});

export const removeSlot = mutation({
  args: { needId: v.id("eventArtistNeeds") },
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const slot = await ctx.db.get(args.needId);
    if (!slot) return;
    const inquiries = await ctx.db
      .query("eventArtistInquiries")
      .withIndex("by_needId", (q) => q.eq("needId", slot._id))
      .take(200);
    for (const inquiry of inquiries) {
      await ctx.db.delete(inquiry._id);
    }
    // Unlink any act that was booked against this slot rather than orphaning it.
    const filled = await ctx.db
      .query("eventBandParticipations")
      .withIndex("by_needId", (q) => q.eq("needId", slot._id))
      .take(100);
    for (const row of filled) {
      await unclaimSlot(ctx, row._id);
    }
    await ctx.db.delete(slot._id);
  },
});

export const submitInquiry = mutation({
  args: { needId: v.id("eventArtistNeeds"), message: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const context = await requireBandContext(ctx);
    const need = await ctx.db.get(args.needId);
    if (!need) throw new Error("This slot is no longer available.");
    const event = await ctx.db.get(need.eventId);
    // Same gate as `listOpenNeedsForArtist`: only public, upcoming, uncancelled
    // events that match this artist's type are inquirable.
    if (!isArtistListableEvent(event, Date.now())) {
      throw new Error("This slot is no longer available.");
    }
    if (!artistTypeMatchesNeed(need.artistType, context.organizationType)) {
      throw new Error("This slot is not looking for your kind of act.");
    }
    if (slotIsBooked(need, new Set()) || (await findActForSlot(ctx, need._id))) {
      throw new Error("This slot is already filled.");
    }

    const existing = await ctx.db
      .query("eventArtistInquiries")
      .withIndex("by_organizationId_and_needId", (q) =>
        q.eq("organizationId", context.organizationId).eq("needId", args.needId),
      )
      .unique();
    if (existing && existing.status === "submitted") {
      return { inquiryId: existing._id };
    }

    const now = Date.now();
    const inquiryId = existing
      ? existing._id
      : await ctx.db.insert("eventArtistInquiries", {
          needId: args.needId,
          eventId: need.eventId,
          organizationId: context.organizationId,
          message: trimOptional(args.message),
          status: "submitted",
          createdAt: now,
          updatedAt: now,
        });
    if (existing) {
      await ctx.db.patch(existing._id, {
        message: trimOptional(args.message),
        status: "submitted",
        updatedAt: now,
      });
    }
    if (need.status !== "inquiring") {
      await ctx.db.patch(need._id, { status: "inquiring", updatedAt: now });
    }

    await scheduleArtistNeedInquiryEmail(ctx, {
      need,
      event,
      organizationId: context.organizationId,
      message: trimOptional(args.message),
      // Each submission is its own notification, so re-inquiring after a
      // dismissal is not swallowed by the previous send's idempotency key.
      submissionId: `${inquiryId}:${now}`,
    });

    return { inquiryId };
  },
});

export const dismissInquiry = mutation({
  args: { inquiryId: v.id("eventArtistInquiries") },
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const inquiry = await ctx.db.get(args.inquiryId);
    if (!inquiry) throw new Error("Inquiry not found.");
    await ctx.db.patch(inquiry._id, { status: "dismissed", updatedAt: Date.now() });
  },
});

export const listOpenNeedsForArtist = query({
  args: {
    artistType: v.optional(artistNeedTypeValue),
    query: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const context = await requireBandContext(ctx);
    const now = Date.now();
    const needles = [args.query?.trim().toLowerCase()].filter(Boolean) as string[];

    const candidates: Doc<"eventArtistNeeds">[] = [];
    for (const status of ["open", "inquiring"] as const) {
      // Newest first so a long tail of old slots cannot crowd newer ones out of
      // the bounded window below.
      const rows = await ctx.db
        .query("eventArtistNeeds")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .take(MAX_NEED_CANDIDATES);
      candidates.push(...rows);
    }

    const out: Array<{
      needId: Id<"eventArtistNeeds">;
      eventId: Id<"events">;
      title: string;
      startAt: number;
      endAt: number;
      timezone: string;
      venueName: string;
      label: string;
      artistType: ArtistNeedType;
      genres: string;
      status: ArtistNeedStatus;
      alreadyInquired: boolean;
    }> = [];

    for (const need of candidates) {
      if (args.artistType && need.artistType !== args.artistType) continue;
      if (!artistTypeMatchesNeed(need.artistType, context.organizationType)) continue;
      const event = await ctx.db.get(need.eventId);
      if (!isArtistListableEvent(event, now)) continue;
      if (slotIsBooked(need, new Set()) || (await findActForSlot(ctx, need._id))) continue;

      const typeLabel = ARTIST_NEED_TYPE_LABELS[need.artistType];
      const slotLabel = need.label?.trim();
      if (needles.length > 0) {
        const haystack = [event.title, event.venueName, need.genres, typeLabel, slotLabel]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!needles.every((needle) => haystack.includes(needle))) continue;
      }

      const existingInquiry = await ctx.db
        .query("eventArtistInquiries")
        .withIndex("by_organizationId_and_needId", (q) =>
          q.eq("organizationId", context.organizationId).eq("needId", need._id),
        )
        .unique();

      out.push({
        needId: need._id,
        eventId: event._id,
        title: event.title,
        startAt: event.startAt,
        endAt: event.endAt,
        timezone: event.timezone,
        venueName: event.venueName ?? "",
        label: slotLabel ?? "",
        artistType: need.artistType,
        genres: need.genres ?? "",
        status: need.status,
        alreadyInquired: existingInquiry?.status === "submitted",
      });
    }

    return out.sort((a, b) => a.startAt - b.startAt);
  },
});

export const listMyInquiries = query({
  args: {},
  handler: async (ctx) => {
    const context = await requireBandContext(ctx);
    const inquiries = await ctx.db
      .query("eventArtistInquiries")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", context.organizationId))
      .take(100);

    const rows = await Promise.all(
      inquiries.map(async (inquiry) => {
        const event = await ctx.db.get(inquiry.eventId);
        const need = await ctx.db.get(inquiry.needId);
        return {
          inquiryId: inquiry._id,
          eventId: inquiry.eventId,
          title: event?.title ?? "Event",
          startAt: event?.startAt ?? 0,
          // Undefined for a deleted event so the client falls back to the
          // portal default rather than formatting with a bogus zone.
          timezone: event?.timezone,
          venueName: event?.venueName ?? "",
          label: need?.label ?? "",
          artistType: need?.artistType ?? ("no_preference" as const),
          genres: need?.genres ?? "",
          status: inquiry.status,
          message: inquiry.message ?? "",
          createdAt: inquiry.createdAt,
        };
      }),
    );

    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});
