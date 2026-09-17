import {
  BodyCopy,
  CtaButton,
  DataCard,
  DetailRow,
  EmailLayout,
  EmailSignOff,
  EventDetailsSection,
} from "./_components/email-layout";
import type { PaymentProofRejectedEmailProps } from "../src/types";

export function PaymentProofRejectedEmail({
  recipientName,
  eventTitle,
  venueName,
  dateRangeLabel,
  invoiceNumber,
  note,
  portalUrl,
}: PaymentProofRejectedEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";

  return (
    <EmailLayout
      preview={`Payment proof needs attention: ${eventTitle}`}
      heading="Payment proof needs attention"
    >
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        We couldn&apos;t accept the payment proof submitted for invoice{" "}
        <strong>{invoiceNumber}</strong>. Please review the note below and submit again from the
        portal.
      </BodyCopy>
      <EventDetailsSection
        eventTitle={eventTitle}
        venueName={venueName}
        dateRangeLabel={dateRangeLabel}
      />
      <DataCard title="What we need">
        <DetailRow label="Note" value={note} />
      </DataCard>
      <CtaButton href={portalUrl} label="Resubmit proof" />
      <EmailSignOff />
    </EmailLayout>
  );
}

PaymentProofRejectedEmail.PreviewProps = {
  recipientName: "Jordan Lee",
  eventTitle: "Spring Concert 2026",
  venueName: "Memorial Auditorium",
  dateRangeLabel: "Saturday, Apr 12, 2026 • 6:00 PM – 11:00 PM",
  invoiceNumber: "ALINV-4K8Z2NP",
  note: "The receipt is missing the payment amount. Please upload a full receipt.",
  portalUrl: "http://localhost:3000/quote/demo",
} satisfies PaymentProofRejectedEmailProps;

export default PaymentProofRejectedEmail;
