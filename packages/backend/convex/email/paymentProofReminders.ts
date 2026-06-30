import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { runPaymentProofReminders } from "./paymentProofReminderShared";

export const runFirst = internalMutation({
  args: {},
  returns: v.object({ enqueuedCount: v.number() }),
  handler: async (ctx) => runPaymentProofReminders(ctx, "first"),
});

export const runMonday = internalMutation({
  args: {},
  returns: v.object({ enqueuedCount: v.number() }),
  handler: async (ctx) => runPaymentProofReminders(ctx, "monday"),
});
