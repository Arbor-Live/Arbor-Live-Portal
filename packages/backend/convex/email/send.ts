"use node";

import { Resend as ResendSdk } from "resend";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { type ActionCtx, internalAction } from "../_generated/server";
import { renderInvoicePdfBuffer } from "@arbor/invoice-document/pdf";
import { buildScheduleIcs } from "@arbor/email/ics";
import type { CalendarInvitePayload, ScheduleIcsEventPayload } from "@arbor/email/types";
import { threadHeaders } from "../lib/bookingEmail";
import { extractDisplayName, extractEmailAddress } from "../lib/emailAddresses";
import { MAX_BODY_CHARS } from "../lib/inboundEmail";
import { EMAIL_FROM, ORGANIZER_EMAIL, PAYMENTS_EMAIL_FROM } from "./constants";
import { isResendTestAddress, resendClient } from "./resendClient";
import { renderEmailHtml, renderEmailText } from "./templates";

/**
 * Raw-SDK sends (attachments) retry a 429, 5xx or network error after these
 * delays while the notification stays queued, then fail. The component path
 * has its own retries; this mirrors them for the one path it can't carry.
 */
const RAW_SEND_RETRY_DELAYS_MS = [30_000, 2 * 60_000, 10 * 60_000];

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

type QuoteAttachmentPayload = {
  invoiceId?: Id<"invoices">;
  invoiceNumber?: string;
  /** Opt-in for templates other than `booking_quote_ready`, which always carries the quote. */
  attachQuote?: boolean;
};

function wantsQuoteAttachment(notification: { template: string; payload: unknown }) {
  if (notification.template === "booking_quote_ready") return true;
  return (notification.payload as QuoteAttachmentPayload | null)?.attachQuote === true;
}

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

/** A failed Resend API call; `retryable` for rate limits, server errors and network failures. */
class ResendSendError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/** Same stable key for every attempt at one notification, so Resend sends it once. */
function notificationIdempotencyKey(notificationId: Id<"emailNotifications">) {
  return `emailNotifications:${notificationId}`;
}

/**
 * `EMAIL_TEST_MODE` for the raw SDK, which the component's check never sees.
 * Throws before anything is sent, like the component does.
 */
function assertTestModeRecipients(recipients: readonly string[]) {
  if (process.env.EMAIL_TEST_MODE !== "true") return;
  const blocked = recipients.filter((recipient) => !isResendTestAddress(recipient));
  if (blocked.length > 0) {
    throw new Error(
      `EMAIL_TEST_MODE is on and these recipients are not Resend test addresses: ${blocked.join(", ")}. Send to delivered@resend.dev (or bounced@ / complained@resend.dev), or unset EMAIL_TEST_MODE to send real mail.`,
    );
  }
}

/**
 * Test mode never mails a real inbox. A real To still fails the send, but a
 * real CC (the booking's standing ones included) is left off instead.
 */
function sendableCc(cc: string[] | undefined) {
  if (process.env.EMAIL_TEST_MODE !== "true" || !cc) return cc;
  const kept = cc.filter((address) => isResendTestAddress(address));
  return kept.length > 0 ? kept : undefined;
}

/**
 * Send through the raw Resend SDK, for emails with attachments the component
 * can't carry. Still tracked as a manual component email. The HTTP
 * `Idempotency-Key` comes from `idempotencyKey`, stable per notification.
 */
async function sendWithResendSdk(
  ctx: ActionCtx,
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
    headers: { name: string; value: string }[];
    idempotencyKey: string;
  },
) {
  assertTestModeRecipients([notification.to, ...(notification.cc ?? [])]);
  const resendSdk = getResendSdk();
  const { from, html, attachments, headers } = options;
  let resendEmailId = "";
  const emailId = await resendClient.sendEmailManually(
    ctx,
    {
      from,
      to: notification.to,
      cc: notification.cc,
      replyTo: notification.replyTo,
      subject: notification.subject,
    },
    async () => {
      const result = await resendSdk.emails.send(
        {
          from,
          to: notification.to,
          cc: notification.cc,
          replyTo: notification.replyTo,
          subject: notification.subject,
          html,
          attachments,
          headers:
            headers.length > 0
              ? Object.fromEntries(headers.map(({ name, value }) => [name, value]))
              : undefined,
        },
        { idempotencyKey: options.idempotencyKey },
      );
      if (result.error) {
        const status = result.error.statusCode;
        throw new ResendSendError(
          `[Resend] ${result.error.name ?? "send_failed"} (HTTP ${status ?? "network"}): ${result.error.message}`,
          status === null || status === 429 || status >= 500,
        );
      }
      if (!result.data?.id) {
        throw new Error("Resend did not return an email id.");
      }
      resendEmailId = result.data.id;
      return resendEmailId;
    },
  );
  // `sendEmailManually` returns the component's id; Resend's own id is what `GET /emails/{id}` takes.
  return { emailId, resendEmailId };
}

async function quoteAttachment(
  ctx: ActionCtx,
  notification: { payload: unknown },
): Promise<EmailAttachment> {
  const payload = notification.payload as QuoteAttachmentPayload;
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
  return { filename: `${payload.invoiceNumber ?? "quote"}.pdf`, content: pdfBuffer.toString("base64") };
}

