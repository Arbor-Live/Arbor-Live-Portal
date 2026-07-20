import { BodyCopy, CtaButton, EmailLayout, EmailSignOff } from "./_components/email-layout";
import type { CrewApplicationReceivedEmailProps } from "../src/types";

export function CrewApplicationReceivedEmail({
  applicantName,
  applicantEmail,
  vertical,
  reviewUrl,
}: CrewApplicationReceivedEmailProps) {
  return (
    <EmailLayout preview={`New crew application: ${applicantName}`} heading="New crew application">
      <BodyCopy>
        <strong>{applicantName}</strong> ({applicantEmail}) applied to join Arbor Live
        {vertical ? (
          <>
            {" "}
            for <strong>{vertical}</strong>
          </>
        ) : null}
        .
      </BodyCopy>
      <BodyCopy>Review the application in the portal queue.</BodyCopy>
      <CtaButton href={reviewUrl} label="Review applications" />
      <EmailSignOff />
    </EmailLayout>
  );
}

CrewApplicationReceivedEmail.PreviewProps = {
  applicantName: "Jordan Lee",
  applicantEmail: "jlee@stanford.edu",
  vertical: "Crew",
  reviewUrl: "http://localhost:3000/dashboard/users/crew-applications",
} satisfies CrewApplicationReceivedEmailProps;

export default CrewApplicationReceivedEmail;
