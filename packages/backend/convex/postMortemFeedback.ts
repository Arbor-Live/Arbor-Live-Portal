import { customAlphabet } from "nanoid";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { SITE_URL } from "./email/constants";
import { findAuthUsersByIds, getUserId, requireAuth } from "./lib/auth";
import { canEditEvent } from "./lib/eventAccess";
import { isAssignedToEvent } from "./lib/myEventActions";
import { enforceRateLimit, HOUR_MS } from "./rateLimit";

const POST_MORTEM_TOKEN_ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const POST_MORTEM_TOKEN_LENGTH = 12;
const postMortemToken = customAlphabet(POST_MORTEM_TOKEN_ALPHABET, POST_MORTEM_TOKEN_LENGTH);

export function postMortemUrl(token: string) {
  return `${SITE_URL}/postmortem/${encodeURIComponent(token)}`;
}

async function allocatePostMortemToken(ctx: MutationCtx) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = `pm_${postMortemToken()}`;
    const existing = await ctx.db
      .query("postMortemFeedback")
      .withIndex("by_token", (q) => q.eq("token", candidate))
      .unique();
    if (!existing) return candidate;
  }
  throw new Error("Unable to allocate a post-mortem form token.");
}

/**
 * Mint (or reuse) the post-mortem feedback row for (event, user). Called when
 * the post-event media email is enqueued so the emailed link stays stable.
 */
export async function ensurePostMortemFeedbackRow(
  ctx: MutationCtx,
  eventId: Id<"events">,
  userId: string,
): Promise<Doc<"postMortemFeedback">> {
  const existing = await ctx.db
    .query("postMortemFeedback")
    .withIndex("by_eventId_and_userId", (q) => q.eq("eventId", eventId).eq("userId", userId))
    .first();
  if (existing) return existing;

  const token = await allocatePostMortemToken(ctx);
  const now = Date.now();
  const id = await ctx.db.insert("postMortemFeedback", {
    eventId,
    userId,
    token,
    createdAt: now,
  });
  const row = await ctx.db.get(id);
  if (!row) throw new Error("Post-mortem feedback row was not created.");
  return row;
}

function validatePostMortemInput(args: {
  rating: number;
  whatWentWell: string;
  whatCouldImprove: string;
}) {
  if (!Number.isInteger(args.rating) || args.rating < 1 || args.rating > 5) {
    throw new Error("Please provide a rating between 1 and 5.");
  }
  const whatWentWell = args.whatWentWell.trim();
  const whatCouldImprove = args.whatCouldImprove.trim();
  if (!whatWentWell) throw new Error("Please tell us what went well.");
  if (!whatCouldImprove) throw new Error("Please tell us what could have gone better.");
  return { whatWentWell, whatCouldImprove };
}

/** Post-mortem form availability for the emailed day-of-lead link. */
export const getStatusByToken = query({
  args: { token: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      submitted: v.boolean(),
      eventEnded: v.boolean(),
      eventTitle: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("postMortemFeedback")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!row) return null;
    const event = row.eventId ? await ctx.db.get(row.eventId) : null;
    return {
      submitted: Boolean(row.submittedAt),
      eventEnded: Boolean(event && event.endAt < Date.now()),
      eventTitle: event?.title,
    };
  },
});

/** Submit post-mortem feedback from the emailed day-of-lead link. */
export const submitByToken = mutation({
  args: {
    token: v.string(),
    rating: v.number(),
    whatWentWell: v.string(),
    whatCouldImprove: v.string(),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, `postMortemFeedback:${args.token}`, { limit: 5, windowMs: HOUR_MS });

    const row = await ctx.db
      .query("postMortemFeedback")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!row) throw new Error("This post-mortem form is not available.");
    if (row.submittedAt) throw new Error("You have already submitted this post-mortem.");

    const event = row.eventId ? await ctx.db.get(row.eventId) : null;
    if (!event) throw new Error("This post-mortem form is not available.");
    if (event.endAt >= Date.now()) {
      throw new Error("The post-mortem opens once the event has ended.");
    }

    const { whatWentWell, whatCouldImprove } = validatePostMortemInput(args);

    await ctx.db.patch(row._id, {
      rating: args.rating,
      whatWentWell,
      whatCouldImprove,
      submittedAt: Date.now(),
    });

    return { ok: true as const };
  },
});

