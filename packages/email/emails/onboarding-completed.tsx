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
  dashboardUsersUrl: "http://localhost:3000/dashboard/users",
} satisfies OnboardingCompletedEmailProps;

export default OnboardingCompletedEmail;
