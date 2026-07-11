import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdmin } from "./lib/auth";
import { enforceRateLimit, HOUR_MS } from "./rateLimit";
import { runnerWindowFor, runnerWindowOpenAt } from "./lib/openMicAddon";

export const OPEN_MIC_EQUIPMENT_OPTIONS = [
  "Piano",
  "Headphone Jack",
  "Background Music",
  '3/4" Cable',
  "Music Stand",
] as const;

export type OpenMicEquipment = (typeof OPEN_MIC_EQUIPMENT_OPTIONS)[number];

export const openMicStatusValue = v.union(
  v.literal("scheduled"),
  v.literal("live"),
  v.literal("completed"),
  v.literal("cancelled"),
);

const signupStatusValue = v.union(
  v.literal("queued"),
  v.literal("current"),
  v.literal("performed"),
  v.literal("removed"),
);

/** Public projection of the next event accepting Open Mic sign-ups. */
const publicEventValue = v.object({
  _id: v.id("events"),
  title: v.string(),
  startAt: v.number(),
  endAt: v.optional(v.number()),
});

function isStanfordEmail(email: string) {
  return /^[^\s@]+@(?:stanford\.edu|alumni\.stanford\.edu)$/i.test(email.trim());
}

function isUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Sign-ups stay open for an event up to 4 hours after its listed start. */
const ACTIVE_EVENT_WINDOW_MS = 4 * HOUR_MS;

/* ------------------------------------------------------------------ */
/* Public queries                                                     */
/* ------------------------------------------------------------------ */

/** Find the next upcoming Arbor Live event that has the Open Mic add-on
 *  enabled and accepting sign-ups. Returned to the public sign-up wizard. */
export const getActiveNight = query({
  args: {},
  returns: v.union(v.null(), publicEventValue),
  handler: async (ctx) => {
    const now = Date.now();
    const since = now - ACTIVE_EVENT_WINDOW_MS;
    const events = await ctx.db
      .query("events")
      .withIndex("by_openMicEnabled_and_startAt", (q) =>
        q.eq("openMicEnabled", true).gte("startAt", since),
      )
      .take(100);
    const candidate = events
      .filter((event) => event.openMicStatus === "scheduled" || event.openMicStatus === "live")
      .sort((a, b) => a.startAt - b.startAt)[0];
    if (!candidate) return null;
    return {
      _id: candidate._id,
      title: candidate.title,
      startAt: candidate.startAt,
      endAt: candidate.endAt,
    };
  },
});

/* ------------------------------------------------------------------ */
/* Public submit                                                      */
/* ------------------------------------------------------------------ */

