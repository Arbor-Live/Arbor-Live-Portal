import {
  BodyCopy,
  DataCard,
  DetailRow,
  EmailLayout,
  EmailSignOff,
  MutedCopy,
} from "./_components/email-layout";
import type { RentalReturnProcessedEmailProps } from "../src/types";

export function RentalReturnProcessedEmail({
  recipientName,
  eventTitle,
  venueName,
  dateRangeLabel,
  exceptionItems,
}: RentalReturnProcessedEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";
  const hasExceptions = exceptionItems.length > 0;

  return (
    <EmailLayout
      preview={`Return processed for ${eventTitle}`}
      heading="Return Processed"
    >
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>Your rental return has been processed successfully.</BodyCopy>
      <DataCard title="Rental">
        <DetailRow label="Event" value={eventTitle} />
        {venueName ? <DetailRow label="Venue" value={venueName} /> : null}
        <DetailRow label="When" value={dateRangeLabel} />
      </DataCard>
      {hasExceptions ? (
        <>
          <BodyCopy>
            The following items were marked missing or damaged. Arbor Live will follow up with you
            about next steps.
          </BodyCopy>
          <DataCard title="Follow-up items">
            {exceptionItems.map((item) => (
              <DetailRow
                key={`${item.label}-${item.assetId ?? "none"}-${item.status}`}
                label={item.status === "damaged" ? "Damaged" : "Missing"}
                value={item.assetId ? `${item.label} (${item.assetId})` : item.label}
              />
            ))}
          </DataCard>
        </>
      ) : (
        <MutedCopy>No missing or damaged items were recorded on this return.</MutedCopy>
      )}
      <EmailSignOff />
    </EmailLayout>
  );
}

RentalReturnProcessedEmail.PreviewProps = {
  recipientName: "Jordan Lee",
  eventTitle: "Spring Concert 2026",
  venueName: "Memorial Auditorium",
  dateRangeLabel: "Saturday, Apr 12, 2026 • 6:00 PM – 11:00 PM",
  exceptionItems: [
    { label: "Wireless mic", assetId: "S100234", status: "damaged" },
    { label: "Cable", status: "missing" },
  ],
  eventUrl: "https://arborlive.stanford.edu/dashboard/events/demo",
} satisfies RentalReturnProcessedEmailProps;

export default RentalReturnProcessedEmail;
