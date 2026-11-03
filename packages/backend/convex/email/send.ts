"use node";

import { Resend as ResendSdk } from "resend";
import { Resend } from "@convex-dev/resend";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { components, internal } from "../_generated/api";
import { type ActionCtx, internalAction } from "../_generated/server";
import { renderInvoicePdfBuffer } from "@arbor/invoice-document/pdf";
import { buildScheduleIcs } from "@arbor/email/ics";
import type { CalendarInvitePayload, ScheduleIcsEventPayload } from "@arbor/email/types";
import { threadHeaderFields } from "../lib/bookingEmail";
import { extractDisplayName, extractEmailAddress } from "../lib/emailAddresses";
import { EMAIL_FROM, ORGANIZER_EMAIL, PAYMENTS_EMAIL_FROM } from "./constants";
import { renderEmailHtml, renderEmailText } from "./templates";

export const resendClient = new Resend(components.resend, {
  testMode: process.env.EMAIL_TEST_MODE === "true",
});

/**
 * Local e2e only: render + queue, never call Resend (saves quota).
 * Requires E2E_HELPERS + E2E_EMAIL_MOCK and a localhost SITE_URL.
 */
function isE2eEmailMockEnabled() {
  if (process.env.E2E_EMAIL_MOCK !== "true") return false;
  if (process.env.E2E_HELPERS !== "true") return false;
  const siteUrl = process.env.SITE_URL ?? "";
  return siteUrl.includes("localhost") || siteUrl.includes("127.0.0.1");
}

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

const CALENDAR_INVITE_METHODS: Partial<Record<string, "REQUEST" | "CANCEL">> = {
  crew_scheduled: "REQUEST",
  crew_unscheduled: "CANCEL",
  band_scheduled: "REQUEST",
  band_unscheduled: "CANCEL",
};

/** The `.ics` attachment for calendar-invite templates; null for every other template. */
function buildCalendarInvite(notification: { template: string; to: string; payload: unknown }) {
  const method = CALENDAR_INVITE_METHODS[notification.template];
  if (!method) return null;
  // Rows queued before invites went one per email carry a one-item `icsEvents`.
  const payload = notification.payload as Partial<CalendarInvitePayload> & {
    icsEvents?: ScheduleIcsEventPayload[];
    timezone: string;
  };
  const event = payload.icsEvent ?? payload.icsEvents?.[0];
  if (!event) throw new Error("Calendar invite payload is missing its event.");
  const content = buildScheduleIcs({
    timezone: payload.timezone,
    organizerEmail: ORGANIZER_EMAIL,
    attendeeEmail: notification.to,
    method,
    event: {
      uid: event.uid,
      title: event.title,
      description: event.description,
      location: event.location,
      startAt: new Date(event.startAt),
      endAt: new Date(event.endAt),
      sequence: event.sequence,
    },
  });
  return {
    filename: method === "CANCEL" ? "cancel.ics" : "invite.ics",
    content: Buffer.from(content, "utf-8"),
    contentType: `text/calendar; charset=utf-8; method=${method}`,
  };
}

function formatSendError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unknown email send error";
}

type EmailAttachment = {
  filename: string;
  content: string | Buffer;
  contentType?: string;
};

