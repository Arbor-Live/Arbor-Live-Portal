import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { findAuthUsersByIds, getUserId } from "./lib/auth";
import { requireOutreachAccess } from "./lib/outreachAccess";
import { resolveBandName } from "./lib/bandIdentity";
import {
  artistNeedActTypeValue,
  artistTypesLabel,
  artistTypesMatchNeed,
  artistTypesOf,
  slotIsBooked,
} from "./lib/eventArtistNeeds";
import { upsertEventBandParticipation } from "./lib/eventBandParticipation";
import { syncInvoiceLineForSlot } from "./lib/artistLineSync";
import { syncNeedBlocks } from "./lib/runOfShow";

/**
 * Outreach checklist for an event's open positions: the acts staff asked to
 * play the date and what each said (asked → available / can't). It's one list
 * per event, since an act free that night can fill any open slot; an act can
 * be tagged for one slot. Staff book an available act into a slot from here.
 */

/** An event's bill is asked of a few dozen acts at most; past this the list is noise. */
export const MAX_OUTREACH_PER_EVENT = 60;
const MAX_SLOTS = 100;

const outreachStatusValue = v.union(v.literal("asked"), v.literal("available"), v.literal("unavailable"));

const outreachRowValue = v.object({
  _id: v.id("eventArtistOutreach"),
  organizationId: v.union(v.string(), v.null()),
  name: v.string(),
  status: outreachStatusValue,
  note: v.string(),
  askedAt: v.number(),
  askedByName: v.string(),
  respondedAt: v.union(v.number(), v.null()),
  /** The slot the act is tagged for; null is "any slot". */
  needId: v.union(v.id("eventArtistNeeds"), v.null()),
  /** Open slots this act's type fits, best first (its tag, then bill order). */
  fitsNeedIds: v.array(v.id("eventArtistNeeds")),
  /** Set once the act is on the bill: the slot it fills, if any. */
  booked: v.union(v.object({ label: v.string() }), v.null()),
});

const outreachSlotValue = v.object({
  needId: v.id("eventArtistNeeds"),
  label: v.string(),
  /** Act types the slot looks for; empty is no preference. */
  artistTypes: v.array(artistNeedActTypeValue),
  open: v.boolean(),
});

function slotLabel(slot: Doc<"eventArtistNeeds">) {
  return slot.label?.trim() || artistTypesLabel(artistTypesOf(slot));
}

/**
 * The event's slots in bill order, with which are filled. Each slot's act is
 * an indexed point lookup, so a long bill can't hide a filled slot behind a
 * page cap.
 */
async function loadSlots(ctx: QueryCtx, eventId: Id<"events">) {
  const slots = await ctx.db
    .query("eventArtistNeeds")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(MAX_SLOTS);
  slots.sort((a, b) => (a.sortOrder ?? a.createdAt) - (b.sortOrder ?? b.createdAt) || a.createdAt - b.createdAt);
  const seated = await Promise.all(
    slots.map((slot) =>
      ctx.db
        .query("eventBandParticipations")
        .withIndex("by_needId", (q) => q.eq("needId", slot._id))
        .first(),
    ),
  );
  const filled = new Set(slots.filter((_, index) => seated[index] !== null).map((slot) => slot._id));
  return { slots, filled };
}

/** The act's participation on the event, looked up by index (never from a capped list). */
async function findParticipation(ctx: QueryCtx, eventId: Id<"events">, organizationId: string) {
  return await ctx.db
    .query("eventBandParticipations")
    .withIndex("by_eventId_and_organizationId", (q) =>
      q.eq("eventId", eventId).eq("organizationId", organizationId),
    )
    .unique();
}

async function requireRow(ctx: MutationCtx, outreachId: Id<"eventArtistOutreach">) {
  const row = await ctx.db.get(outreachId);
  if (!row) throw new Error("This act is no longer on the outreach list.");
  return row;
}

/** The slot must be on the row's event. */
async function requireSlotOnEvent(
  ctx: MutationCtx,
  eventId: Id<"events">,
  needId: Id<"eventArtistNeeds">,
) {
  const need = await ctx.db.get(needId);
  if (!need || need.eventId !== eventId) throw new Error("That position isn't on this event.");
  return need;
}

