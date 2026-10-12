import {
  BodyCopy,
  ContactNote,
  CtaButton,
  DataCard,
  DetailRow,
  EmailLayout,
  EmailSignOff,
  EventDetailsSection,
  MutedCopy,
} from "./_components/email-layout";
import { currency } from "./_components/format";
import type { QuoteUpdatedEmailProps } from "../src/types";
import { quoteUpdatedPreviewProps } from "./_preview-props";

/**
 * Sent to the client when staff change an approved quote and ask for approval
 * again, or answer the changes the client asked for.
 */
export function QuoteUpdatedEmail({
  recipientName,
  eventTitle,
  venueName,
  dateRangeLabel,
  invoiceNumber,
  previousTotalUsd,
  newTotalUsd,
  changeNote,
  reason = "approved",
  requestNote,
  portalUrl,
  managerName,
  managerEmail,
}: QuoteUpdatedEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";
  const difference = Math.round((newTotalUsd - previousTotalUsd) * 100) / 100;
  const differenceLabel =
    difference === 0
      ? "No change"
      : `${difference > 0 ? "+" : "−"}${currency(Math.abs(difference))}`;

  const answersRequest = reason === "changes_requested";

  return (
    <EmailLayout preview={`Your quote for ${eventTitle} was updated`} heading="Quote Updated">
      <BodyCopy>{greeting}</BodyCopy>
      {answersRequest ? (
        <BodyCopy>
          We looked at the changes you asked for on the quote for {eventTitle}. Please review it and
          approve it, or tell us what else should change.
        </BodyCopy>
      ) : (
        <BodyCopy>
          We updated the quote you approved for {eventTitle}. Please review the changes and approve it
          again so we can keep planning.
        </BodyCopy>
      )}
      {answersRequest && requestNote ? <MutedCopy>You asked: “{requestNote}”</MutedCopy> : null}
      {changeNote ? <BodyCopy>“{changeNote}”</BodyCopy> : null}
      <EventDetailsSection
        eventTitle={eventTitle}
        venueName={venueName}
        dateRangeLabel={dateRangeLabel}
      />
      <DataCard title="Quote">
        <DetailRow label="Quote" value={invoiceNumber} />
        <DetailRow
          label={answersRequest ? "Previous total" : "You approved"}
          value={currency(previousTotalUsd)}
        />
        <DetailRow label="Updated total" value={currency(newTotalUsd)} emphasis />
        <DetailRow label="Difference" value={differenceLabel} />
      </DataCard>
      <CtaButton href={portalUrl} label="Review the updated quote" />
      <ContactNote managerName={managerName} managerEmail={managerEmail} />
      <MutedCopy>
        This is still an estimate. Your final invoice comes after the event, once hours are final,
        so please don&apos;t send payment until then.
      </MutedCopy>
      <EmailSignOff />
    </EmailLayout>
  );
}

QuoteUpdatedEmail.PreviewProps = quoteUpdatedPreviewProps;

export default QuoteUpdatedEmail;
