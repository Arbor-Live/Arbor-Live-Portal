"use node";

import { Resend as ResendSdk } from "resend";
import { Resend } from "@convex-dev/resend";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { components, internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { renderInvoicePdfBuffer } from "@arbor/invoice-document/pdf";
import { EMAIL_FROM } from "./constants";
import { renderEmailHtml } from "./templates";

export const resendClient = new Resend(components.resend, {
  testMode: process.env.EMAIL_TEST_MODE === "true",
});

function getResendSdk() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }
  return new ResendSdk(apiKey);
}

type BookingQuoteReadyPayload = {
  invoiceId: Id<"invoices">;
  invoiceNumber: string;
};

function formatSendError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unknown email send error";
}

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

      if (notification.template === "booking_quote_ready") {
        const payload = notification.payload as BookingQuoteReadyPayload;
        if (!payload.invoiceId) {
          throw new Error("Quote email payload is missing invoiceId.");
        }

        const document = await ctx.runQuery(internal.email.invoiceEmailData.getInvoiceDocument, {
          invoiceId: payload.invoiceId,
        });
        if (!document) {
          throw new Error("Invoice not found for quote email attachment.");
        }

        const pdfBuffer = await renderInvoicePdfBuffer(document);
        const fileName = `${payload.invoiceNumber}.pdf`;
        const resendSdk = getResendSdk();

        const resendId = await resendClient.sendEmailManually(
          ctx,
          {
            from: EMAIL_FROM,
            to: notification.to,
            cc: notification.cc,
            replyTo: notification.replyTo,
            subject: notification.subject,
          },
          async (emailId) => {
            const result = await resendSdk.emails.send({
              from: EMAIL_FROM,
              to: notification.to,
              cc: notification.cc,
              replyTo: notification.replyTo,
              subject: notification.subject,
              html,
              attachments: [
                {
                  filename: fileName,
                  content: pdfBuffer.toString("base64"),
                },
              ],
              headers: {
                "Idempotency-Key": emailId,
              },
            });
            if (result.error) {
              throw new Error(
                `[Resend] ${result.error.name ?? "send_failed"}: ${result.error.message}`,
              );
            }
            if (!result.data?.id) {
              throw new Error("Resend did not return an email id.");
            }
            return result.data.id;
          },
        );

        await ctx.runMutation(internal.email.enqueue.markSent, {
          notificationId: args.notificationId,
          resendId,
        });
        return null;
      }

      const resendId = await resendClient.sendEmail(ctx, {
        from: EMAIL_FROM,
        to: notification.to,
        cc: notification.cc,
        replyTo: notification.replyTo,
        subject: notification.subject,
        html,
      });
      await ctx.runMutation(internal.email.enqueue.markSent, {
        notificationId: args.notificationId,
        resendId,
      });
    } catch (error) {
      const message = formatSendError(error);
      console.error("Failed to send queued email", {
        notificationId: args.notificationId,
        template: notification.template,
        to: notification.to,
        error: message,
      });
      await ctx.runMutation(internal.email.enqueue.markFailed, {
        notificationId: args.notificationId,
        error: message,
      });
    }

    return null;
  },
});
