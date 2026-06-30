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

export const enqueueEmailVerification = internalMutation({
  args: {
    to: v.string(),
    verificationUrl: v.string(),
    recipientName: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    await enqueueEmail(ctx, {
      template: "email_verification",
      to: args.to,
      subject: "Verify your Arbor Live email",
      idempotencyKey: `email_verification:${args.to}:${now}`,
      payload: {
        recipientName: args.recipientName,
        verificationUrl: args.verificationUrl,
      },
    });
    return null;
  },
});

export const enqueueChangeEmailConfirmation = internalMutation({
  args: {
    to: v.string(),
    newEmail: v.string(),
    confirmUrl: v.string(),
    recipientName: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    await enqueueEmail(ctx, {
      template: "change_email_confirmation",
      to: args.to,
      subject: "Approve your Arbor Live email change",
      idempotencyKey: `change_email_confirmation:${args.to}:${args.newEmail}:${now}`,
      payload: {
        recipientName: args.recipientName,
        newEmail: args.newEmail,
        confirmUrl: args.confirmUrl,
      },
    });
    return null;
  },
});
