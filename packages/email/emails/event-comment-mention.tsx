import {
  BodyCopy,
  CtaButton,
  DataCard,
  EmailLayout,
  EmailSignOff,
  EventDetailsSection,
} from "./_components/email-layout";
import type { EventCommentMentionEmailProps } from "../src/types";

export function EventCommentMentionEmail({
  recipientName,
  authorName,
  eventTitle,
  venueName,
  dateRangeLabel,
  commentSnippet,
  eventUrl,
}: EventCommentMentionEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";

  return (
    <EmailLayout
      preview={`${authorName} mentioned you on ${eventTitle}`}
      heading="You Were Mentioned"
    >
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        <strong>{authorName}</strong> mentioned you in a comment on an event.
      </BodyCopy>
      <EventDetailsSection
        eventTitle={eventTitle}
        venueName={venueName}
        dateRangeLabel={dateRangeLabel}
      />
      <DataCard title="Comment">
        <BodyCopy>&ldquo;{commentSnippet}&rdquo;</BodyCopy>
      </DataCard>
      <CtaButton href={eventUrl} label="View event" />
      <EmailSignOff />
    </EmailLayout>
  );
}

EventCommentMentionEmail.PreviewProps = {
  recipientName: "Jordan",
  authorName: "Alex Chen",
  eventTitle: "Friday Night Live",
  venueName: "Tresidder > Arbor Stage",
  dateRangeLabel: "Friday, Oct 10, 2026 • 5:00 PM – 11:00 PM",
  commentSnippet: "Can you confirm the lighting rig is set for the 6pm load-in?",
  eventUrl: "https://portal.arbor.st/dashboard/events/demo-event",
} satisfies EventCommentMentionEmailProps;

export default EventCommentMentionEmail;
