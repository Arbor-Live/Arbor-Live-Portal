import { customAlphabet } from "nanoid";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { SITE_URL } from "./email/constants";
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

    if (!Number.isInteger(args.rating) || args.rating < 1 || args.rating > 5) {
      throw new Error("Please provide a rating between 1 and 5.");
    }
    const whatWentWell = args.whatWentWell.trim();
    const whatCouldImprove = args.whatCouldImprove.trim();
    if (!whatWentWell) throw new Error("Please tell us what went well.");
    if (!whatCouldImprove) throw new Error("Please tell us what could have gone better.");

    await ctx.db.patch(row._id, {
      rating: args.rating,
      whatWentWell,
      whatCouldImprove,
      submittedAt: Date.now(),
    });

    return { ok: true as const };
  },
});
