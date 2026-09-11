"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { HOUR_MS } from "./rateLimit";

const portalValue = v.union(v.literal("request"), v.literal("quote"));

/**
 * Ensure the Immich event album for a booking-request / quote feedback portal
 * token (best-effort). Idempotent; safe to call when the status query has no
 * share URL yet. The status query will pick up the link once written.
 */
export const ensureAlbumShareUrlByToken = action({
  args: {
    portal: portalValue,
    token: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      albumShareUrl: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args): Promise<{ albumShareUrl?: string } | null> => {
    await ctx.runMutation(internal.rateLimit.enforce, {
      key: `eventFeedbackAlbum:${args.portal}:${args.token}`,
      limit: 30,
      windowMs: HOUR_MS,
    });

    const target: { eventId: Id<"events"> } | null = await ctx.runQuery(
      internal.eventFeedback.resolveAlbumEnsureTargetByToken,
      {
        portal: args.portal,
        token: args.token,
      },
    );
    if (!target) return null;

    const ensured: { shareUrl?: string } | null = await ctx.runAction(
      internal.immichActions.ensureEventAlbumBestEffort,
      { eventId: target.eventId },
    );
    return { albumShareUrl: ensured?.shareUrl };
  },
});
