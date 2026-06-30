import { Text } from "@react-email/components";
import {
  BodyCopy,
  CtaButton,
  EmailLayout,
  EmailSignOff,
  HighlightBox,
  MutedCopy,
} from "./components/email-layout";
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
      <HighlightBox title="Invitation Details">
        <Text style={highlightLineStyle}>
          <strong>Organization:</strong> {organizationName}
        </Text>
        <Text style={highlightLineStyle}>
          <strong>Email:</strong> {recipientEmail}
        </Text>
        <Text style={highlightLineStyle}>
          <strong>Expires:</strong> {expiresAtLabel}
        </Text>
      </HighlightBox>
      <MutedCopy>If you were not expecting this invitation, you can safely ignore this email.</MutedCopy>
      <CtaButton
        href={inviteUrl}
        label={isExistingUser ? "Sign in to Arbor Live" : "Accept invitation"}
      />
      <EmailSignOff />
    </EmailLayout>
  );
}

UserInviteEmail.PreviewProps = userInvitePreviewProps;

export default UserInviteEmail;

const highlightLineStyle = {
  color: "#ffffff",
  fontSize: "14px",
  lineHeight: "24px",
  margin: "0 0 8px",
};
