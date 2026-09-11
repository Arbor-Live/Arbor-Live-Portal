import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { resolveBandName } from "../lib/bandIdentity";
import { isBandOrgOnboardingComplete } from "../lib/bandPayments";
import {
  EVENT_TIMEZONE,
  formatEventDateRange,
  onboardingUrl,
  subjectForTemplate,
} from "./constants";
import { enqueueEmail } from "./enqueue";

/** Align with crew onboarding: weekly cron + ~6 day cooldown. */
const REMINDER_COOLDOWN_MS = 6 * 24 * 60 * 60 * 1000;

async function pickReminderEventForOrg(ctx: MutationCtx, organizationId: string) {
  const participations = await ctx.db
    .query("eventBandParticipations")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .take(50);
  if (participations.length === 0) return null;

  let best: {
    eventId: Id<"events">;
    title: string;
    venueName?: string;
    startAt: number;
    endAt: number;
    timezone?: string;
  } | null = null;

  for (const row of participations) {
    const event = await ctx.db.get(row.eventId);
    if (!event || event.status === "cancelled") continue;
    if (!best || event.startAt > best.startAt) {
      best = {
        eventId: event._id,
        title: event.title,
        venueName: event.venueName,
        startAt: event.startAt,
        endAt: event.endAt,
        timezone: event.timezone,
      };
    }
  }
  return best;
}

async function enqueueBandOnboardingRemindersForOrg(
  ctx: MutationCtx,
  args: {
    organizationId: string;
    force?: boolean;
    nowMs: number;
  },
) {
  const onboarding = await ctx.db
    .query("organizationOnboarding")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
    .unique();
  if (!onboarding || isBandOrgOnboardingComplete(onboarding.status)) {
    return { enqueuedCount: 0, skipped: "onboarding_complete" as const };
  }
  if (
    !args.force &&
    onboarding.lastReminderSentAt &&
    args.nowMs - onboarding.lastReminderSentAt < REMINDER_COOLDOWN_MS
  ) {
    return { enqueuedCount: 0, skipped: "cooldown" as const };
  }

  const event = await pickReminderEventForOrg(ctx, args.organizationId);
  if (!event) {
    return { enqueuedCount: 0, skipped: "no_assignment" as const };
  }

  const recipients = await ctx.runQuery(internal.bandPayments.listBandOrgNotificationEmails, {
    organizationId: args.organizationId,
  });
  const profile = await ctx.db
    .query("organizationProfiles")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
    .unique();
  const contactEmail = profile?.mainContactEmail?.trim().toLowerCase();
  const emails = new Map<string, string>();
  for (const row of recipients) {
    const email = row.email.trim().toLowerCase();
    if (email) emails.set(email, row.name);
  }
  if (contactEmail && !emails.has(contactEmail)) {
    emails.set(contactEmail, profile?.mainContactName?.trim() || contactEmail);
  }
  if (emails.size === 0) {
    return { enqueuedCount: 0, skipped: "no_recipients" as const };
  }

  const bandName = await resolveBandName(ctx, args.organizationId);
  const dateRangeLabel = formatEventDateRange(
    event.startAt,
    event.endAt,
    event.timezone || EVENT_TIMEZONE,
  );
  const bandOnboardingUrl = onboardingUrl("/onboarding/band");
  const dayKey = new Date(args.nowMs).toISOString().slice(0, 10);
  let enqueuedCount = 0;

  for (const [email, name] of emails) {
    await enqueueEmail(ctx, {
      template: "band_onboarding_reminder",
      to: email,
      subject: subjectForTemplate("band_onboarding_reminder", event.title),
      eventId: event.eventId,
      idempotencyKey: `band_onboarding_reminder:${args.organizationId}:${email}:${dayKey}`,
      payload: {
        recipientName: name?.split(" ")[0] ?? name,
        bandName,
        eventTitle: event.title,
        venueName: event.venueName,
        dateRangeLabel,
        onboardingUrl: bandOnboardingUrl,
      },
    });
    enqueuedCount += 1;
  }

  await ctx.db.patch(onboarding._id, {
    lastReminderSentAt: args.nowMs,
    updatedAt: args.nowMs,
  });

  return { enqueuedCount, skipped: null };
}

/**
 * Remind assigned bands that still need onboarding before payout.
 * Triggered from the Monday `weeklyJobs.run` cron (not a separate job).
 */
export const remindIncompleteAssignedBands = internalMutation({
  args: {},
  returns: v.object({ enqueuedCount: v.number(), orgsReminded: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const incomplete = await ctx.db
      .query("organizationOnboarding")
      .withIndex("by_status", (q) => q.eq("status", "not_started"))
      .take(500);
    const inProgress = await ctx.db
      .query("organizationOnboarding")
      .withIndex("by_status", (q) => q.eq("status", "in_progress"))
      .take(500);

    let enqueuedCount = 0;
    let orgsReminded = 0;
    for (const row of [...incomplete, ...inProgress]) {
      const result = await enqueueBandOnboardingRemindersForOrg(ctx, {
        organizationId: row.organizationId,
        nowMs: now,
      });
      if (result.enqueuedCount > 0) {
        enqueuedCount += result.enqueuedCount;
        orgsReminded += 1;
      }
    }
    return { enqueuedCount, orgsReminded };
  },
});

export const sendOnboardingReminderForOrgInternal = internalMutation({
  args: {
    organizationId: v.string(),
    force: v.optional(v.boolean()),
  },
  returns: v.object({
    enqueuedCount: v.number(),
    skipped: v.union(
      v.null(),
      v.literal("onboarding_complete"),
      v.literal("cooldown"),
      v.literal("no_assignment"),
      v.literal("no_recipients"),
    ),
  }),
  handler: async (ctx, args) => {
    return await enqueueBandOnboardingRemindersForOrg(ctx, {
      organizationId: args.organizationId,
      force: args.force,
      nowMs: Date.now(),
    });
  },
});
