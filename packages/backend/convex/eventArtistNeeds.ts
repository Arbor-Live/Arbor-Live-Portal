import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  findAuthUsersByIds,
  getUserId,
  requireArborInternalContext,
  requireAuth,
  requireBandContext,
} from "./lib/auth";
import { resolveBandName } from "./lib/bandIdentity";
import {
  artistNeedStatusValue,
  artistNeedActTypeValue,
  artistTypesLabel,
  artistTypesMatchNeed,
  artistTypesOf,
  buildArtistOpportunityRow,
  effectiveArtistNeedStatus,
  normalizeArtistTypes,
  resolveEventArtistBooking,
  slotIsBooked,
  type ArtistNeedActType,
  type ArtistOpportunityRow,
  type EffectiveArtistNeedStatus,
} from "./lib/eventArtistNeeds";
import {
  latestWebsiteVisibleDesign,
  MAX_DESIGNS_PER_EVENT,
} from "./lib/marketingDesigns";
import { buildPublicEventUrl, isPubliclyListableEvent } from "./lib/publicEvents";
import { resolveStoredR2AssetUrl } from "./inventoryR2";
import { SITE_URL } from "./email/constants";
import { scheduleArtistNeedInquiryEmail } from "./email/artistNeedInquiryEmails";
import {
  removeParticipationFromEvent,
  upsertEventBandParticipation,
} from "./eventBands";
import { syncInvoiceLineForSlot } from "./lib/artistLineSync";
import { normalizeEventStatus } from "./lib/eventStatus";
import { removePositionRow as removeSlotRow } from "./lib/positionRows";
import { syncNeedBlocks, syncParticipationBlocks } from "./lib/runOfShow";
import { requireOutreachAccess } from "./lib/outreachAccess";
import { appError, withReportableErrors } from "./lib/errors";

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
          artistTypes: artistTypesOf(slot),
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
/**
 * The bill on each day, in bill order, for the quote editor: every position
 * with the act filling it and the invoices whose artist lines price it.
 */
