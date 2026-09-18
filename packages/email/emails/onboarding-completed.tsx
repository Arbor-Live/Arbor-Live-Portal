import {
  BodyCopy,
  CtaButton,
  DataCard,
  DetailRow,
  EmailLayout,
  EmailSignOff,
} from "./_components/email-layout";
import type { OnboardingCompletedEmailProps } from "../src/types";

export function OnboardingCompletedEmail({
  crewName,
  crewEmail,
  hasFederalWorkStudy,
  hasValidDriversLicense,
  signatureLegalName,
  studentId,
  employmentStartDateLabel,
  otherCampusEmploymentLabel,
  i9ScheduledByFirstDay,
  dashboardUsersUrl,
}: OnboardingCompletedEmailProps) {
  return (
    <EmailLayout
      preview={`${crewName} finished Arbor Live onboarding`}
      heading="Crew Onboarding Complete"
    >
      <BodyCopy>Hi!</BodyCopy>
      <BodyCopy>
        <strong>{crewName}</strong> ({crewEmail}) completed crew onboarding and digitally signed the
        onboarding agreement.
      </BodyCopy>
      <DataCard title="Details">
        <DetailRow label="Legal signature" value={signatureLegalName} />
        {studentId ? <DetailRow label="Student ID" value={studentId} /> : null}
        {employmentStartDateLabel ? (
          <DetailRow label="Start date" value={employmentStartDateLabel} />
        ) : null}
        {otherCampusEmploymentLabel ? (
          <DetailRow label="Other campus employment" value={otherCampusEmploymentLabel} />
        ) : null}
        {i9ScheduledByFirstDay ? (
          <DetailRow label="I-9 appointment" value="Scheduled by first day" />
        ) : null}
        <DetailRow label="Federal Work-Study" value={hasFederalWorkStudy ? "Yes" : "No"} />
        <DetailRow
          label="Valid driver's license"
          value={hasValidDriversLicense ? "Yes" : "No"}
        />
      </DataCard>
      <CtaButton href={dashboardUsersUrl} label="View in Users" />
      <EmailSignOff />
    </EmailLayout>
  );
}

OnboardingCompletedEmail.PreviewProps = {
  crewName: "Alex Crew",
  crewEmail: "alex@stanford.edu",
  hasFederalWorkStudy: true,
  hasValidDriversLicense: false,
  signatureLegalName: "Alexandra Crew",
  studentId: "12345678",
  employmentStartDateLabel: "Sep 1, 2026",
  otherCampusEmploymentLabel: "No",
  i9ScheduledByFirstDay: true,
  dashboardUsersUrl: "http://localhost:3000/dashboard/users",
} satisfies OnboardingCompletedEmailProps;

export default OnboardingCompletedEmail;
