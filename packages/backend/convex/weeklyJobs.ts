import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

/**
 * Single Monday cron entrypoint. Fan out each weekly job via the scheduler so
 * one slow path does not block the others.
 */
export const run = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.onboarding.remindIncomplete, {});
    await ctx.scheduler.runAfter(
      0,
      internal.email.bandOnboardingReminders.remindIncompleteAssignedBands,
      {},
    );
    await ctx.scheduler.runAfter(0, internal.email.paymentProofReminders.runMonday, {});
    return null;
  },
});
