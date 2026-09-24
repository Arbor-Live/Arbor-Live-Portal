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
  resolveEventBookedArtistIds,
  type ArtistNeedStatus,
  type ArtistNeedType,
  type EffectiveArtistNeedStatus,
} from "./lib/eventArtistNeeds";
import { scheduleArtistNeedInquiryEmail } from "./email/artistNeedInquiryEmails";
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

async function loadNeedForEvent(ctx: QueryCtx, eventId: Id<"events">) {
  return await ctx.db
    .query("eventArtistNeeds")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .unique();
}

async function findAuthName(ctx: QueryCtx, organizationId: string) {
  return await resolveBandName(ctx, organizationId);
}

export const getForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const need = await loadNeedForEvent(ctx, args.eventId);
    const bookedArtistIds = await resolveEventBookedArtistIds(ctx, args.eventId);
    const bookedArtists = await Promise.all(
      bookedArtistIds.map(async (organizationId) => ({
        organizationId,
        name: await findAuthName(ctx, organizationId),
      })),
    );

    const inquiries = need
      ? await ctx.db
          .query("eventArtistInquiries")
          .withIndex("by_needId", (q) => q.eq("needId", need._id))
          .take(100)
      : [];
    const serializedInquiries = (
      await Promise.all(
        inquiries
          .sort((a, b) => b.createdAt - a.createdAt)
          .map(async (inquiry) => ({
            _id: inquiry._id,
            organizationId: inquiry.organizationId,
            name: await findAuthName(ctx, inquiry.organizationId),
            message: inquiry.message ?? "",
            status: inquiry.status,
            createdAt: inquiry.createdAt,
          })),
      )
    );

    const booked = bookedArtists.length > 0;
    return {
      need: need
        ? {
            _id: need._id,
            artistType: need.artistType,
            genres: need.genres ?? "",
            status: need.status,
            effectiveStatus: effectiveArtistNeedStatus(need.status, booked),
            updatedAt: need.updatedAt,
          }
        : null,
      bookedArtists,
      inquiries: serializedInquiries,
    };
  },
});

/** Effective need status per event, for annotating invoice artist rows. */
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
      const need = await loadNeedForEvent(ctx, eventId);
      if (!need) continue;
      const booked = (await resolveEventBookedArtistIds(ctx, eventId)).length > 0;
      out.push({
        eventId,
        artistType: need.artistType,
        status: effectiveArtistNeedStatus(need.status, booked),
        genres: need.genres ?? "",
      });
    }
    return out;
  },
});

export const upsertForEvent = mutation({
  args: {
    eventId: v.id("events"),
    artistType: artistNeedTypeValue,
    genres: v.optional(v.string()),
    status: artistNeedStatusValue,
  },
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const author = await requireAuth(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    const now = Date.now();
    const genres = trimOptional(args.genres);
    const existing = await loadNeedForEvent(ctx, args.eventId);
    if (existing) {
      await ctx.db.patch(existing._id, {
        artistType: args.artistType,
        genres,
        status: args.status,
        updatedAt: now,
      });
      return { needId: existing._id };
    }
    const needId = await ctx.db.insert("eventArtistNeeds", {
      eventId: args.eventId,
      artistType: args.artistType,
      genres,
      status: args.status,
      createdByUserId: getUserId(author),
      createdAt: now,
      updatedAt: now,
    });
    return { needId };
  },
});

export const removeForEvent = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const need = await loadNeedForEvent(ctx, args.eventId);
    if (!need) return;
    const inquiries = await ctx.db
      .query("eventArtistInquiries")
      .withIndex("by_needId", (q) => q.eq("needId", need._id))
      .take(200);
    for (const inquiry of inquiries) {
      await ctx.db.delete(inquiry._id);
    }
    await ctx.db.delete(need._id);
  },
});

export const submitInquiry = mutation({
  args: { needId: v.id("eventArtistNeeds"), message: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const context = await requireBandContext(ctx);
    const need = await ctx.db.get(args.needId);
    if (!need) throw new Error("This need is no longer available.");
    const event = await ctx.db.get(need.eventId);
    // Same gate as `listOpenNeedsForArtist`: only public, upcoming, uncancelled
    // events that match this artist's type are inquirable.
    if (!isArtistListableEvent(event, Date.now())) {
      throw new Error("This need is no longer available.");
    }
    if (!artistTypeMatchesNeed(need.artistType, context.organizationType)) {
      throw new Error("This need is not looking for your kind of act.");
    }
    if ((await resolveEventBookedArtistIds(ctx, need.eventId)).length > 0) {
      throw new Error("This event already has an artist booked.");
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
      // Newest first so a long tail of old needs cannot crowd newer ones out of
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
      if ((await resolveEventBookedArtistIds(ctx, need.eventId)).length > 0) continue;

      if (needles.length > 0) {
        const haystack = [
          event.title,
          event.venueName,
          need.genres,
          ARTIST_NEED_TYPE_LABELS[need.artistType],
        ]
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