async function sendEmailWithAttachments(
  ctx: Parameters<typeof resendClient.sendEmailManually>[0],
  notification: {
    to: string;
    cc?: string[];
    replyTo?: string[];
    subject: string;
  },
  options: {
    from: string;
    html: string;
    attachments: EmailAttachment[];
    /** Extra headers, such as `In-Reply-To`; the idempotency key is always added. */
    headers?: Record<string, string>;
  },
) {
  const resendSdk = getResendSdk();
  const { from, html, attachments } = options;
  return await resendClient.sendEmailManually(
    ctx,
    {
      from,
      to: notification.to,
      cc: notification.cc,
      replyTo: notification.replyTo,
      subject: notification.subject,
    },
    async (emailId) => {
      const result = await resendSdk.emails.send({
        from,
        to: notification.to,
        cc: notification.cc,
        replyTo: notification.replyTo,
        subject: notification.subject,
        html,
        attachments: attachments.length > 0 ? attachments : undefined,
        headers: {
          ...options.headers,
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
}

async function quoteAttachment(
  ctx: ActionCtx,
  notification: { payload: unknown },
): Promise<EmailAttachment> {
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
  return { filename: `${payload.invoiceNumber}.pdf`, content: pdfBuffer.toString("base64") };
}

/** Quote PDF or calendar invite for the templates that carry one. */
async function buildAttachments(
  ctx: ActionCtx,
  notification: { template: string; to: string; payload: unknown },
): Promise<EmailAttachment[]> {
  if (notification.template === "booking_quote_ready") {
    return [await quoteAttachment(ctx, notification)];
  }
  const calendarInvite = buildCalendarInvite(notification);
  return calendarInvite ? [calendarInvite] : [];
}

/**
 * Store a booking email on its thread. The email already went out, so a failure
 * here is logged rather than marking the notification failed (a retry would
 * send it twice).
 */
async function recordOutbound(
  ctx: ActionCtx,
  notification: {
    _id: Id<"emailNotifications">;
    to: string;
    cc?: string[];
    subject: string;
  } & { emailThreadId: Id<"emailThreads">; from: string },
  sent: {
    resendEmailId: string;
    html: string;
    attachments: EmailAttachment[];
    messageId?: string;
    thread: { inReplyTo?: string; references: string[] };
  },
) {
  try {
    await ctx.runMutation(internal.emailOutbound.recordOutboundEmail, {
      threadId: notification.emailThreadId,
      resendEmailId: sent.resendEmailId,
      messageId: sent.messageId,
      fromEmail: extractEmailAddress(notification.from) ?? notification.from,
      fromName: extractDisplayName(notification.from),
      to: [notification.to],
      cc: notification.cc ?? [],
      subject: notification.subject,
      bodyText: renderEmailText(sent.html),
      attachments: sent.attachments.map(({ filename, contentType }) => ({ filename, contentType })),
      inReplyTo: sent.thread.inReplyTo,
      references: sent.thread.references,
      sentAt: Date.now(),
    });
  } catch (error) {
    console.error("Failed to record outbound email on its thread", {
      notificationId: notification._id,
      error: formatSendError(error),
    });
  }
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
      if (!html?.trim()) {
        throw new Error("Email template rendered empty HTML.");
      }

      const attachments = await buildAttachments(ctx, notification);
      const { emailThreadId } = notification;
      const bookingThread =
        emailThreadId && notification.from
          ? { ...notification, emailThreadId, from: notification.from }
          : null;
      const thread = emailThreadId
        ? await ctx.runQuery(internal.emailOutbound.getThreadHeaders, { threadId: emailThreadId })
        : { references: [] };

      // E2E mock: exercise render (+ attachments) without spending Resend quota.
      if (isE2eEmailMockEnabled()) {
        const resendEmailId = `e2e-mock:${args.notificationId}`;
        await ctx.runMutation(internal.email.enqueue.markSent, {
          notificationId: args.notificationId,
          resendId: resendEmailId,
        });
        if (bookingThread) {
          await recordOutbound(ctx, bookingThread, {
            resendEmailId,
            html,
            attachments,
            messageId: `e2e-mock-${args.notificationId}@arbor.st`,
            thread,
          });
        }
        return null;
      }

      // Booking emails go through the raw SDK too: it returns the Resend id at once and takes headers.
      if (bookingThread || attachments.length > 0) {
        const resendId = await sendEmailWithAttachments(ctx, notification, {
          from: notification.from ?? EMAIL_FROM,
          html,
          attachments,
          headers: threadHeaderFields(thread),
        });

        await ctx.runMutation(internal.email.enqueue.markSent, {
          notificationId: args.notificationId,
          resendId,
        });
        if (bookingThread) {
          await recordOutbound(ctx, bookingThread, { resendEmailId: resendId, html, attachments, thread });
        }
        return null;
      }

      const fromAddress =
        notification.template === "band_payment_confirmation" ||
        notification.template === "band_payment_completed"
          ? PAYMENTS_EMAIL_FROM
          : EMAIL_FROM;

      const resendId = await resendClient.sendEmail(ctx, {
        from: fromAddress,
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
