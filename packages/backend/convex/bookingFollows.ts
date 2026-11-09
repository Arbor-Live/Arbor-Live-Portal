import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { getCurrentUserOrNull, getUserId, requireAdminOrOperations } from "./lib/auth";
import { bookingTargetValue, resolveBookingChain, type BookingTarget } from "./lib/bookingChain";
import { listChainFollows } from "./lib/bookingFollowers";
import { appError } from "./lib/errors";

async function assertTargetExists(ctx: MutationCtx, target: BookingTarget) {
  const record =
    target.kind === "request"
      ? await ctx.db.get(target.requestId)
      : target.kind === "invoice"
        ? await ctx.db.get(target.invoiceId)
        : await ctx.db.get(target.eventId);
  if (!record) appError("NOT_FOUND", "That booking no longer exists.");
}

/**
 * Whether the viewer follows anything in the booking `target` belongs to.
 * `null` for anyone who is not staff (or not signed in) so the button can hide
 * instead of erroring.
 */
export const isFollowing = query({
  args: { target: bookingTargetValue },
  returns: v.union(v.boolean(), v.null()),
  handler: async (ctx, args) => {
    if (!(await getCurrentUserOrNull(ctx))) return null;
    let viewer;
    try {
      viewer = await requireAdminOrOperations(ctx);
    } catch {
      return null;
    }
    const chain = await resolveBookingChain(ctx, args.target);
    return (await listChainFollows(ctx, chain, getUserId(viewer))).length > 0;
  },
});

export const follow = mutation({
  args: { target: bookingTargetValue },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = getUserId(await requireAdminOrOperations(ctx));
    await assertTargetExists(ctx, args.target);
    const chain = await resolveBookingChain(ctx, args.target);
    if ((await listChainFollows(ctx, chain, userId)).length > 0) return null;
    await ctx.db.insert("bookingFollows", { ...args.target, userId, createdAt: Date.now() });
    return null;
  },
});

export const unfollow = mutation({
  args: { target: bookingTargetValue },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = getUserId(await requireAdminOrOperations(ctx));
    const chain = await resolveBookingChain(ctx, args.target);
    for (const row of await listChainFollows(ctx, chain, userId)) {
      await ctx.db.delete(row._id);
    }
    return null;
  },
});
