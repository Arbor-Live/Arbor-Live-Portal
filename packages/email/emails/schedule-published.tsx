import {
  BodyCopy,
  CtaButton,
  EmailLayout,
  EmailSignOff,
  EventDetailsSection,
  ScheduleTimeline,
} from "./_components/email-layout";
import type { SchedulePublishedEmailProps } from "../src/types";
import { schedulePublishedPreviewProps } from "./_preview-props";

export function SchedulePublishedEmail({
  eventTitle,
  venueName,
  dateRangeLabel,
  eventUrl,
  recipientName,
  blockSummaries,
}: SchedulePublishedEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";

  return (
    <EmailLayout preview={`Schedule published for ${eventTitle}`} heading="Schedule Published">
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        The schedule for this event has been updated. Review the timeline below and confirm your
        assignments in Arbor Live.
      </BodyCopy>
      <EventDetailsSection
        eventTitle={eventTitle}
        venueName={venueName}
        dateRangeLabel={dateRangeLabel}
      />
      {blockSummaries.length > 0 ? <ScheduleTimeline items={blockSummaries} /> : null}
      <CtaButton href={eventUrl} label="View schedule" />
      <EmailSignOff />
    </EmailLayout>
  );
}

SchedulePublishedEmail.PreviewProps = schedulePublishedPreviewProps;

export default SchedulePublishedEmail;
