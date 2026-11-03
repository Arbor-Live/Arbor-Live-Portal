import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, type MutationCtx } from "../_generated/server";
import {
  type ReminderRun,
  runPaymentProofReminderBatch,
  startReminderRun,
} from "./paymentProofReminderShared";

const modeValue = v.union(v.literal("first"), v.literal("monday"));

/** Runs one batch and schedules the next, so a big week never hits one mutation's limits. */
async function runBatch(ctx: MutationCtx, mode: "first" | "monday", run: ReminderRun) {
  const { enqueuedCount, next } = await runPaymentProofReminderBatch(ctx, mode, run);
  if (next) {
    await ctx.scheduler.runAfter(0, internal.email.paymentProofReminders.continueRun, {
      mode,
      run: next,
    });
  }
  return { enqueuedCount };
}

export const runFirst = internalMutation({
  args: {},
  returns: v.object({ enqueuedCount: v.number() }),
  handler: async (ctx) => runBatch(ctx, "first", startReminderRun()),
});

export const runMonday = internalMutation({
  args: {},
  returns: v.object({ enqueuedCount: v.number() }),
  handler: async (ctx) => runBatch(ctx, "monday", startReminderRun()),
});

export const continueRun = internalMutation({
  args: {
    mode: modeValue,
    run: v.object({
      now: v.number(),
      phase: v.union(v.literal("events"), v.literal("unlinked")),
      cursor: v.union(v.string(), v.null()),
      remindedInvoiceIds: v.array(v.id("invoices")),
    }),
  },
  returns: v.object({ enqueuedCount: v.number() }),
  handler: async (ctx, args) => runBatch(ctx, args.mode, args.run),
});