export const submitPublic = mutation({
  args: {
    website: v.optional(v.string()),
    eventId: v.id("events"),
    name: v.string(),
    email: v.string(),
    whatTheyreDoing: v.string(),
    equipment: v.array(v.string()),
    bgMusicLink: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  returns: v.object({
    _id: v.id("openMicSignups"),
    nightTitle: v.string(),
    nightStartAt: v.number(),
  }),
  handler: async (ctx, args) => {
    if (args.website?.trim()) {
      throw new Error("Unable to submit sign-up.");
    }
    const name = args.name.trim();
    const email = args.email.trim().toLowerCase();
    const whatTheyreDoing = args.whatTheyreDoing.trim();
    if (!name) throw new Error("Name is required.");
    if (!isStanfordEmail(email)) {
      throw new Error("Please use a valid Stanford email address.");
    }
    if (!whatTheyreDoing) {
      throw new Error("Tell us what you'll be doing.");
    }

    const validEquipment = new Set<string>(OPEN_MIC_EQUIPMENT_OPTIONS);
    const equipment = Array.from(new Set(args.equipment.map((item) => item.trim()))).filter((item) =>
      validEquipment.has(item),
    );

    const needsBgMusic = equipment.includes("Background Music");
    const bgMusicLink = args.bgMusicLink?.trim();
    if (needsBgMusic) {
      if (!bgMusicLink) {
        throw new Error("Add a background music link when selecting Background Music.");
      }
      if (!isUrl(bgMusicLink)) {
        throw new Error("Background music link must be a valid http(s) URL.");
      }
    }

    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("This event no longer exists.");
    if (!event.openMicEnabled) {
      throw new Error("Open Mic sign-ups aren't open for this event.");
    }
    if (event.openMicStatus !== "scheduled" && event.openMicStatus !== "live") {
      throw new Error("Sign-ups are closed for this Open Mic.");
    }
    const now = Date.now();
    if (event.startAt < now - ACTIVE_EVENT_WINDOW_MS) {
      throw new Error("Sign-ups are closed for this Open Mic.");
    }

    await enforceRateLimit(ctx, `openMicSubmit:${email}`, { limit: 5, windowMs: HOUR_MS });
    await enforceRateLimit(ctx, "openMicSubmit:global", { limit: 60, windowMs: HOUR_MS });

    const id = await ctx.db.insert("openMicSignups", {
      eventId: event._id,
      name,
      email,
      whatTheyreDoing,
      equipment,
      bgMusicLink: needsBgMusic ? bgMusicLink : undefined,
      notes: args.notes?.trim() || undefined,
      status: "queued",
      skipsCount: 0,
      position: now,
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return { _id: id, nightTitle: event.title, nightStartAt: event.startAt };
  },
});

/* ------------------------------------------------------------------ */
/* Admin queries                                                      */
/* ------------------------------------------------------------------ */

const adminEventSummaryValue = v.object({
  _id: v.id("events"),
  title: v.string(),
  startAt: v.number(),
  endAt: v.optional(v.number()),
  status: openMicStatusValue,
  notes: v.optional(v.string()),
  /** Underlying event lifecycle status, surfaced for the inbox UI. */
  eventStatus: v.string(),
  /** Whether the runner is currently inside the [start-1h, end+1h] bookable window. */
  runnerWindowOpen: v.boolean(),
  runnerOpensAt: v.number(),
  runnerClosesAt: v.number(),
  queuedCount: v.number(),
  performedCount: v.number(),
  hasCurrent: v.boolean(),
});

/** Admin inbox: Arbor Live events with the Open Mic add-on enabled. */
export const listEvents = query({
  args: {},
  returns: v.array(adminEventSummaryValue),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const events = await ctx.db
      .query("events")
      .withIndex("by_openMicEnabled_and_startAt", (q) => q.eq("openMicEnabled", true))
      .order("desc")
      .take(100);

    const summaries: Array<{
      _id: Id<"events">;
      title: string;
      startAt: number;
      endAt?: number;
      status: "scheduled" | "live" | "completed" | "cancelled";
      notes?: string;
      eventStatus: string;
      runnerWindowOpen: boolean;
      runnerOpensAt: number;
      runnerClosesAt: number;
      queuedCount: number;
      performedCount: number;
      hasCurrent: boolean;
    }> = [];
    const now = Date.now();
    for (const event of events) {
      const window = runnerWindowFor(event.startAt, event.endAt);
      const queued = await ctx.db
        .query("openMicSignups")
        .withIndex("by_eventId_and_status", (q) => q.eq("eventId", event._id).eq("status", "queued"))
        .take(500);
      const current = await ctx.db
        .query("openMicSignups")
        .withIndex("by_eventId_and_status", (q) => q.eq("eventId", event._id).eq("status", "current"))
        .take(1);
      const performed = await ctx.db
        .query("openMicSignups")
        .withIndex("by_eventId_and_status", (q) =>
          q.eq("eventId", event._id).eq("status", "performed"),
        )
        .take(500);
      summaries.push({
        _id: event._id,
        title: event.title,
        startAt: event.startAt,
        endAt: event.endAt,
        status: event.openMicStatus ?? "scheduled",
        notes: event.openMicNotes,
        eventStatus: event.status,
        runnerWindowOpen: runnerWindowOpenAt(event.startAt, event.endAt, now),
        runnerOpensAt: window.opensAt,
        runnerClosesAt: window.closesAt,
        queuedCount: queued.length,
        performedCount: performed.length,
        hasCurrent: current.length > 0,
      });
    }
    return summaries;
  },
});

const runnerSignupValue = v.object({
  _id: v.id("openMicSignups"),
  status: signupStatusValue,
  position: v.number(),
  skipsCount: v.number(),
  name: v.string(),
  email: v.string(),
  whatTheyreDoing: v.string(),
  equipment: v.array(v.string()),
  bgMusicLink: v.optional(v.string()),
  notes: v.optional(v.string()),
  performedAt: v.optional(v.number()),
  submittedAt: v.number(),
});

const runnerEventValue = v.object({
  _id: v.id("events"),
  title: v.string(),
  startAt: v.number(),
  endAt: v.optional(v.number()),
  status: openMicStatusValue,
  notes: v.optional(v.string()),
  /** Whether the runner (call-up + queue actions) is currently open, based on
   *  event start/end ± 1h. Derived server-side so the UI doesn't need to
   *  compute it and the gating also lives on the mutations. */
  runnerWindowOpen: v.boolean(),
  runnerOpensAt: v.number(),
  runnerClosesAt: v.number(),
});

export const getRunnerState = query({
  args: { eventId: v.id("events") },
  returns: v.union(
    v.null(),
    v.object({
      event: runnerEventValue,
      signups: v.array(runnerSignupValue),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event || !event.openMicEnabled) return null;
    const now = Date.now();
    const window = runnerWindowFor(event.startAt, event.endAt);
    const signups = await ctx.db
      .query("openMicSignups")
      .withIndex("by_eventId_and_position", (q) => q.eq("eventId", event._id))
      .order("asc")
      .take(500);
    return {
      event: {
        _id: event._id,
        title: event.title,
        startAt: event.startAt,
        endAt: event.endAt,
        status: event.openMicStatus ?? "scheduled",
        notes: event.openMicNotes,
        runnerWindowOpen: runnerWindowOpenAt(event.startAt, event.endAt, now),
        runnerOpensAt: window.opensAt,
        runnerClosesAt: window.closesAt,
      },
      signups: signups.map((signup) => ({
        _id: signup._id,
        status: signup.status,
        position: signup.position,
        skipsCount: signup.skipsCount,
        name: signup.name,
        email: signup.email,
        whatTheyreDoing: signup.whatTheyreDoing,
        equipment: signup.equipment,
        bgMusicLink: signup.bgMusicLink,
        notes: signup.notes,
        performedAt: signup.performedAt,
        submittedAt: signup.submittedAt,
      })),
    };
  },
});

const leaderboardEntryValue = v.object({
  email: v.string(),
  name: v.string(),
  count: v.number(),
  lastPerformedAt: v.number(),
});

export const getLeaderboard = query({
  args: {},
  returns: v.array(leaderboardEntryValue),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const performed = await ctx.db
      .query("openMicSignups")
      .withIndex("by_status_and_performedAt", (q) => q.eq("status", "performed"))
      .order("desc")
      .take(2000);

    const byEmail = new Map<string, { email: string; name: string; count: number; lastPerformedAt: number }>();
    for (const signup of performed) {
      const existing = byEmail.get(signup.email);
      if (existing) {
        existing.count += 1;
        if (signup.performedAt && signup.performedAt > existing.lastPerformedAt) {
          existing.lastPerformedAt = signup.performedAt;
          existing.name = signup.name;
        }
      } else {
        byEmail.set(signup.email, {
          email: signup.email,
          name: signup.name,
          count: 1,
          lastPerformedAt: signup.performedAt ?? signup.updatedAt,
        });
      }
    }
    return Array.from(byEmail.values())
      .sort((a, b) => b.count - a.count || b.lastPerformedAt - a.lastPerformedAt)
      .slice(0, 50);
  },
});

/* ------------------------------------------------------------------ */
/* Admin event Open Mic add-on control                                */
/* ------------------------------------------------------------------ */

/** Toggle the runner operational state for an event's Open Mic add-on.
 *  The Open Mic enabled flag itself is managed via `events.update`. */
export const setOpenMicStatus = mutation({
  args: {
    eventId: v.id("events"),
    status: openMicStatusValue,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    if (!event.openMicEnabled) {
      throw new Error("Enable the Open Mic add-on on this event first.");
    }
    const now = Date.now();
    // Going live starts the runner. Forbid it outside the bookable window so a
    // stray click can't open the queue an hour ahead or bring a closed night
    // back to life. Completing/cancelling is allowed any time.
    if (args.status === "live" && !runnerWindowOpenAt(event.startAt, event.endAt, now)) {
      const window = runnerWindowFor(event.startAt, event.endAt);
      if (now < window.opensAt) {
        throw new Error(
          `Runner doesn't open until ${new Date(window.opensAt).toLocaleString()} (1h before event start).`,
        );
      }
      throw new Error(
        `Runner closed at ${new Date(window.closesAt).toLocaleString()} (1h after event end).`,
      );
    }
    await ctx.db.patch(args.eventId, { openMicStatus: args.status, updatedAt: now });
    return null;
  },
});

/* ------------------------------------------------------------------ */
/* Admin runner actions                                               */
/* ------------------------------------------------------------------ */

async function firstQueued(ctx: MutationCtx, eventId: Id<"events">) {
  const rows = await ctx.db
    .query("openMicSignups")
    .withIndex("by_eventId_and_status", (q) => q.eq("eventId", eventId).eq("status", "queued"))
    .order("asc")
    .take(1);
  return rows[0] ?? null;
}

export const advanceCurrent = mutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event || !event.openMicEnabled) {
      throw new Error("Open Mic isn't enabled on this event.");
    }
    const now = Date.now();
    if (!runnerWindowOpenAt(event.startAt, event.endAt, now)) {
      throw new Error("Runner window is closed (open 1h before start to 1h after end).");
    }
    const currentRows = await ctx.db
      .query("openMicSignups")
      .withIndex("by_eventId_and_status", (q) =>
        q.eq("eventId", args.eventId).eq("status", "current"),
      )
      .take(1);
    const current = currentRows[0];
    if (current) {
      await ctx.db.patch(current._id, {
        status: "performed",
        performedAt: now,
        updatedAt: now,
      });
    }
    const next = await firstQueued(ctx, args.eventId);
    if (next) {
      await ctx.db.patch(next._id, {
        status: "current",
        skipsCount: 0,
        updatedAt: now,
      });
    }
    return null;
  },
});

