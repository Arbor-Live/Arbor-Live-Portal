import {
  BodyCopy,
  CtaButton,
  DataCard,
  DetailRow,
  EmailLayout,
  EmailSignOff,
} from "./_components/email-layout";
import type { EquipmentBorrowRequestAdminEmailProps } from "../src/types";

export function EquipmentBorrowRequestAdminEmail({
  requesterName,
  requesterEmail,
  requestNumber,
  purpose,
  dateRangeLabel,
  itemSummary,
  reviewUrl,
}: EquipmentBorrowRequestAdminEmailProps) {
  return (
    <EmailLayout preview={`New borrow request: ${purpose}`} heading="New equipment borrow request">
      <BodyCopy>
        <strong>{requesterName}</strong> ({requesterEmail}) requested equipment.
      </BodyCopy>
      <DataCard title="Request Summary">
        <DetailRow label="Request" value={requestNumber} />
        <DetailRow label="Purpose" value={purpose} />
        <DetailRow label="Window" value={dateRangeLabel} />
        <DetailRow label="Equipment" value={itemSummary} />
      </DataCard>
      <BodyCopy>Review it in the borrow requests queue.</BodyCopy>
      <CtaButton href={reviewUrl} label="Review request" />
      <EmailSignOff />
    </EmailLayout>
  );
}

EquipmentBorrowRequestAdminEmail.PreviewProps = {
  requesterName: "Jordan Lee",
  requesterEmail: "jlee@stanford.edu",
  requestNumber: "ALBRW-4K8Z2NP",
  purpose: "Club mixer DJ setup",
  dateRangeLabel: "Friday, Apr 11, 2026 • 4:00 PM – 10:00 PM",
  itemSummary: "2× SM58, 1× DJ Package",
  reviewUrl: "http://localhost:3000/dashboard/inventory/borrow-requests",
} satisfies EquipmentBorrowRequestAdminEmailProps;

export default EquipmentBorrowRequestAdminEmail;
