"use node";

import { Resend } from "resend";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { extractBandPaymentToken } from "../lib/bandPayments";

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }
  return new Resend(apiKey);
}

function getWebhookSecret() {
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("RESEND_INBOUND_WEBHOOK_SECRET is not configured.");
  }
  return secret;
}

function normalizeEmail(value: string | undefined | null) {
  if (!value) return "";
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim().toLowerCase();
}

export const handleInboundEmail = internalAction({
  args: {
    payload: v.string(),
    svixId: v.string(),
    svixTimestamp: v.string(),
    svixSignature: v.string(),
  },
  returns: v.object({
    handled: v.boolean(),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const resend = getResendClient();
    let event: { type?: string; data?: { email_id?: string; subject?: string; from?: string } };
    try {
      event = resend.webhooks.verify({
        payload: args.payload,
        headers: {
          id: args.svixId,
          timestamp: args.svixTimestamp,
          signature: args.svixSignature,
        },
        webhookSecret: getWebhookSecret(),
      }) as typeof event;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid webhook signature";
      throw new Error(message);
    }

    if (event.type !== "email.received") {
      return { handled: false, reason: "ignored_event_type" };
    }

    const emailId = event.data?.email_id;
    if (!emailId) {
      return { handled: false, reason: "missing_email_id" };
    }

    const received = await resend.emails.receiving.get(emailId);
    if (received.error || !received.data) {
      return { handled: false, reason: "email_fetch_failed" };
    }

    const subject = received.data.subject ?? event.data?.subject ?? "";
    const token = extractBandPaymentToken(subject);
    if (!token) {
      return { handled: false, reason: "missing_confirmation_token" };
    }

    const payment = await ctx.runQuery(internal.bandPayments.getByConfirmationToken, {
      confirmationToken: token,
    });
    if (!payment) {
      return { handled: false, reason: "payment_not_found" };
    }

    const replyFrom = normalizeEmail(received.data.from ?? event.data?.from);
    if (replyFrom && payment.designatedPayeeEmail && replyFrom !== payment.designatedPayeeEmail.toLowerCase()) {
      return { handled: false, reason: "unexpected_sender" };
    }

    const replyBody =
      received.data.text ??
      received.data.html ??
      "Confirmation reply received without body.";

    await ctx.runMutation(internal.bandPayments.recordConfirmationReply, {
      paymentId: payment._id,
      replyFrom: replyFrom || payment.designatedPayeeEmail || "",
      replyBody,
      replyEmailId: emailId,
    });

    return { handled: true };
  },
});
