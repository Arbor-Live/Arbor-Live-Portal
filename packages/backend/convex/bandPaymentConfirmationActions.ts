"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

/**
 * Ensure the event Immich album (best-effort), then enqueue the signature email.
 * Immich failures must not block payout signature requests.
 */
export const deliverConfirmationEmail = internalAction({
  args: {
    paymentId: v.id("eventBandPayments"),
    idempotencySentAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const meta = await ctx.runQuery(internal.bandPayments.getConfirmationEmailContext, {
      paymentId: args.paymentId,
    });
    if (!meta) return null;

    await ctx.runAction(internal.immichActions.ensureEventAlbumBestEffort, {
      eventId: meta.eventId,
    });

    await ctx.runMutation(internal.bandPayments.enqueueConfirmationEmailInternal, {
      paymentId: args.paymentId,
      idempotencySentAt: args.idempotencySentAt,
    });
    return null;
  },
});
