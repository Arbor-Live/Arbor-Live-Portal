import {
  BodyCopy,
  CtaButton,
  DataCard,
  DetailRow,
  EmailLayout,
  EmailSignOff,
} from "./_components/email-layout";
import type { EquipmentBorrowRequestDecidedEmailProps } from "../src/types";

export function EquipmentBorrowRequestDecidedEmail({
  recipientName,
  requestNumber,
  purpose,
  dateRangeLabel,
  approved,
  reviewNote,
  requestsUrl,
}: EquipmentBorrowRequestDecidedEmailProps) {
  const heading = approved ? "Borrow request approved" : "Borrow request not approved";
  return (
    <EmailLayout
      preview={`${heading}: ${purpose}`}
      heading={heading}
    >
      <BodyCopy>
        {recipientName ? <strong>{recipientName}, </strong> : null}
        {approved
          ? "your equipment borrow request was approved."
          : "your equipment borrow request was not approved."}
      </BodyCopy>
      <DataCard title="Request Summary">
        <DetailRow label="Request" value={requestNumber} />
        <DetailRow label="Purpose" value={purpose} />
        <DetailRow label="Window" value={dateRangeLabel} />
        {reviewNote ? <DetailRow label="Note" value={reviewNote} /> : null}
      </DataCard>
      {approved ? (
        <BodyCopy>Check the borrow requests page for checkout details.</BodyCopy>
      ) : null}
      <CtaButton href={requestsUrl} label="View requests" />
      <EmailSignOff />
    </EmailLayout>
  );
}

EquipmentBorrowRequestDecidedEmail.PreviewProps = {
  recipientName: "Jordan Lee",
  requestNumber: "ALBRW-4K8Z2NP",
  purpose: "Club mixer DJ setup",
  dateRangeLabel: "Friday, Apr 11, 2026 • 4:00 PM – 10:00 PM",
  approved: true,
  reviewNote: "Pick up from the storage room before 4 PM.",
  requestsUrl: "http://localhost:3000/dashboard/inventory/borrow-requests",
} satisfies EquipmentBorrowRequestDecidedEmailProps;

export default EquipmentBorrowRequestDecidedEmail;
