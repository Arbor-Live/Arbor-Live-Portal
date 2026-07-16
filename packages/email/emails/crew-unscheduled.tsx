import {
  BodyCopy,
  CtaButton,
  EmailLayout,
  EmailSignOff,
  EventDetailsSection,
  ScheduleTimeline,
} from "./_components/email-layout";
import type { CrewUnscheduledEmailProps } from "../src/types";
import { crewUnscheduledPreviewProps } from "./_preview-props";

export function CrewUnscheduledEmail({
  eventTitle,
  venueName,
  dateRangeLabel,
  eventUrl,
  recipientName,
  eventLeadName,
  previousAssignmentSummaries,
}: CrewUnscheduledEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";

  return (
    <EmailLayout
      preview={`You're no longer scheduled for ${eventTitle}`}
      heading="Schedule Removed"
      tone="muted"
    >
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        You have been removed from the crew schedule for this event. A calendar cancellation is
        attached so you can remove the previous invite from your calendar.
      </BodyCopy>
      <EventDetailsSection
        title="Event"
        eventTitle={eventTitle}
        venueName={venueName}
        dateRangeLabel={dateRangeLabel}
        eventLeadName={eventLeadName}
        variant="muted"
      />
      {previousAssignmentSummaries.length > 0 ? (
        <ScheduleTimeline items={previousAssignmentSummaries} title="Previous assignments" />
      ) : null}
      <CtaButton href={eventUrl} label="View event details" variant="secondary" />
      <EmailSignOff />
    </EmailLayout>
  );
}

CrewUnscheduledEmail.PreviewProps = crewUnscheduledPreviewProps;

export default CrewUnscheduledEmail;