/** Quote PDF or calendar invite for the emails that carry one. */
async function buildAttachments(
  ctx: ActionCtx,
  notification: { template: string; to: string; payload: unknown },
): Promise<EmailAttachment[]> {
  if (wantsQuoteAttachment(notification)) {
    return [await quoteAttachment(ctx, notification)];
  }
  const calendarInvite = buildCalendarInvite(notification);
  return calendarInvite ? [calendarInvite] : [];
}

type QueuedNotification = {
  _id: Id<"emailNotifications">;
  to: string;
  cc?: string[];
  subject: string;
  booking?: { threadId: Id<"emailThreads">; from: string };
};

/** The outbound row a booking email leaves on its thread; null for every other email. */
function outboundMessage(
  notification: QueuedNotification,
  sent: {
    html: string;
    attachments: EmailAttachment[];
    thread: { inReplyTo?: string; references: string[] };
  },
) {
  const { booking } = notification;
  if (!booking) return null;
  return {
    threadId: booking.threadId,
    fromEmail: extractEmailAddress(booking.from) ?? booking.from,
    fromName: extractDisplayName(booking.from),
    to: [notification.to],
    cc: notification.cc ?? [],
    subject: notification.subject,
    bodyText: renderEmailText(sent.html).slice(0, MAX_BODY_CHARS),
    attachments: sent.attachments.map(({ filename, contentType }) => ({ filename, contentType })),
    inReplyTo: sent.thread.inReplyTo,
    references: sent.thread.references,
  };
}

/** Marks the notification sent and, for a booking email, records it on its thread in the same transaction. */
async function markSent(
  ctx: ActionCtx,
  notification: QueuedNotification,
  resendId: string,
  message:
    | (NonNullable<ReturnType<typeof outboundMessage>> & {
        resendEmailId: string;
        componentEmailId?: string;
        messageId?: string;
      })
    | null,
) {
  if (!message) {
    await ctx.runMutation(internal.email.enqueue.markSent, {
      notificationId: notification._id,
      resendId,
    });
    return;
  }
  const outcome = await ctx.runMutation(internal.emailOutbound.markBookingEmailSent, {
    notificationId: notification._id,
    resendId,
    message: { ...message, sentAt: Date.now() },
  });
  if (outcome === "thread_missing") {
    console.error("Booking email sent, but its thread is gone; nothing recorded", {
      notificationId: notification._id,
      threadId: message.threadId,
    });
  }
}

export const sendQueuedEmail = internalAction({
  args: {
    notificationId: v.id("emailNotifications"),
    /** Raw-SDK retry count; unset on the first try. */
    attempt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const notification = await ctx.runQuery(internal.email.enqueue.getNotification, {
      notificationId: args.notificationId,
    });
    if (!notification || notification.status !== "queued") return null;
    const attempt = args.attempt ?? 0;

    try {
      const html = await renderEmailHtml(notification.template, notification.payload);
      if (!html?.trim()) {
        throw new Error("Email template rendered empty HTML.");
      }

      const attachments = await buildAttachments(ctx, notification);
      const { booking } = notification;
      const thread = booking
        ? await ctx.runQuery(internal.emailOutbound.getThreadHeaders, { threadId: booking.threadId })
        : { references: [] };
      const message = outboundMessage(notification, { html, attachments, thread });

      // E2E mock: exercise render (+ attachments) without spending Resend quota.
      if (isE2eEmailMockEnabled()) {
        const resendId = `e2e-mock:${args.notificationId}`;
        await markSent(
          ctx,
          notification,
          resendId,
          message && {
            ...message,
            resendEmailId: resendId,
            messageId: `e2e-mock-${args.notificationId}@arbor.st`,
          },
        );
        return null;
      }

      const from =
        booking?.from ??
        (notification.template === "band_payment_confirmation" ||
        notification.template === "band_payment_completed"
          ? PAYMENTS_EMAIL_FROM
          : EMAIL_FROM);
      const headers = threadHeaders(thread);
      const idempotencyKey = notificationIdempotencyKey(args.notificationId);
      const cc = sendableCc(notification.cc);
      const sentMessage = message && { ...message, cc: cc ?? [] };

      if (attachments.length > 0) {
        const sent = await sendWithResendSdk(ctx, { ...notification, cc }, {
          from,
          html,
          attachments,
          headers,
          idempotencyKey,
        });
        await markSent(
          ctx,
          notification,
          sent.emailId,
          sentMessage && { ...sentMessage, resendEmailId: sent.resendEmailId },
        );
        return null;
      }

      const emailId = await resendClient.sendEmail(ctx, {
        from,
        to: notification.to,
        cc,
        replyTo: notification.replyTo,
        subject: notification.subject,
        html,
        headers: headers.length > 0 ? headers : undefined,
        idempotencyKey,
      });
      // The component sends later; the capture swaps in Resend's id once it has one.
      await markSent(
        ctx,
        notification,
        emailId,
        sentMessage && { ...sentMessage, resendEmailId: emailId, componentEmailId: emailId },
      );
    } catch (error) {
      let message = formatSendError(error);
      if (error instanceof ResendSendError && error.retryable) {
        const delay = RAW_SEND_RETRY_DELAYS_MS[attempt];
        if (delay !== undefined) {
          console.warn("Resend send failed; retrying", {
            notificationId: args.notificationId,
            attempt: attempt + 1,
            retryInMs: delay,
            error: message,
          });
          await ctx.scheduler.runAfter(delay, internal.email.send.sendQueuedEmail, {
            notificationId: args.notificationId,
            attempt: attempt + 1,
          });
          return null;
        }
        message = `${message} (gave up after ${attempt + 1} attempts)`;
      }
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
