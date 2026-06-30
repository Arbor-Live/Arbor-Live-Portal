import {
  BodyCopy,
  CtaButton,
  EmailLayout,
  EmailSignOff,
  MutedCopy,
} from "./_components/email-layout";
import type { ChangeEmailConfirmationEmailProps } from "../src/types";

export function ChangeEmailConfirmationEmail({
  recipientName,
  newEmail,
  confirmUrl,
}: ChangeEmailConfirmationEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";

  return (
    <EmailLayout preview="Approve your Arbor Live email change" heading="Approve Email Change">
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        Someone requested to change the email on your Arbor Live account to{" "}
        <strong>{newEmail}</strong>. Approve this change to continue.
      </BodyCopy>
      <MutedCopy>If you did not request this change, ignore this email and your account will stay as-is.</MutedCopy>
      <CtaButton href={confirmUrl} label="Approve email change" />
      <EmailSignOff />
    </EmailLayout>
  );
}

export default ChangeEmailConfirmationEmail;