/** Whether the signed-in crew member / lead still owes a review for this event. */
export const getMyPostMortemForEvent = query({
  args: { eventId: v.id("events") },
  returns: v.union(
    v.null(),
    v.object({
      eventEnded: v.boolean(),
      submitted: v.boolean(),
      rating: v.optional(v.number()),
      whatWentWell: v.optional(v.string()),
      whatCouldImprove: v.optional(v.string()),
      submittedAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const userId = getUserId(user);
    const event = await ctx.db.get(args.eventId);
    if (!event) return null;
    if (!(await isAssignedToEvent(ctx, args.eventId, userId))) return null;

    const row = await ctx.db
      .query("postMortemFeedback")
      .withIndex("by_eventId_and_userId", (q) =>
        q.eq("eventId", args.eventId).eq("userId", userId),
      )
      .first();

    return {
      eventEnded: event.endAt < Date.now(),
      submitted: Boolean(row?.submittedAt),
      rating: row?.rating,
      whatWentWell: row?.whatWentWell,
      whatCouldImprove: row?.whatCouldImprove,
      submittedAt: row?.submittedAt,
    };
  },
});

/** Submit the in-app post-event review as a signed-in crew member or lead. */
export const submitForEvent = mutation({
  args: {
    eventId: v.id("events"),
    rating: v.number(),
    whatWentWell: v.string(),
    whatCouldImprove: v.string(),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const userId = getUserId(user);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    if (!(await isAssignedToEvent(ctx, args.eventId, userId))) {
      throw new Error("You are not assigned to this event.");
    }
    if (event.endAt >= Date.now()) {
      throw new Error("The post-mortem opens once the event has ended.");
    }
    await enforceRateLimit(ctx, `postMortemFeedback:user:${userId}`, {
      limit: 20,
      windowMs: HOUR_MS,
    });

    const row = await ensurePostMortemFeedbackRow(ctx, event._id, userId);
    if (row.submittedAt) throw new Error("You have already submitted this post-mortem.");

    const { whatWentWell, whatCouldImprove } = validatePostMortemInput(args);

    await ctx.db.patch(row._id, {
      rating: args.rating,
      whatWentWell,
      whatCouldImprove,
      submittedAt: Date.now(),
    });

    return { ok: true as const };
  },
});

const postMortemSummaryEntryValue = v.object({
  id: v.id("postMortemFeedback"),
  personName: v.optional(v.string()),
  role: v.optional(v.string()),
  rating: v.number(),
  whatWentWell: v.string(),
  whatCouldImprove: v.string(),
  submittedAt: v.number(),
});

/**
 * Every review filed for an event (crew + lead), with the rollup. Leads and
 * admins only.
 */
export const getEventPostMortemSummary = query({
  args: { eventId: v.id("events") },
  returns: v.object({
    count: v.number(),
    averageRating: v.union(v.number(), v.null()),
    entries: v.array(postMortemSummaryEntryValue),
  }),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    if (!(await canEditEvent(ctx, event))) {
      throw new Error("You do not have permission to view this event's reviews.");
    }

    const rows = await ctx.db
      .query("postMortemFeedback")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500);
    const submitted = rows.filter(
      (
        row,
      ): row is typeof row & {
        submittedAt: number;
        rating: number;
        whatWentWell: string;
        whatCouldImprove: string;
      } =>
        row.submittedAt != null &&
        row.rating != null &&
        row.whatWentWell != null &&
        row.whatCouldImprove != null,
    );

    const shifts = await ctx.db
      .query("eventCrewShifts")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500);
    const roleByUser = new Map<string, string>();
    for (const shift of shifts) {
      const uid = shift.userId?.trim();
      if (!uid || roleByUser.has(uid)) continue;
      roleByUser.set(uid, shift.role);
    }

    const userByKey = await findAuthUsersByIds(
      ctx,
      submitted.map((row) => row.userId),
    );

    const entries = submitted
      .map((row) => {
        const user = userByKey.get(row.userId);
        const leadRole =
          event.dayOfLeadUserId === row.userId
            ? "Day-of lead"
            : event.eventManagerUserId === row.userId
              ? "Event manager"
              : undefined;
        return {
          id: row._id,
          personName: user?.name ?? user?.email ?? undefined,
          role: roleByUser.get(row.userId) ?? leadRole,
          rating: row.rating,
          whatWentWell: row.whatWentWell,
          whatCouldImprove: row.whatCouldImprove,
          submittedAt: row.submittedAt,
        };
      })
      .sort((a, b) => b.submittedAt - a.submittedAt);

    const sum = entries.reduce((total, entry) => total + entry.rating, 0);
    return {
      count: entries.length,
      averageRating: entries.length > 0 ? sum / entries.length : null,
      entries,
    };
  },
});
