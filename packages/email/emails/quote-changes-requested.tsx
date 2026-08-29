import {
  BodyCopy,
  CtaButton,
  DataCard,
  DetailRow,
  EmailLayout,
  EmailSignOff,
  EventDetailsSection,
} from "./_components/email-layout";
import type { QuoteChangesRequestedEmailProps } from "../src/types";
import { quoteChangesRequestedPreviewProps } from "./_preview-props";

export function QuoteChangesRequestedEmail({
  recipientName,
  eventTitle,
  venueName,
  dateRangeLabel,
  invoiceNumber,
  clientContactName,
  clientGroupName,
  changeNote,
  invoiceUrl,
}: QuoteChangesRequestedEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";

  return (
    <EmailLayout
      preview={`Changes requested on ${invoiceNumber}`}
      heading="Quote changes requested"
    >
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        {clientContactName ? (
          <>
            <strong>{clientContactName}</strong>
            {clientGroupName ? <> ({clientGroupName})</> : null} requested changes on quote{" "}
            <strong>{invoiceNumber}</strong>.
          </>
        ) : (
          <>
            A client requested changes on quote <strong>{invoiceNumber}</strong>.
          </>
        )}
      </BodyCopy>
      <EventDetailsSection
        eventTitle={eventTitle}
        venueName={venueName}
        dateRangeLabel={dateRangeLabel}
      />
      <DataCard title="Requested changes">
        <DetailRow label="Note" value={changeNote} />
      </DataCard>
      <CtaButton href={invoiceUrl} label="Open invoice" />
      <EmailSignOff />
    </EmailLayout>
  );
}

QuoteChangesRequestedEmail.PreviewProps = quoteChangesRequestedPreviewProps;

export default QuoteChangesRequestedEmail;
