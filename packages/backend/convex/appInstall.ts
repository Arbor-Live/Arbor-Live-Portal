import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUserOrNull, getUserId, requireAuth } from "./lib/auth";

/** One nudge per user, ever; reading or installing settles it. */
const INSTALL_NUDGE_KEY = "app_install";

/** Whether the user has ever opened the portal from their Home Screen. */
export const getAppInstallState = query({
  args: {},
  returns: v.object({ installed: v.boolean() }),
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) return { installed: false };
    const row = await ctx.db
      .query("appInstalls")
      .withIndex("by_userId", (q) => q.eq("userId", getUserId(user)))
      .first();
    return { installed: row !== null };
  },
});

/**
 * Called once per app launch with how the portal was opened.
 * - From the Home Screen: remember it and settle the install nudge.
 * - In a phone browser, never installed: leave a one-time nudge in the bell.
 */
export const reportAppLaunch = mutation({
  args: { standalone: v.boolean(), mobile: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = getUserId(await requireAuth(ctx));
    const now = Date.now();
    const installed = await ctx.db
      .query("appInstalls")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    const nudge = await ctx.db
      .query("notifications")
      .withIndex("by_userId_and_dedupeKey", (q) =>
        q.eq("userId", userId).eq("dedupeKey", INSTALL_NUDGE_KEY),
      )
      .first();

    if (args.standalone) {
      if (!installed) {
        await ctx.db.insert("appInstalls", { userId, firstStandaloneAt: now });
      }
      if (nudge && nudge.readAt === undefined) {
        await ctx.db.patch(nudge._id, { readAt: now });
      }
      return null;
    }

    if (!args.mobile || installed || nudge) return null;
    await ctx.db.insert("notifications", {
      userId,
      template: "app_install",
      status: "delivered",
      title: "Add Arbor Live to your Home Screen",
      body: "Get push notifications for schedules, mentions, and requests.",
      dedupeKey: INSTALL_NUDGE_KEY,
      sourceKey: INSTALL_NUDGE_KEY,
      generation: 1,
      createdAt: now,
    });
    return null;
  },
});