export const listForEvent = query({
  args: { eventId: v.id("events") },
  returns: v.object({ rows: v.array(outreachRowValue), slots: v.array(outreachSlotValue) }),
  handler: async (ctx, args) => {
    await requireOutreachAccess(ctx);
    const [{ slots, filled }, rows] = await Promise.all([
      loadSlots(ctx, args.eventId),
      ctx.db
        .query("eventArtistOutreach")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .take(MAX_OUTREACH_PER_EVENT),
    ]);
    const slotById = new Map(slots.map((slot) => [slot._id, slot]));
    const openSlots = slots.filter((slot) => !slotIsBooked(slot, filled));
    const askers = await findAuthUsersByIds(
      ctx,
      rows.map((row) => row.askedByUserId),
    );
    const orgIds = [...new Set(rows.flatMap((row) => (row.organizationId ? [row.organizationId] : [])))];
    const orgs = new Map(
      await Promise.all(
        orgIds.map(async (organizationId) => {
          const [name, profile, act] = await Promise.all([
            resolveBandName(ctx, organizationId),
            ctx.db
              .query("organizationProfiles")
              .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
              .unique(),
            findParticipation(ctx, args.eventId, organizationId),
          ]);
          return [organizationId, { name, type: profile?.organizationType ?? "band", act }] as const;
        }),
      ),
    );

    const out = rows.map((row) => {
      const org = row.organizationId ? orgs.get(row.organizationId) : undefined;
      const name = org?.name ?? row.externalName ?? "Act";
      const tagged = row.needId && slotById.has(row.needId) ? row.needId : null;
      let booked: { label: string } | null = null;
      if (row.organizationId) {
        const act = org?.act;
        if (act) {
          const slot = act.needId ? slotById.get(act.needId) : undefined;
          booked = { label: slot ? slotLabel(slot) : "On the bill" };
        }
      } else {
        const key = row.externalName?.trim().toLowerCase();
        const slot = key ? slots.find((candidate) => candidate.externalArtistName?.trim().toLowerCase() === key) : undefined;
        if (slot) booked = { label: slotLabel(slot) };
      }
      const fits = openSlots
        .filter((slot) => !row.organizationId || artistTypesMatchNeed(artistTypesOf(slot), org?.type))
        .map((slot) => slot._id)
        .sort((a, b) => Number(b === tagged) - Number(a === tagged));
      const asker = askers.get(row.askedByUserId);
      return {
        _id: row._id,
        organizationId: row.organizationId ?? null,
        name,
        status: row.status,
        note: row.note ?? "",
        askedAt: row.askedAt,
        askedByName: asker?.name?.trim() || asker?.email?.trim() || "",
        respondedAt: row.respondedAt ?? null,
        needId: tagged,
        fitsNeedIds: booked ? [] : fits,
        booked,
      };
    });
    out.sort((a, b) => a.askedAt - b.askedAt || a.name.localeCompare(b.name));
    return {
      rows: out,
      slots: slots.map((slot) => ({
        needId: slot._id,
        label: slotLabel(slot),
        artistTypes: artistTypesOf(slot),
        open: !slotIsBooked(slot, filled),
      })),
    };
  },
});

/** Adds acts to the event's checklist as asked. Acts already on it are skipped. */
export const add = mutation({
  args: {
    eventId: v.id("events"),
    organizationIds: v.optional(v.array(v.string())),
    /** An act that isn't on the portal. */
    externalName: v.optional(v.string()),
    /** Tag the new acts for one slot. */
    needId: v.optional(v.id("eventArtistNeeds")),
  },
  returns: v.object({ added: v.number() }),
  handler: async (ctx, args) => {
    const user = await requireOutreachAccess(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    if (args.needId) await requireSlotOnEvent(ctx, event._id, args.needId);
    const existing = await ctx.db
      .query("eventArtistOutreach")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .take(MAX_OUTREACH_PER_EVENT + 1);
    const knownOrgs = new Set(existing.flatMap((row) => (row.organizationId ? [row.organizationId] : [])));
    const knownNames = new Set(
      existing.flatMap((row) => (row.externalName ? [row.externalName.trim().toLowerCase()] : [])),
    );
    const fresh: Array<Pick<Doc<"eventArtistOutreach">, "organizationId" | "externalName">> = [];
    for (const organizationId of new Set(args.organizationIds ?? [])) {
      if (organizationId.trim() && !knownOrgs.has(organizationId)) fresh.push({ organizationId });
    }
    const externalName = args.externalName?.trim();
    if (externalName && !knownNames.has(externalName.toLowerCase())) fresh.push({ externalName });
    if (existing.length + fresh.length > MAX_OUTREACH_PER_EVENT) {
      throw new Error(`An event can track at most ${MAX_OUTREACH_PER_EVENT} acts.`);
    }
    const now = Date.now();
    for (const row of fresh) {
      await ctx.db.insert("eventArtistOutreach", {
        eventId: event._id,
        needId: args.needId,
        ...row,
        status: "asked",
        askedAt: now,
        askedByUserId: getUserId(user),
        updatedAt: now,
      });
    }
    return { added: fresh.length };
  },
});

export const setStatus = mutation({
  args: { outreachId: v.id("eventArtistOutreach"), status: outreachStatusValue },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOutreachAccess(ctx);
    const row = await requireRow(ctx, args.outreachId);
    if (row.status === args.status) return null;
    const now = Date.now();
    await ctx.db.patch(row._id, {
      status: args.status,
      respondedAt: args.status === "asked" ? undefined : now,
      updatedAt: now,
    });
    return null;
  },
});

