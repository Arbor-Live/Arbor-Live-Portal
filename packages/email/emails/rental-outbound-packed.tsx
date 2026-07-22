import {
  BodyCopy,
  DataCard,
  DetailRow,
  EmailLayout,
  EmailSignOff,
  MutedCopy,
} from "./_components/email-layout";
import type { RentalOutboundPackedEmailProps } from "../src/types";

export function RentalOutboundPackedEmail({
  recipientName,
  eventTitle,
  venueName,
  dateRangeLabel,
  fulfillmentMode,
  itemSummaries,
}: RentalOutboundPackedEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";
  const statusCopy =
    fulfillmentMode === "will_call"
      ? "Your equipment has been packed and is ready for pickup."
      : "Your equipment has been packed and is on its way.";

  return (
    <EmailLayout preview={`${statusCopy} (${eventTitle})`} heading="Equipment Packed">
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>{statusCopy}</BodyCopy>
      <DataCard title="Rental">
        <DetailRow label="Event" value={eventTitle} />
        {venueName ? <DetailRow label="Venue" value={venueName} /> : null}
        <DetailRow label="When" value={dateRangeLabel} />
        <DetailRow
          label="Mode"
          value={fulfillmentMode === "will_call" ? "Will call" : "Delivery"}
        />
      </DataCard>
      {itemSummaries.length ? (
        <DataCard title="Equipment">
          {itemSummaries.slice(0, 40).map((line) => (
            <DetailRow key={line} label="Item" value={line} />
          ))}
        </DataCard>
      ) : null}
      {itemSummaries.length > 40 ? (
        <MutedCopy>Showing the first 40 items. Additional gear is included in this rental.</MutedCopy>
      ) : null}
      <EmailSignOff />
    </EmailLayout>
  );
}

RentalOutboundPackedEmail.PreviewProps = {
  recipientName: "Jordan Lee",
  eventTitle: "Spring Concert 2026",
  venueName: "Memorial Auditorium",
  dateRangeLabel: "Saturday, Apr 12, 2026 • 6:00 PM – 11:00 PM",
  fulfillmentMode: "delivery",
  itemSummaries: ["Wireless mic (S100234)", "Speaker stand (no tag)"],
  eventUrl: "https://arborlive.stanford.edu/dashboard/events/demo",
} satisfies RentalOutboundPackedEmailProps;

export default RentalOutboundPackedEmail;
