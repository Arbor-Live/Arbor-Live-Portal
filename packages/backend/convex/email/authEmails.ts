import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { enqueueEmail } from "./enqueue";

export const enqueuePasswordReset = internalMutation({
  args: {
    to: v.string(),
    resetUrl: v.string(),
    recipientName: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    await enqueueEmail(ctx, {
      template: "password_reset",
      to: args.to,
      subject: "Reset your Arbor Live password",
      idempotencyKey: `password_reset:${args.to}:${now}`,
      payload: {
        recipientName: args.recipientName,
        resetUrl: args.resetUrl,
      },
    });
    return null;
  },
});
