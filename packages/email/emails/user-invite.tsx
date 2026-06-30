import {
  BodyCopy,
  CtaButton,
  DataCard,
  DetailRow,
  EmailLayout,
  EmailSignOff,
  MutedCopy,
} from "./_components/email-layout";
import type { UserInviteEmailProps } from "../src/types";
import { userInvitePreviewProps } from "./_preview-props";

export function UserInviteEmail({
  organizationName,
  inviterName,
  inviteUrl,
  recipientEmail,
  isExistingUser,
  expiresAtLabel,
}: UserInviteEmailProps) {
  const heading = isExistingUser ? "You've Been Added" : "You're Invited";
  const preview = isExistingUser
    ? `Join ${organizationName} on Arbor Live`
    : `${inviterName} invited you to Arbor Live`;

  return (
    <EmailLayout preview={preview} heading={heading}>
      <BodyCopy>Hi!</BodyCopy>
      {isExistingUser ? (
        <BodyCopy>
          You now have access to <strong>{organizationName}</strong> on Arbor Live. Sign in with{" "}
          <strong>{recipientEmail}</strong> to get started.
        </BodyCopy>
      ) : (
        <BodyCopy>
          <strong>{inviterName}</strong> invited you to join <strong>{organizationName}</strong> on
          Arbor Live. Set your password to activate your account.
        </BodyCopy>
      )}
      <DataCard title="Invitation Details">
        <DetailRow label="Organization" value={organizationName} />
        <DetailRow label="Email" value={recipientEmail} />
        <DetailRow label="Expires" value={expiresAtLabel} />
      </DataCard>
      <CtaButton
        href={inviteUrl}
        label={isExistingUser ? "Sign in to Arbor Live" : "Accept invitation"}
      />
      <MutedCopy>If you were not expecting this invitation, you can safely ignore this email.</MutedCopy>
      <EmailSignOff />
    </EmailLayout>
  );
}

UserInviteEmail.PreviewProps = userInvitePreviewProps;

export default UserInviteEmail;
