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
  remainingAssignmentSummaries,
}: CrewUnscheduledEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";
  const keepsOtherBlocks = (remainingAssignmentSummaries?.length ?? 0) > 0;

  return (
    <EmailLayout
      preview={`You're no longer scheduled for ${eventTitle}`}
      heading="Schedule Removed"
      tone="muted"
    >
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        {keepsOtherBlocks
          ? "Part of your crew schedule for this event was removed. A calendar cancellation for those blocks is attached; your other invites for this event still stand."
          : "You have been removed from the crew schedule for this event. A calendar cancellation is attached so you can remove the previous invite from your calendar."}
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
        <ScheduleTimeline
          items={previousAssignmentSummaries}
          title={keepsOtherBlocks ? "Removed" : "Previous assignments"}
        />
      ) : null}
      {keepsOtherBlocks ? (
        <ScheduleTimeline items={remainingAssignmentSummaries!} title="Still scheduled" />
      ) : null}
      <CtaButton href={eventUrl} label="View event details" variant="secondary" />
      <EmailSignOff />
    </EmailLayout>
  );
}

CrewUnscheduledEmail.PreviewProps = crewUnscheduledPreviewProps;

export default CrewUnscheduledEmail;