export const markNotHere = mutation({
  args: { signupId: v.id("openMicSignups") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const signup = await ctx.db.get(args.signupId);
    if (!signup) throw new Error("Sign-up not found.");
    if (signup.status !== "current") {
      throw new Error("Only the current performer can be marked as not here.");
    }
    const event = await ctx.db.get(signup.eventId);
    if (!event || !event.openMicEnabled) {
      throw new Error("Open Mic isn't enabled on this event.");
    }
    const now = Date.now();
    if (!runnerWindowOpenAt(event.startAt, event.endAt, now)) {
      throw new Error("Runner window is closed (open 1h before start to 1h after end).");
    }
    const eventId = signup.eventId;
    let bumpedToFront = false;

    if (signup.skipsCount >= 2) {
      // 3rd strike: remove them entirely.
      await ctx.db.patch(signup._id, { status: "removed", updatedAt: now });
    } else {
      const nextSkips = signup.skipsCount + 1;
      if (nextSkips === 1) {
        // 1st strike: keep them reachable by placing them at the front of the
        // remaining queue, but the runner should call up someone else next.
        const front = await firstQueued(ctx, eventId);
        const frontPosition = front ? front.position : now;
        await ctx.db.patch(signup._id, {
          status: "queued",
          skipsCount: nextSkips,
          position: frontPosition - 1,
          updatedAt: now,
        });
        bumpedToFront = true;
      } else {
        // 2nd strike: send to the back of the queue.
        const lastRows = await ctx.db
          .query("openMicSignups")
          .withIndex("by_eventId_and_position", (q) => q.eq("eventId", eventId))
          .order("desc")
          .take(1);
        const lastPosition = lastRows[0]?.position ?? now;
        await ctx.db.patch(signup._id, {
          status: "queued",
          skipsCount: nextSkips,
          position: lastPosition + 1,
          updatedAt: now,
        });
      }
    }

    // Promote the next queued sign-up to current. When we just bumped the
    // skipper to the front of the queue, skip past them so the runner calls up
    // a different performer ("shift to the next"); the skipper stays queued
    // and will be re-tried on a later rotation.
    let next: Doc<"openMicSignups"> | null = await firstQueued(ctx, eventId);
    if (next && bumpedToFront && next._id === signup._id) {
      const rows = await ctx.db
        .query("openMicSignups")
        .withIndex("by_eventId_and_status", (q) =>
          q.eq("eventId", eventId).eq("status", "queued"),
        )
        .order("asc")
        .take(2);
      next = rows.find((row) => row._id !== signup._id) ?? null;
    }
    if (next) {
      await ctx.db.patch(next._id, {
        status: "current",
        skipsCount: 0,
        updatedAt: now,
      });
    }
    return null;
  },
});

export const removeSignup = mutation({
  args: { signupId: v.id("openMicSignups") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const signup = await ctx.db.get(args.signupId);
    if (!signup) return null;
    const wasCurrent = signup.status === "current";
    const now = Date.now();
    await ctx.db.delete(signup._id);
    if (wasCurrent) {
      const next = await firstQueued(ctx, signup.eventId);
      if (next) {
        await ctx.db.patch(next._id, {
          status: "current",
          skipsCount: 0,
          updatedAt: now,
        });
      }
    }
    return null;
  },
});