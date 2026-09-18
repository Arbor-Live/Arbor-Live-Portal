import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { findAuthUsersByIds, getUserId } from "../lib/auth";
import { resolveParticipationFlags } from "../lib/userParticipation";
import { buildWeeklyDigest } from "../lib/weeklyDigest";
import { SITE_URL, reminderDayKey, subjectForTemplate } from "./constants";
import { enqueueEmail } from "./enqueue";

/**
 * Weekly pending-activity digest: one email per active Arbor user summarizing
 * the availability responses, events, timecards, photos, booking requests, and
 * artist payouts that need them. Opt out per person with the `weeklyDigest`
 * Participation flag; sections with nothing pending are omitted, and a user
 * with no pending items gets no email.
 */
export const run = internalMutation({
  args: {},
  returns: v.object({ scheduledCount: v.number() }),
  handler: async (ctx) => {
    const profiles = await ctx.db
      .query("userAdminProfiles")
      .withIndex("by_active", (q) => q.eq("active", true))
      .take(2000);

    let scheduledCount = 0;
    for (const profile of profiles) {
      if (!resolveParticipationFlags(profile).weeklyDigest) continue;
      if (!profile.userId.trim()) continue;
      await ctx.scheduler.runAfter(0, internal.email.weeklyDigest.sendForUser, {
        userId: profile.userId,
      });
      scheduledCount += 1;
    }

    return { scheduledCount };
  },
});

export const sendForUser = internalMutation({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const profile = await ctx.db
      .query("userAdminProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (!profile || !profile.active) return null;
    if (!resolveParticipationFlags(profile).weeklyDigest) return null;

    const userByKey = await findAuthUsersByIds(ctx, [args.userId]);
    const user = userByKey.get(args.userId);
    if (!user) return null;
    const email = user.email?.trim().toLowerCase();
    if (!email) return null;

    const digest = await buildWeeklyDigest(ctx, {
      userId: args.userId,
      profile,
      isAdmin: user.role === "admin",
      now,
    });
    if (digest.sections.length === 0) return null;

    const dayKey = reminderDayKey(now);
    await enqueueEmail(ctx, {
      template: "weekly_digest",
      to: email,
      subject: subjectForTemplate("weekly_digest", `${digest.itemCount} to do`),
      idempotencyKey: `weekly_digest:${getUserId(user)}:${dayKey}`,
      payload: {
        recipientName: user.name ?? undefined,
        sections: digest.sections,
        dashboardUrl: `${SITE_URL}/dashboard`,
      },
    });

    return null;
  },
});