export const listNeedStatusForEvents = query({
  args: { eventIds: v.array(v.id("events")) },
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const out: Array<{
      eventId: Id<"events">;
      needId: Id<"eventArtistNeeds">;
      label: string;
      /** Empty means "no preference". */
      artistTypes: ArtistNeedActType[];
      status: EffectiveArtistNeedStatus;
      genres: string;
      /** The platform act seated on it. */
      actOrganizationId?: string;
      /** The seated act's name, or the outside act named on it. */
      actName?: string;
      /** Filled by an act that isn't on the platform. */
      external: boolean;
      /** Invoices with an artist line standing for this position. */
      invoiceIds: Id<"invoices">[];
    }> = [];
    for (const eventId of args.eventIds.slice(0, MAX_NEED_CANDIDATES)) {
      const slots = await loadSlotsForEvent(ctx, eventId);
      if (slots.length === 0) continue;
      const { filledSlotIds, lineup } = await resolveEventArtistBooking(ctx, eventId);
      for (const slot of slots) {
        const booked = slotIsBooked(slot, filledSlotIds);
        const act = lineup.find((entry) => entry.needId === slot._id);
        const external = slot.externalArtistName?.trim() || undefined;
        const lines = await ctx.db
          .query("invoiceLineItems")
          .withIndex("by_needId", (q) => q.eq("needId", slot._id))
          .take(10);
        out.push({
          eventId,
          needId: slot._id,
          label: slot.label ?? "",
          artistTypes: artistTypesOf(slot),
          status: effectiveArtistNeedStatus(slot.status, booked),
          genres: slot.genres ?? "",
          actOrganizationId: act?.organizationId,
          actName: act ? await nameFor(ctx, act.organizationId) : external,
          external: Boolean(external),
          invoiceIds: [...new Set(lines.map((line) => line.invoiceId))],
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
    /** Kinds of act the position is looking for; empty means no preference. */
    artistTypes: v.array(artistNeedActTypeValue),
    genres: v.optional(v.string()),
    status: artistNeedStatusValue,
    /** Set to create the position already filled by an outside act. */
    externalArtistName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const author = await requireAuth(ctx);
    return await withReportableErrors("eventArtistNeeds.upsertSlot", async () => {
    const event = await ctx.db.get(args.eventId);
    if (!event) appError("EVENT_NOT_FOUND", "Event not found.");
    const now = Date.now();
    const label = trimOptional(args.label);
    const genres = trimOptional(args.genres);
    const artistTypes = normalizeArtistTypes(args.artistTypes);

    if (args.needId) {
      const existing = await ctx.db.get(args.needId);
      if (!existing || existing.eventId !== args.eventId) {
        appError("NEED_SLOT_NOT_ON_EVENT", "Slot not found on this event.");
      }
      await ctx.db.patch(existing._id, {
        label,
        artistTypes,
        artistType: undefined,
        genres,
        status: args.status,
        ...(args.externalArtistName !== undefined
          ? { externalArtistName: trimOptional(args.externalArtistName) }
          : {}),
        updatedAt: now,
      });
      // Block labels carry the act/position name.
      await syncNeedBlocks(ctx, existing._id);
      return { needId: existing._id };
    }

    const existingRows = await loadSlotsForEvent(ctx, args.eventId);
    const needId = await ctx.db.insert("eventArtistNeeds", {
      eventId: args.eventId,
      sortOrder: (existingRows.at(-1)?.sortOrder ?? existingRows.at(-1)?.createdAt ?? now) + 1,
      label,
      artistTypes,
      genres,
      status: args.status,
      externalArtistName: trimOptional(args.externalArtistName),
      createdByUserId: getUserId(author),
      createdAt: now,
      updatedAt: now,
    });
    return { needId };
    });
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
    return await withReportableErrors("eventArtistNeeds.reorderSlots", async () => {
    const now = Date.now();
    for (const [index, needId] of args.needIds.entries()) {
      const slot = await ctx.db.get(needId);
      if (!slot || slot.eventId !== args.eventId) continue;
      if (slot.sortOrder === index) continue;
      await ctx.db.patch(needId, { sortOrder: index, updatedAt: now });
    }
    return null;
    });
  },
});

const ACT_TIME_FIELDS = ["setStartsAt", "setEndsAt", "soundcheckStartsAt", "soundcheckEndsAt"] as const;
type ActTimes = Partial<Record<(typeof ACT_TIME_FIELDS)[number], number>>;

function pickActTimes(row: ActTimes): ActTimes {
  const out: ActTimes = {};
  for (const field of ACT_TIME_FIELDS) {
    if (row[field] != null) out[field] = row[field];
  }
  return out;
}

/** Copy of `row` with exactly `times`; for `replace`, since `patch` can't clear fields. */
function withActTimes<T extends ActTimes>(row: T, times: ActTimes): T {
  const next = { ...row };
  for (const field of ACT_TIME_FIELDS) delete next[field];
  return { ...next, ...times };
}

/**
 * Two acts trade places on the bill (e.g. the opener and the headliner swap
 * slots). Each position keeps its label and Run of Show times; only who fills
 * it changes, so each act takes over the other's set and soundcheck. Either
 * position may be open, which moves the other act into it.
 */
export const swapPositions = mutation({
  args: {
    eventId: v.id("events"),
    needIdA: v.id("eventArtistNeeds"),
    needIdB: v.id("eventArtistNeeds"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    return await withReportableErrors("eventArtistNeeds.swapPositions", async () => {
    if (args.needIdA === args.needIdB) return null;
    const [slotA, slotB] = await Promise.all([ctx.db.get(args.needIdA), ctx.db.get(args.needIdB)]);
    if (!slotA || !slotB || slotA.eventId !== args.eventId || slotB.eventId !== args.eventId) {
      appError("NEED_POSITION_NOT_ON_EVENT", "Position not found on this event.");
    }
    const [actA, actB] = await Promise.all([
      findActForSlot(ctx, slotA._id),
      findActForSlot(ctx, slotB._id),
    ]);
    const externalA = slotA.externalArtistName?.trim() || undefined;
    const externalB = slotB.externalArtistName?.trim() || undefined;
    if (!actA && !actB && !externalA && !externalB) {
      appError("NEED_SWAP_BOTH_OPEN", "Both positions are open — there is no act to swap.");
    }
    // A position's times are its act's when a platform act fills it (see
    // `updateSlotLineup`), otherwise the position's own.
    const timesA = pickActTimes(actA ?? slotA);
    const timesB = pickActTimes(actB ?? slotB);
    const now = Date.now();

    // Positions keep their times (whoever fills them next shows them) and
    // trade outside-act names.
    const nextSlotA = withActTimes({ ...slotA, updatedAt: now }, timesA);
    const nextSlotB = withActTimes({ ...slotB, updatedAt: now }, timesB);
    delete nextSlotA.externalArtistName;
    delete nextSlotB.externalArtistName;
    if (externalB) nextSlotA.externalArtistName = externalB;
    if (externalA) nextSlotB.externalArtistName = externalA;
    await ctx.db.replace(slotA._id, nextSlotA);
    await ctx.db.replace(slotB._id, nextSlotB);

    if (actA) {
      await ctx.db.replace(
        actA._id,
        withActTimes({ ...actA, needId: slotB._id, updatedAt: now }, timesB),
      );
    }
    if (actB) {
      await ctx.db.replace(
        actB._id,
        withActTimes({ ...actB, needId: slotA._id, updatedAt: now }, timesA),
      );
    }

    // Invoice artist lines carry the act's fee and headcount, so they go with
    // the act. Read both before writing: the index sees this mutation's writes.
    const [lineA, lineB] = await Promise.all(
      [slotA._id, slotB._id].map((needId) =>
        ctx.db
          .query("invoiceLineItems")
          .withIndex("by_needId", (q) => q.eq("needId", needId))
          .first(),
      ),
    );
    if (lineA) await ctx.db.patch(lineA._id, { needId: slotB._id, updatedAt: now });
    if (lineB) await ctx.db.patch(lineB._id, { needId: slotA._id, updatedAt: now });

    for (const act of [actA, actB]) {
      if (act) await syncParticipationBlocks(ctx, act._id);
    }
    for (const needId of [slotA._id, slotB._id]) {
      await syncNeedBlocks(ctx, needId);
      await syncInvoiceLineForSlot(ctx, needId, now);
    }
    return null;
    });
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
    /** Omit to keep the current times — the Run of Show owns them now. */
    setStartsAt: v.optional(v.union(v.number(), v.null())),
    setEndsAt: v.optional(v.union(v.number(), v.null())),
    soundcheckStartsAt: v.optional(v.union(v.number(), v.null())),
    soundcheckEndsAt: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    return await withReportableErrors("eventArtistNeeds.updateSlotLineup", async () => {
    const slot = await ctx.db.get(args.needId);
    if (!slot) appError("NEED_POSITION_NOT_FOUND", "Position not found.");
    if (args.setStartsAt != null && args.setEndsAt != null && args.setEndsAt <= args.setStartsAt) {
      appError("ACT_SET_TIME_ORDER", "Set end time must be after the start time.");
    }
    if (
      args.soundcheckStartsAt != null &&
      args.soundcheckEndsAt != null &&
      args.soundcheckEndsAt <= args.soundcheckStartsAt
    ) {
      appError("ACT_SOUNDCHECK_TIME_ORDER", "Soundcheck end time must be after the start time.");
    }
    const name = args.externalArtistName?.trim() || undefined;
    const act = await findActForSlot(ctx, slot._id);
    if (name && act) {
      appError("NEED_POSITION_FILLED_BY_ACT", "This position is filled by an artist already on the bill.");
    }
    const timeFields = ["setStartsAt", "setEndsAt", "soundcheckStartsAt", "soundcheckEndsAt"] as const;
    const next: Doc<"eventArtistNeeds"> = { ...slot, updatedAt: Date.now() };
    if (name) next.externalArtistName = name;
    else delete next.externalArtistName;
    // A platform act filling the position owns the times (the Lineup, the Run
    // of Show and public pages read the act's), so write them there instead.
    const actTimes: Partial<Record<(typeof timeFields)[number], number | undefined>> = {};
    for (const field of timeFields) {
      const value = args[field];
      if (value === undefined) continue;
      if (act) actTimes[field] = value ?? undefined;
      else if (value === null) delete next[field];
      else next[field] = value;
    }
    await ctx.db.replace(slot._id, next);
    if (act && Object.keys(actTimes).length > 0) {
      await ctx.db.patch(act._id, { ...actTimes, updatedAt: next.updatedAt });
      await syncParticipationBlocks(ctx, act._id);
    }
    await syncNeedBlocks(ctx, slot._id);
    await syncInvoiceLineForSlot(ctx, slot._id, next.updatedAt);
    return null;
    });
  },
});

/** Deletes a position with its inquiries and blocks; a seated act is unlinked, not removed. */
export const removeSlot = mutation({
  args: { needId: v.id("eventArtistNeeds") },
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    return await withReportableErrors("eventArtistNeeds.removeSlot", async () => {
      await removeSlotRow(ctx, args.needId);
    });
  },
});

/**
 * Remove from bill: the act and its position in one transaction, so a failure
 * (such as a paid payout) leaves both in place.
 */
export const removeFromBill = mutation({
  args: {
    eventId: v.id("events"),
    organizationId: v.optional(v.string()),
    needId: v.optional(v.id("eventArtistNeeds")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    return await withReportableErrors("eventArtistNeeds.removeFromBill", async () => {
    if (args.needId) {
      const slot = await ctx.db.get(args.needId);
      if (slot && slot.eventId !== args.eventId) {
        appError("NEED_POSITION_WRONG_EVENT", "That position is on another event.");
      }
    }
    if (args.organizationId) {
      await removeParticipationFromEvent(ctx, args.eventId, args.organizationId);
    }
    if (args.needId) await removeSlotRow(ctx, args.needId);
    return null;
    });
  },
});

export const submitInquiry = mutation({
  args: { needId: v.id("eventArtistNeeds"), message: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const context = await requireBandContext(ctx);
    return await withReportableErrors("eventArtistNeeds.submitInquiry", async () => {
    const need = await ctx.db.get(args.needId);
    if (!need) appError("NEED_SLOT_UNAVAILABLE", "This slot is no longer available.");
    const event = await ctx.db.get(need.eventId);
    // Same gate as `listOpenNeedsForArtist`: only public, upcoming, uncancelled
    // events that match this artist's type are inquirable.
    if (!isArtistListableEvent(event, Date.now())) {
      appError("NEED_SLOT_UNAVAILABLE", "This slot is no longer available.");
    }
    if (!artistTypesMatchNeed(artistTypesOf(need), context.organizationType)) {
      appError("NEED_SLOT_ACT_TYPE_MISMATCH", "This slot is not looking for your kind of act.");
    }
    if (slotIsBooked(need, new Set()) || (await findActForSlot(ctx, need._id))) {
      appError("NEED_SLOT_FILLED", "This slot is already filled.");
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
    });
  },
});

export const dismissInquiry = mutation({
  args: { inquiryId: v.id("eventArtistInquiries") },
  handler: async (ctx, args) => {
    await requireOutreachAccess(ctx);
    return await withReportableErrors("eventArtistNeeds.dismissInquiry", async () => {
    const inquiry = await ctx.db.get(args.inquiryId);
    if (!inquiry) appError("INQUIRY_NOT_FOUND", "Inquiry not found.");
    await ctx.db.patch(inquiry._id, { status: "dismissed", updatedAt: Date.now() });
    });
  },
});

/**
 * Accept an inquiry: book the inquiring artist into the position it asked for,
 * mark the inquiry accepted, and dismiss the position's other open inquiries.
 * Filling and closing out the queue are one step so a position can't be booked
 * while its inquiries still read as pending.
 */
export const acceptInquiry = mutation({
  args: { inquiryId: v.id("eventArtistInquiries") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOutreachAccess(ctx);
    return await withReportableErrors("eventArtistNeeds.acceptInquiry", async () => {
    const inquiry = await ctx.db.get(args.inquiryId);
    if (!inquiry) appError("INQUIRY_NOT_FOUND", "Inquiry not found.");
    if (inquiry.status === "accepted") return null;
    const need = await ctx.db.get(inquiry.needId);
    if (!need) appError("NEED_POSITION_NOT_FOUND", "Position not found.");
    const currentAct = await findActForSlot(ctx, need._id);
    if (
      need.externalArtistName?.trim() ||
      (currentAct && currentAct.organizationId !== inquiry.organizationId)
    ) {
      appError("NEED_POSITION_ALREADY_FILLED", "This position is already filled.");
    }
    const existing = await ctx.db
      .query("eventBandParticipations")
      .withIndex("by_eventId_and_organizationId", (q) =>
        q.eq("eventId", need.eventId).eq("organizationId", inquiry.organizationId),
      )
      .unique();
    await upsertEventBandParticipation(ctx, {
      eventId: need.eventId,
      organizationId: inquiry.organizationId,
      role: existing?.role ?? "headliner",
      needId: need._id,
    });
    const now = Date.now();
    await ctx.db.patch(inquiry._id, { status: "accepted", updatedAt: now });
    const siblings = await ctx.db
      .query("eventArtistInquiries")
      .withIndex("by_needId", (q) => q.eq("needId", need._id))
      .take(200);
    for (const row of siblings) {
      if (row._id === inquiry._id || row.status !== "submitted") continue;
      await ctx.db.patch(row._id, { status: "dismissed", updatedAt: now });
    }
    return null;
    });
  },
});

export const listOpenNeedsForArtist = query({
  args: {
    /** Only positions looking for this kind of act. */
    artistType: v.optional(artistNeedActTypeValue),
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

    const out: ArtistOpportunityRow[] = [];

    // Several positions can share an event, so read its design once and reuse
    // it (description + resolved poster) for every row on that event.
    const designByEvent = new Map<
      Id<"events">,
      { design: Doc<"eventMarketingDesigns"> | null; posterUrl?: string }
    >();
    async function designForEvent(eventId: Id<"events">) {
      const cached = designByEvent.get(eventId);
      if (cached) return cached;
      const designs = await ctx.db
        .query("eventMarketingDesigns")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .take(MAX_DESIGNS_PER_EVENT);
      const design = latestWebsiteVisibleDesign(designs);
      const posterUrl = design?.imageUrl
        ? ((await resolveStoredR2AssetUrl(design.imageUrl)) ?? undefined)
        : undefined;
      const value = { design, posterUrl };
      designByEvent.set(eventId, value);
      return value;
    }

    for (const need of candidates) {
      const lookingFor = artistTypesOf(need);
      if (args.artistType && !lookingFor.includes(args.artistType)) continue;
      if (!artistTypesMatchNeed(lookingFor, context.organizationType)) continue;
      const event = await ctx.db.get(need.eventId);
      if (!isArtistListableEvent(event, now)) continue;
      if (slotIsBooked(need, new Set()) || (await findActForSlot(ctx, need._id))) continue;

      const typeLabel = artistTypesLabel(lookingFor);
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

      const { design, posterUrl } = await designForEvent(event._id);
      out.push(
        buildArtistOpportunityRow({
          need,
          event,
          design,
          posterUrl,
          siteUrl: SITE_URL,
          alreadyInquired: existingInquiry?.status === "submitted",
        }),
      );
    }

    return out.sort((a, b) => a.startAt - b.startAt);
  },
});

/** How far ahead the logistics view looks, and how many events it scans. */
const OPEN_POSITIONS_HORIZON_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_OPEN_POSITION_EVENTS = 150;
const MAX_POSITIONS_PER_EVENT = 100;
const MAX_ACTS_PER_EVENT = 50;
const MAX_INQUIRIES_PER_EVENT = 300;
const MAX_OUTREACH_PER_EVENT = 400;

const openPositionValue = v.object({
  needId: v.id("eventArtistNeeds"),
  label: v.string(),
  artistTypes: v.array(artistNeedActTypeValue),
  genres: v.string(),
  status: artistNeedStatusValue,
  inquiryCount: v.number(),
  setStartsAt: v.optional(v.number()),
  setEndsAt: v.optional(v.number()),
});

/**
 * Logistics: upcoming events (next 180 days, not cancelled) with positions no
 * act fills yet, soonest first, and how full each bill is.
 */
export const listOpenPositions = query({
  args: {},
  returns: v.object({
    events: v.array(
      v.object({
        eventId: v.id("events"),
        title: v.string(),
        startAt: v.number(),
        endAt: v.number(),
        venueName: v.string(),
        status: v.string(),
        totalPositions: v.number(),
        operationsLeadUserId: v.optional(v.string()),
        operationsLeadName: v.optional(v.string()),
        openPositions: v.array(openPositionValue),
        /** Staff outreach (`eventArtistOutreach`) for the date, leaving out acts already booked. */
        outreach: v.object({ asked: v.number(), available: v.number(), unavailable: v.number() }),
      }),
    ),
    /** A scan limit was hit, so the list may be missing positions. */
    truncated: v.boolean(),
  }),
  handler: async (ctx) => {
    // Open Positions is an Operations board; crew don't book acts.
    await requireOutreachAccess(ctx);
    // A little slack so tonight's show still shows while it's on.
    const now = Date.now() - 6 * 60 * 60 * 1000;
    const events = await ctx.db
      .query("events")
      .withIndex("by_startAt", (q) => q.gte("startAt", now).lte("startAt", now + OPEN_POSITIONS_HORIZON_MS))
      .take(MAX_OPEN_POSITION_EVENTS);
    let truncated = events.length === MAX_OPEN_POSITION_EVENTS;

    const out = [];
    for (const event of events) {
      const status = normalizeEventStatus(event.status);
      if (status === "cancelled") continue;
      const positions = await ctx.db
        .query("eventArtistNeeds")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(MAX_POSITIONS_PER_EVENT);
      if (positions.length === 0) continue;
      const acts = await ctx.db
        .query("eventBandParticipations")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(MAX_ACTS_PER_EVENT);
      if (positions.length === MAX_POSITIONS_PER_EVENT || acts.length === MAX_ACTS_PER_EVENT) {
        truncated = true;
      }
      const filled = new Set(acts.flatMap((act) => (act.needId ? [act.needId] : [])));
      const open = positions
        .filter((position) => !slotIsBooked(position, filled))
        .sort(
          (a, b) =>
            (a.setStartsAt ?? Number.POSITIVE_INFINITY) - (b.setStartsAt ?? Number.POSITIVE_INFINITY) ||
            (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
        );
      if (open.length === 0) continue;
      // One read per event (not per position) for inquiry counts.
      const inquiries = await ctx.db
        .query("eventArtistInquiries")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(MAX_INQUIRIES_PER_EVENT);
      if (inquiries.length === MAX_INQUIRIES_PER_EVENT) truncated = true;
      const inquiryCount = new Map<Id<"eventArtistNeeds">, number>();
      for (const inquiry of inquiries) {
        if (inquiry.status !== "submitted") continue;
        inquiryCount.set(inquiry.needId, (inquiryCount.get(inquiry.needId) ?? 0) + 1);
      }
      const outreachRows = await ctx.db
        .query("eventArtistOutreach")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(MAX_OUTREACH_PER_EVENT);
      if (outreachRows.length === MAX_OUTREACH_PER_EVENT) truncated = true;
      // `acts` is capped; past the cap, look each outreach act up by index so a
      // booked act is never counted as pending.
      const actsComplete = acts.length < MAX_ACTS_PER_EVENT;
      const bookedOrgs = new Set(acts.map((act) => act.organizationId));
      const isBookedOrg = async (organizationId: string) =>
        bookedOrgs.has(organizationId) ||
        (!actsComplete &&
          (await ctx.db
            .query("eventBandParticipations")
            .withIndex("by_eventId_and_organizationId", (q) =>
              q.eq("eventId", event._id).eq("organizationId", organizationId),
            )
            .unique()) !== null);
      const bookedNames = new Set(
        positions.flatMap((position) => {
          const name = position.externalArtistName?.trim().toLowerCase();
          return name ? [name] : [];
        }),
      );
      const outreach = { asked: 0, available: 0, unavailable: 0 };
      for (const row of outreachRows) {
        const booked = row.organizationId
          ? await isBookedOrg(row.organizationId)
          : bookedNames.has(row.externalName?.trim().toLowerCase() ?? "");
        if (!booked) outreach[row.status] += 1;
      }
      const openPositions = open.map((position) => ({
        needId: position._id,
        label: position.label?.trim() ?? "",
        artistTypes: artistTypesOf(position),
        genres: position.genres ?? "",
        status: position.status,
        inquiryCount: inquiryCount.get(position._id) ?? 0,
        setStartsAt: position.setStartsAt,
        setEndsAt: position.setEndsAt,
      }));
      out.push({
        eventId: event._id,
        title: event.title,
        startAt: event.startAt,
        endAt: event.endAt,
        venueName: event.venueName ?? "",
        status,
        totalPositions: positions.length,
        operationsLeadUserId: event.operationsLeadUserId,
        openPositions,
        outreach,
      });
    }
    // One batch lookup for every distinct operations lead, so a lead who is no
    // longer an assignable crew member still shows a name instead of blank.
    const leadUserIds = out.flatMap((event) =>
      event.operationsLeadUserId ? [event.operationsLeadUserId] : [],
    );
    const leadUsers = await findAuthUsersByIds(ctx, leadUserIds);
    const eventsWithLeads = out.map((event) => {
      const lead = event.operationsLeadUserId
        ? leadUsers.get(event.operationsLeadUserId)
        : undefined;
      return {
        ...event,
        operationsLeadName: lead?.name?.trim() || lead?.email?.trim() || undefined,
      };
    });
    return { events: eventsWithLeads, truncated };
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

    // Resolve each event's poster once, even if the band requested several of
    // its positions.
    const posterByEvent = new Map<Id<"events">, string | undefined>();
    async function posterForEvent(eventId: Id<"events">) {
      if (posterByEvent.has(eventId)) return posterByEvent.get(eventId);
      const designs = await ctx.db
        .query("eventMarketingDesigns")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .take(MAX_DESIGNS_PER_EVENT);
      const design = latestWebsiteVisibleDesign(designs);
      const posterUrl = design?.imageUrl
        ? ((await resolveStoredR2AssetUrl(design.imageUrl)) ?? undefined)
        : undefined;
      posterByEvent.set(eventId, posterUrl);
      return posterUrl;
    }

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
          artistTypes: need ? artistTypesOf(need) : [],
          genres: need?.genres ?? "",
          status: inquiry.status,
          message: inquiry.message ?? "",
          createdAt: inquiry.createdAt,
          posterUrl: await posterForEvent(inquiry.eventId),
          // Link to the event page only when it exists (public + listable).
          publicEventUrl:
            event && isPubliclyListableEvent(event)
              ? buildPublicEventUrl(String(event._id), SITE_URL)
              : undefined,
        };
      }),
    );

    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});
