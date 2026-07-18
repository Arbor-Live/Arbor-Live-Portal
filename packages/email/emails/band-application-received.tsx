import { BodyCopy, CtaButton, EmailLayout, EmailSignOff } from "./_components/email-layout";
import type { BandApplicationReceivedEmailProps } from "../src/types";

export function BandApplicationReceivedEmail({
  bandName,
  contactName,
  contactEmail,
  reviewUrl,
}: BandApplicationReceivedEmailProps) {
  return (
    <EmailLayout preview={`New band application: ${bandName}`} heading="New band application">
      <BodyCopy>
        <strong>{contactName}</strong> ({contactEmail}) applied for <strong>{bandName}</strong> to
        join Arbor Live.
      </BodyCopy>
      <BodyCopy>Review the application in the portal and approve or decline.</BodyCopy>
      <CtaButton href={reviewUrl} label="Review applications" />
      <EmailSignOff />
    </EmailLayout>
  );
}

BandApplicationReceivedEmail.PreviewProps = {
  bandName: "The Redwoods",
  contactName: "Alex Kim",
  contactEmail: "akim@stanford.edu",
  reviewUrl: "http://localhost:3000/dashboard/users/band-applications",
} satisfies BandApplicationReceivedEmailProps;

export default BandApplicationReceivedEmail;
