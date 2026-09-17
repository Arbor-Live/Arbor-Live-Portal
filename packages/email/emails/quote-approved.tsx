import {
  BodyCopy,
  CtaButton,
  DataCard,
  DetailRow,
  EmailLayout,
  EmailSignOff,
  EventDetailsSection,
} from "./_components/email-layout";
import { currency } from "./_components/format";
import type { QuoteApprovedEmailProps } from "../src/types";

export function QuoteApprovedEmail({
  recipientName,
  eventTitle,
  venueName,
  dateRangeLabel,
  invoiceNumber,
  quoteTotalUsd,
  clientContactName,
  clientGroupName,
  invoiceUrl,
}: QuoteApprovedEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";
  const approvedBy = clientContactName
    ? clientGroupName
      ? `${clientContactName} (${clientGroupName})`
      : clientContactName
    : clientGroupName ?? "The client";

  return (
    <EmailLayout
      preview={`Quote approved: ${eventTitle}`}
      heading="Quote approved"
    >
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        <strong>{approvedBy}</strong> approved quote <strong>{invoiceNumber}</strong>.
      </BodyCopy>
      <EventDetailsSection
        eventTitle={eventTitle}
        venueName={venueName}
        dateRangeLabel={dateRangeLabel}
      />
      <DataCard title="Quote">
        <DetailRow label="Invoice" value={invoiceNumber} />
        <DetailRow label="Total" value={currency(quoteTotalUsd)} />
      </DataCard>
      <CtaButton href={invoiceUrl} label="Open invoice" />
      <EmailSignOff />
    </EmailLayout>
  );
}

QuoteApprovedEmail.PreviewProps = {
  recipientName: "Alex Chen",
  eventTitle: "Spring Concert 2026",
  venueName: "Memorial Auditorium",
  dateRangeLabel: "Saturday, Apr 12, 2026 • 6:00 PM – 11:00 PM",
  invoiceNumber: "ALINV-4K8Z2NP",
  quoteTotalUsd: 2450,
  clientContactName: "Jordan Lee",
  clientGroupName: "Stanford Concert Network",
  invoiceUrl: "http://localhost:3000/dashboard/financial-hub/invoices/demo",
} satisfies QuoteApprovedEmailProps;

export default QuoteApprovedEmail;
