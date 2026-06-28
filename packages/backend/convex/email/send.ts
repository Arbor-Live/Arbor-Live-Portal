"use node";

import { Resend } from "@convex-dev/resend";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { EMAIL_FROM } from "./constants";
import { renderEmailHtml } from "./templates";

export const resendClient = new Resend(components.resend, {
  testMode: process.env.EMAIL_TEST_MODE === "true",
});

export const sendQueuedEmail = internalAction({
  args: { notificationId: v.id("emailNotifications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const notification = await ctx.runQuery(internal.email.enqueue.getNotification, {
      notificationId: args.notificationId,
    });
    if (!notification || notification.status !== "queued") return null;

    try {
      const html = await renderEmailHtml(notification.template, notification.payload);
      const resendId = await resendClient.sendEmail(ctx, {
        from: EMAIL_FROM,
        to: notification.to,
        subject: notification.subject,
        html,
      });
      await ctx.runMutation(internal.email.enqueue.markSent, {
        notificationId: args.notificationId,
        resendId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown email send error";
      await ctx.runMutation(internal.email.enqueue.markFailed, {
        notificationId: args.notificationId,
        error: message,
      });
    }

    return null;
  },
});
