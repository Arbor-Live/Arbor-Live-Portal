import {
  BodyCopy,
  ContactNote,
  CtaButton,
  DataCard,
  DetailRow,
  EmailLayout,
  EmailSignOff,
  EventDetailsSection,
} from "./_components/email-layout";
import { currency } from "./_components/format";
import type { PaymentProofSubmittedEmailProps } from "../src/types";
import { paymentProofSubmittedPreviewProps } from "./_preview-props";

export function PaymentProofSubmittedEmail({
  recipientName,
  eventTitle,
  venueName,
  dateRangeLabel,
  invoiceNumber,
  quoteTotalUsd,
  paymentMethodLabel,
  paymentReference,
  financeContactEmail,
  portalUrl,
  managerName,
  managerEmail,
}: PaymentProofSubmittedEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";

  return (
    <EmailLayout preview={`Payment proof received for ${eventTitle}`} heading="Payment Proof Received">
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        We received your payment proof for {eventTitle}. Our team will verify the payment against the
        invoice total.
      </BodyCopy>
      <EventDetailsSection
        eventTitle={eventTitle}
        venueName={venueName}
        dateRangeLabel={dateRangeLabel}
      />
      <DataCard title="Submission Details">
        <DetailRow label="Quote" value={invoiceNumber} />
        <DetailRow label="Total" value={currency(quoteTotalUsd)} emphasis />
        <DetailRow label="Payment method" value={paymentMethodLabel} />
        <DetailRow label="Reference" value={paymentReference} />
        {financeContactEmail ? (
          <DetailRow label="Submitter" value={financeContactEmail} />
        ) : null}
      </DataCard>
      <ContactNote managerName={managerName} managerEmail={managerEmail} />
      <CtaButton href={portalUrl} label="View event portal" />
      <EmailSignOff />
    </EmailLayout>
  );
}

PaymentProofSubmittedEmail.PreviewProps = paymentProofSubmittedPreviewProps;

export default PaymentProofSubmittedEmail;
