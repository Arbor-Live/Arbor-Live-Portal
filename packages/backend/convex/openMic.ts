import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdmin } from "./lib/auth";
import { enforceRateLimit, HOUR_MS } from "./rateLimit";

export const OPEN_MIC_EQUIPMENT_OPTIONS = [
  "Piano",
  "Headphone Jack",
  "Background Music",
  '3/4" Cable',
  "Music Stand",
] as const;

export type OpenMicEquipment = (typeof OPEN_MIC_EQUIPMENT_OPTIONS)[number];

const nightStatusValue = v.union(
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

const publicNightValue = v.object({
  _id: v.id("openMicNights"),
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

/** Sign-ups stay open for a night up to 4 hours after its listed start. */
const ACTIVE_NIGHT_WINDOW_MS = 4 * HOUR_MS;

/* ------------------------------------------------------------------ */
/* Public queries                                                     */
/* ------------------------------------------------------------------ */

export const getActiveNight = query({
  args: {},
  returns: v.union(v.null(), publicNightValue),
  handler: async (ctx) => {
    const now = Date.now();
    const since = now - ACTIVE_NIGHT_WINDOW_MS;
    const nights = await ctx.db
      .query("openMicNights")
      .withIndex("by_startAt", (q) => q.gte("startAt", since))
      .take(100);
    const candidate = nights
      .filter((night) => night.status === "scheduled" || night.status === "live")
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
    nightId: v.id("openMicNights"),
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

    const night = await ctx.db.get(args.nightId);
    if (!night) throw new Error("This open mic night no longer exists.");
    if (night.status !== "scheduled" && night.status !== "live") {
      throw new Error("Sign-ups are closed for this open mic night.");
    }
    const now = Date.now();
    if (night.startAt < now - ACTIVE_NIGHT_WINDOW_MS) {
      throw new Error("Sign-ups are closed for this open mic night.");
    }

    await enforceRateLimit(ctx, `openMicSubmit:${email}`, { limit: 5, windowMs: HOUR_MS });
    await enforceRateLimit(ctx, "openMicSubmit:global", { limit: 60, windowMs: HOUR_MS });

    const id = await ctx.db.insert("openMicSignups", {
      nightId: night._id,
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

    return { _id: id, nightTitle: night.title, nightStartAt: night.startAt };
  },
});

/* ------------------------------------------------------------------ */
/* Admin queries                                                      */
/* ------------------------------------------------------------------ */

const adminNightSummaryValue = v.object({
  _id: v.id("openMicNights"),
  title: v.string(),
  startAt: v.number(),
  endAt: v.optional(v.number()),
  status: nightStatusValue,
  notes: v.optional(v.string()),
  queuedCount: v.number(),
  performedCount: v.number(),
  hasCurrent: v.boolean(),
});

export const listNights = query({
  args: {},
  returns: v.array(adminNightSummaryValue),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const nights = await ctx.db
      .query("openMicNights")
      .withIndex("by_startAt", (q) => q.gte("startAt", 0))
      .order("desc")
      .take(100);

    const summaries: Array<{
      _id: Id<"openMicNights">;
      title: string;
      startAt: number;
      endAt?: number;
      status: "scheduled" | "live" | "completed" | "cancelled";
      notes?: string;
      queuedCount: number;
      performedCount: number;
      hasCurrent: boolean;
    }> = [];
    for (const night of nights) {
      const queued = await ctx.db
        .query("openMicSignups")
        .withIndex("by_nightId_and_status", (q) => q.eq("nightId", night._id).eq("status", "queued"))
        .take(500);
      const current = await ctx.db
        .query("openMicSignups")
        .withIndex("by_nightId_and_status", (q) => q.eq("nightId", night._id).eq("status", "current"))
        .take(1);
      const performed = await ctx.db
        .query("openMicSignups")
        .withIndex("by_nightId_and_status", (q) => q.eq("nightId", night._id).eq("status", "performed"))
        .take(500);
      summaries.push({
        _id: night._id,
        title: night.title,
        startAt: night.startAt,
        endAt: night.endAt,
        status: night.status,
        notes: night.notes,
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

const runnerNightValue = v.object({
  _id: v.id("openMicNights"),
  title: v.string(),
  startAt: v.number(),
  endAt: v.optional(v.number()),
  status: nightStatusValue,
  notes: v.optional(v.string()),
});

export const getRunnerState = query({
  args: { nightId: v.id("openMicNights") },
  returns: v.union(
    v.null(),
    v.object({
      night: runnerNightValue,
      signups: v.array(runnerSignupValue),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const night = await ctx.db.get(args.nightId);
    if (!night) return null;
    const signups = await ctx.db
      .query("openMicSignups")
      .withIndex("by_nightId_and_position", (q) => q.eq("nightId", night._id))
      .order("asc")
      .take(500);
    return {
      night: {
        _id: night._id,
        title: night.title,
        startAt: night.startAt,
        endAt: night.endAt,
        status: night.status,
        notes: night.notes,
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
/* Admin night CRUD                                                   */
/* ------------------------------------------------------------------ */

export const createNight = mutation({
  args: {
    title: v.string(),
    startAt: v.number(),
    endAt: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  returns: v.id("openMicNights"),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const title = args.title.trim();
    if (!title) throw new Error("Title is required.");
    if (!args.endAt || args.endAt <= args.startAt) {
      throw new Error("End time must be after start time.");
    }
    const now = Date.now();
    return await ctx.db.insert("openMicNights", {
      title,
      startAt: args.startAt,
      endAt: args.endAt,
      status: "scheduled",
      notes: args.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateNight = mutation({
  args: {
    nightId: v.id("openMicNights"),
    title: v.optional(v.string()),
    startAt: v.optional(v.number()),
    endAt: v.optional(v.number()),
    status: v.optional(nightStatusValue),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const night = await ctx.db.get(args.nightId);
    if (!night) throw new Error("Open mic night not found.");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) {
      const title = args.title.trim();
      if (!title) throw new Error("Title cannot be empty.");
      patch.title = title;
    }
    if (args.startAt !== undefined) patch.startAt = args.startAt;
    if (args.endAt !== undefined) patch.endAt = args.endAt;
    if (args.status !== undefined) patch.status = args.status;
    if (args.notes !== undefined) patch.notes = args.notes.trim() || undefined;
    const startAt = (patch.startAt as number | undefined) ?? night.startAt;
    const endAt = (patch.endAt as number | undefined) ?? night.endAt;
    if (endAt !== undefined && endAt <= startAt) {
      throw new Error("End time must be after start time.");
    }
    await ctx.db.patch(night._id, patch);
    return null;
  },
});

export const deleteNight = mutation({
  args: { nightId: v.id("openMicNights") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const signups = await ctx.db
      .query("openMicSignups")
      .withIndex("by_nightId_and_position", (q) => q.eq("nightId", args.nightId))
      .take(500);
    for (const signup of signups) {
      await ctx.db.delete(signup._id);
    }
    await ctx.db.delete(args.nightId);
    return null;
  },
});

/* ------------------------------------------------------------------ */
/* Admin runner actions                                               */
/* ------------------------------------------------------------------ */

async function firstQueued(ctx: MutationCtx, nightId: Id<"openMicNights">) {
  const rows = await ctx.db
    .query("openMicSignups")
    .withIndex("by_nightId_and_status", (q) => q.eq("nightId", nightId).eq("status", "queued"))
    .order("asc")
    .take(1);
  return rows[0] ?? null;
}

export const advanceCurrent = mutation({
  args: { nightId: v.id("openMicNights") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const currentRows = await ctx.db
      .query("openMicSignups")
      .withIndex("by_nightId_and_status", (q) => q.eq("nightId", args.nightId).eq("status", "current"))
      .take(1);
    const current = currentRows[0];
    if (current) {
      await ctx.db.patch(current._id, {
        status: "performed",
        performedAt: now,
        updatedAt: now,
      });
    }
    const next = await firstQueued(ctx, args.nightId);
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
    const now = Date.now();
    const nightId = signup.nightId;
    let bumpedToFront = false;

    if (signup.skipsCount >= 2) {
      // 3rd strike: remove them entirely.
      await ctx.db.patch(signup._id, { status: "removed", updatedAt: now });
    } else {
      const nextSkips = signup.skipsCount + 1;
      if (nextSkips === 1) {
        // 1st strike: keep them reachable by placing them at the front of the
        // remaining queue, but the runner should call up someone else next.
        const front = await firstQueued(ctx, nightId);
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
          .withIndex("by_nightId_and_position", (q) => q.eq("nightId", nightId))
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
    let next: Doc<"openMicSignups"> | null = await firstQueued(ctx, nightId);
    if (next && bumpedToFront && next._id === signup._id) {
      const rows = await ctx.db
        .query("openMicSignups")
        .withIndex("by_nightId_and_status", (q) => q.eq("nightId", nightId).eq("status", "queued"))
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
      const next = await firstQueued(ctx, signup.nightId);
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