import { BodyCopy, CtaButton, EmailLayout, EmailSignOff } from "./_components/email-layout";
import type { BandApplicationDecisionEmailProps } from "../src/types";

export function BandApplicationApprovedEmail({
  recipientName,
  bandName,
  acceptInviteUrl,
}: BandApplicationDecisionEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";
  return (
    <EmailLayout preview={`${bandName} was approved`} heading="You're in">
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        Great news — <strong>{bandName}</strong> was approved to work with Arbor Live. Check your
        inbox for an invite to the band portal, then finish payout details so we can book and pay
        you. Public listing stays off until you enable it.
      </BodyCopy>
      {acceptInviteUrl ? (
        <CtaButton href={acceptInviteUrl} label="Open the portal" />
      ) : (
        <CtaButton href="http://localhost:3000/sign-in" label="Sign in" />
      )}
      <EmailSignOff />
    </EmailLayout>
  );
}

BandApplicationApprovedEmail.PreviewProps = {
  recipientName: "Alex",
  bandName: "The Redwoods",
  acceptInviteUrl: "http://localhost:3000/accept-invite?token=demo",
} satisfies BandApplicationDecisionEmailProps;

export default BandApplicationApprovedEmail;