export const setNote = mutation({
  args: { outreachId: v.id("eventArtistOutreach"), note: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOutreachAccess(ctx);
    const row = await requireRow(ctx, args.outreachId);
    await ctx.db.patch(row._id, { note: args.note.trim() || undefined, updatedAt: Date.now() });
    return null;
  },
});

/** Tags the act for one slot, or back to any slot (`needId: null`). */
export const setSlot = mutation({
  args: { outreachId: v.id("eventArtistOutreach"), needId: v.union(v.id("eventArtistNeeds"), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOutreachAccess(ctx);
    const row = await requireRow(ctx, args.outreachId);
    if (args.needId) await requireSlotOnEvent(ctx, row.eventId, args.needId);
    await ctx.db.patch(row._id, { needId: args.needId ?? undefined, updatedAt: Date.now() });
    return null;
  },
});

export const remove = mutation({
  args: { outreachId: v.id("eventArtistOutreach") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOutreachAccess(ctx);
    const row = await ctx.db.get(args.outreachId);
    if (row) await ctx.db.delete(row._id);
    return null;
  },
});

/**
 * Books an act from the checklist into an open slot on its event: a portal
 * artist joins the bill against the slot (its pending inquiry for the slot, if
 * any, is accepted and the rest dismissed, as when accepting an inquiry), an
 * outside act fills it by name. The act is marked available and tagged for
 * the slot, and stays on the list.
 */
export const book = mutation({
  args: { outreachId: v.id("eventArtistOutreach"), needId: v.id("eventArtistNeeds") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOutreachAccess(ctx);
    const row = await requireRow(ctx, args.outreachId);
    const need = await requireSlotOnEvent(ctx, row.eventId, args.needId);
    const seated = await ctx.db
      .query("eventBandParticipations")
      .withIndex("by_needId", (q) => q.eq("needId", need._id))
      .first();
    if (slotIsBooked(need, new Set(seated ? [need._id] : []))) {
      throw new Error("That position is already filled.");
    }
    const now = Date.now();
    if (row.organizationId) {
      const organizationId = row.organizationId;
      // Same rule as the slots `listForEvent` offers: a DJ can't take a live-band slot.
      const profile = await ctx.db
        .query("organizationProfiles")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
        .unique();
      if (!artistTypesMatchNeed(artistTypesOf(need), profile?.organizationType ?? "band")) {
        throw new Error(`${await resolveBandName(ctx, organizationId)} doesn't fit that position's act type.`);
      }
      const existing = await findParticipation(ctx, need.eventId, organizationId);
      if (existing?.needId) throw new Error(`${await resolveBandName(ctx, organizationId)} is already on the bill.`);
      await upsertEventBandParticipation(ctx, {
        eventId: need.eventId,
        organizationId,
        role: existing?.role ?? "headliner",
        needId: need._id,
      });
      const inquiries = await ctx.db
        .query("eventArtistInquiries")
        .withIndex("by_needId", (q) => q.eq("needId", need._id))
        .take(200);
      for (const inquiry of inquiries) {
        if (inquiry.status !== "submitted") continue;
        await ctx.db.patch(inquiry._id, {
          status: inquiry.organizationId === organizationId ? "accepted" : "dismissed",
          updatedAt: now,
        });
      }
    } else {
      const name = row.externalName?.trim();
      if (!name) throw new Error("This act has no name.");
      await ctx.db.patch(need._id, { externalArtistName: name, updatedAt: now });
      await syncNeedBlocks(ctx, need._id);
      await syncInvoiceLineForSlot(ctx, need._id, now);
    }
    await ctx.db.patch(row._id, {
      status: "available",
      needId: need._id,
      respondedAt: row.status === "available" ? row.respondedAt : now,
      updatedAt: now,
    });
    return null;
  },
});
