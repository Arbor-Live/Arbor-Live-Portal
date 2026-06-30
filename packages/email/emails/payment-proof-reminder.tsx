import {
  AlertBanner,
  BodyCopy,
  CtaButton,
  DataCard,
  DetailRow,
  EmailLayout,
  EmailSignOff,
  EventDetailsSection,
  MutedCopy,
} from "./_components/email-layout";
import { currency } from "./_components/format";
import type { PaymentProofReminderEmailProps } from "../src/types";
import { paymentProofReminderPreviewProps } from "./_preview-props";

export function PaymentProofReminderEmail({
  recipientName,
  eventTitle,
  venueName,
  dateRangeLabel,
  invoiceNumber,
  quoteTotalUsd,
  portalUrl,
  reminderKind,
  lateFeeUsd,
  isOverdue,
}: PaymentProofReminderEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";
  const reminderLabel =
    reminderKind === "first"
      ? "Your quote is approved and payment proof submission is now open."
      : "This is your weekly reminder to submit payment proof for your Arbor Live event.";

  return (
    <EmailLayout preview={`Submit payment proof for ${eventTitle}`} heading="Payment Proof Needed">
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>{reminderLabel}</BodyCopy>
      {isOverdue ? (
        <AlertBanner>
          Payment overdue — accrued late fees: {currency(lateFeeUsd)} ($25/month starting the second
          month after due).
        </AlertBanner>
      ) : null}
      <EventDetailsSection
        eventTitle={eventTitle}
        venueName={venueName}
        dateRangeLabel={dateRangeLabel}
      />
      <DataCard title="Invoice">
        <DetailRow label="Quote" value={invoiceNumber} />
        <DetailRow label="Total" value={currency(quoteTotalUsd)} emphasis />
        {isOverdue ? (
          <DetailRow label="Late fees" value={currency(lateFeeUsd)} emphasis />
        ) : null}
      </DataCard>
      <CtaButton href={portalUrl} label="Submit payment proof" />
      <BodyCopy>
        Submit your payment reference via ASSU ePay, iJournal transfer, or GrantEd Group Transfer to
        VSO #5001. Download your invoice PDF from the portal before submitting.
      </BodyCopy>
      <MutedCopy>You are receiving this because your event quote has been approved.</MutedCopy>
      <EmailSignOff />
    </EmailLayout>
  );
}

PaymentProofReminderEmail.PreviewProps = paymentProofReminderPreviewProps;

export default PaymentProofReminderEmail;
