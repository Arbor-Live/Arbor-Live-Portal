import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { findAuthUsersByIds, getUserId } from "../lib/auth";
import { resolveParticipationFlags } from "../lib/userParticipation";
import { buildWeeklyDigest } from "../lib/weeklyDigest";
import { SITE_URL, reminderDayKey, subjectForTemplate } from "./constants";
import { enqueueEmail } from "./enqueue";

/** Profiles per scheduled pass; the page continuation covers the rest. */
const WEEKLY_DIGEST_PROFILE_PAGE_SIZE = 200;

/**
 * Weekly pending-activity digest. Arbor staff get availability, shifts,
 * timecards, and post-event work they are actually assigned to; portal admins
 * also get booking and payout queues. Other people's unsubmitted reviews are
 * not included. Artist-only members (bands, DJs, and the other artist org
 * types) get the email only when their org has a
 * show this week or onboarding still open — not crew post-event work, and not
 * the admin queues. Band org admins share Better Auth `role: "admin"` with
 * portal admins; that role alone does not make them a portal admin.
 *
 * Opt out per person with the `weeklyDigest` Participation flag. Sections with
 * nothing pending are omitted, and a user with no pending items gets no email.
 *
 * Pages through active profiles (no fixed cap) and schedules a continuation
 * with the page cursor until every eligible profile has been visited.
 */
export const run = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.object({ scheduledCount: v.number() }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("userAdminProfiles")
      .withIndex("by_active", (q) => q.eq("active", true))
      .paginate({
        cursor: args.cursor ?? null,
        numItems: WEEKLY_DIGEST_PROFILE_PAGE_SIZE,
      });

    let scheduledCount = 0;
    for (const profile of page.page) {
      if (!resolveParticipationFlags(profile).weeklyDigest) continue;
      if (!profile.userId.trim()) continue;
      await ctx.scheduler.runAfter(0, internal.email.weeklyDigest.sendForUser, {
        userId: profile.userId,
      });
      scheduledCount += 1;
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.email.weeklyDigest.run, {
        cursor: page.continueCursor,
      });
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
      authRole: user.role,
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
