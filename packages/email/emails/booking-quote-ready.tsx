import {
  BodyCopy,
  ContactNote,
  CtaButton,
  DataCard,
  DetailRow,
  EmailLayout,
  EmailSignOff,
  MutedCopy,
} from "./_components/email-layout";
import { currency } from "./_components/format";
import type { BookingQuoteReadyEmailProps } from "../src/types";
import { bookingQuoteReadyPreviewProps } from "./_preview-props";

export function BookingQuoteReadyEmail({
  recipientName,
  requestNumber,
  eventName,
  invoiceNumber,
  quoteTotalUsd,
  trackingUrl,
  managerName,
  managerEmail,
  managerMessage,
}: BookingQuoteReadyEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";
  const messageParagraphs = managerMessage
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

  return (
    <EmailLayout preview={`Your quote for ${eventName ?? requestNumber} is ready`} heading="Quote Ready">
      <BodyCopy>{greeting}</BodyCopy>
      {messageParagraphs.map((paragraph, index) => (
        <BodyCopy key={index}>{paragraph}</BodyCopy>
      ))}
      <BodyCopy>
        Your Arbor Live quote is ready for review. A PDF copy is attached, and you can approve the
        quote on your request tracker.
      </BodyCopy>
      <DataCard title="Quote Summary">
        <DetailRow label="Request" value={requestNumber} />
        {eventName ? <DetailRow label="Event" value={eventName} /> : null}
        <DetailRow label="Quote" value={invoiceNumber} />
        <DetailRow label="Total" value={currency(quoteTotalUsd)} emphasis />
        <DetailRow
          label="Manager"
          value={
            managerEmail ? `${managerName} (${managerEmail})` : managerName
          }
        />
      </DataCard>
      <CtaButton href={trackingUrl} label="Review and approve quote" />
      <ContactNote managerName={managerName} managerEmail={managerEmail} />
      <MutedCopy>A PDF copy of the quote is attached to this email.</MutedCopy>
      <EmailSignOff />
    </EmailLayout>
  );
}

BookingQuoteReadyEmail.PreviewProps = bookingQuoteReadyPreviewProps;

export default BookingQuoteReadyEmail;
