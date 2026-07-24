import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  BAND_PAYMENTS_CC_EMAIL,
  EVENT_TIMEZONE,
  bandPaymentHistoryUrl,
  bandPayeeSettingsUrl,
  formatEventDateRange,
  subjectForTemplate,
} from "./constants";
import { enqueueEmail } from "./enqueue";
import {
  formatBandPaymentDate,
  formatPerformanceHours,
} from "../lib/bandPayments";

type BandPaymentEmailContext = {
  payment: Doc<"eventBandPayments">;
  event: Doc<"events">;
  bandName?: string;
};

export async function scheduleBandPaymentConfirmationEmail(
  ctx: MutationCtx,
  { payment, event }: BandPaymentEmailContext,
) {
  const payeeFirstName =
    payment.designatedPayeeName?.split(" ")[0] ?? payment.designatedPayeeName ?? "there";
  const notificationId = await enqueueEmail(ctx, {
    template: "band_payment_confirmation",
    to: payment.designatedPayeeEmail ?? "",
    cc: [BAND_PAYMENTS_CC_EMAIL],
    subject: subjectForTemplate("band_payment_confirmation", `${event.title} [${payment.confirmationToken}]`),
    eventId: event._id,
    idempotencyKey: `band-payment-confirmation:${payment._id}:${payment.confirmationEmailSentAt ?? 0}`,
    payload: {
      paymentId: payment._id,
      recipientName: payeeFirstName,
      eventTitle: event.title,
      venueName: event.venueName ?? "Arbor Stage",
      eventDateLabel: formatBandPaymentDate(event.startAt, event.timezone),
      performanceHoursLabel: formatPerformanceHours(payment.performanceHours),
      pricingMode: payment.pricingMode,
      ratePerMemberPerHourUsd: payment.ratePerMemberPerHourUsd,
      totalUsd: payment.totalUsd,
      designatedPayeeName: payment.designatedPayeeName ?? "Designated payee",
      photoAlbumUrl: payment.photoAlbumUrl,
      confirmationToken: payment.confirmationToken,
      signUrl: bandPaymentHistoryUrl(),
    },
  });

  await ctx.scheduler.runAfter(0, internal.bandPayments.markConfirmationEmailSent, {
    paymentId: payment._id,
    notificationId,
  });
}

export async function scheduleBandPaymentCompletedEmails(
  ctx: MutationCtx,
  {
    payment,
    event,
    servicePaymentNumber,
  }: BandPaymentEmailContext & { servicePaymentNumber: string },
) {
  const memberships = await ctx.db
    .query("userOrganizationMemberships")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", payment.organizationId))
    .take(200);
  const activeMemberIds = memberships.filter((row) => row.active).map((row) => row.userId);
  const users = await ctx.runQuery(internal.bandPayments.listBandMemberEmails, {
    userIds: activeMemberIds,
  });

  const dateRangeLabel = formatEventDateRange(event.startAt, event.endAt, event.timezone || EVENT_TIMEZONE);

  for (const member of users) {
    if (!member.email) continue;
    await enqueueEmail(ctx, {
      template: "band_payment_completed",
      to: member.email,
      subject: subjectForTemplate("band_payment_completed", event.title),
      eventId: event._id,
      idempotencyKey: `band-payment-completed:${payment._id}:${member.userId}`,
      payload: {
        recipientName: member.name,
        bandName: member.bandName,
        eventTitle: event.title,
        venueName: event.venueName,
        dateRangeLabel,
        totalUsd: payment.totalUsd,
        servicePaymentNumber,
        designatedPayeeName: payment.designatedPayeeName ?? "Designated payee",
      },
    });
  }
}

export async function scheduleBandPaymentPayeeRequiredEmail(
  ctx: MutationCtx,
  { payment, event, bandName }: BandPaymentEmailContext & { bandName: string },
) {
  const recipients = await ctx.runQuery(internal.bandPayments.listBandOrgNotificationEmails, {
    organizationId: payment.organizationId,
  });
  if (recipients.length === 0) {
    throw new Error("No active band members found to notify about payee setup.");
  }

  for (const recipient of recipients) {
    await enqueueEmail(ctx, {
      template: "band_payment_payee_required",
      to: recipient.email,
      subject: subjectForTemplate("band_payment_payee_required", event.title),
      eventId: event._id,
      idempotencyKey: `band-payment-payee-required:${payment._id}:${recipient.email}`,
      payload: {
        recipientName: recipient.name.split(" ")[0] ?? recipient.name,
        bandName,
        eventTitle: event.title,
        venueName: event.venueName ?? "Arbor Stage",
        eventDateLabel: formatBandPaymentDate(event.startAt, event.timezone),
        payeeSettingsUrl: bandPayeeSettingsUrl(),
      },
    });
  }
}
