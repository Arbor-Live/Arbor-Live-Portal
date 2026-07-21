import {
  BodyCopy,
  CtaButton,
  DataCard,
  DetailRow,
  EmailLayout,
  EmailSignOff,
} from "./_components/email-layout";
import type { BookingRequestAdminEmailProps } from "../src/types";

export function BookingRequestAdminEmail({
  requesterName,
  requesterEmail,
  requestNumber,
  eventName,
  eventDateText,
  organization,
  reviewUrl,
}: BookingRequestAdminEmailProps) {
  return (
    <EmailLayout
      preview={`New booking request: ${eventName}`}
      heading="New booking request"
    >
      <BodyCopy>
        <strong>{requesterName}</strong> ({requesterEmail}) submitted a booking request.
      </BodyCopy>
      <DataCard title="Request Summary">
        <DetailRow label="Request" value={requestNumber} />
        <DetailRow label="Event" value={eventName} />
        <DetailRow label="Date" value={eventDateText} />
        {organization ? <DetailRow label="Organization" value={organization} /> : null}
      </DataCard>
      <BodyCopy>Review it in the booking requests inbox.</BodyCopy>
      <CtaButton href={reviewUrl} label="Open request" />
      <EmailSignOff />
    </EmailLayout>
  );
}

BookingRequestAdminEmail.PreviewProps = {
  requesterName: "Jordan Lee",
  requesterEmail: "jlee@stanford.edu",
  requestNumber: "ALREQ-4K8Z2NP",
  eventName: "Spring Concert 2026",
  eventDateText: "Saturday, Apr 12, 2026",
  organization: "Stanford Concert Network",
  reviewUrl: "http://localhost:3000/dashboard/events/requests/demo",
} satisfies BookingRequestAdminEmailProps;

export default BookingRequestAdminEmail;
