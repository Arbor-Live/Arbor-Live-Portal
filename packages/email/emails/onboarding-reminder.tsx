import {
  BodyCopy,
  CtaButton,
  EmailLayout,
  EmailSignOff,
} from "./_components/email-layout";
import type { OnboardingReminderEmailProps } from "../src/types";

export function OnboardingReminderEmail({
  recipientName,
  onboardingUrl,
  incompleteStepCount,
}: OnboardingReminderEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";
  const stepsLabel =
    incompleteStepCount === 1 ? "1 step remaining" : `${incompleteStepCount} steps remaining`;

  return (
    <EmailLayout preview="Finish your Arbor Live onboarding" heading="Onboarding Reminder">
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        You still have unfinished Arbor Live crew onboarding ({stepsLabel}). Finishing it unlocks
        hiring follow-up and keeps leadership from chasing paperwork.
      </BodyCopy>
      <CtaButton href={onboardingUrl} label="Continue onboarding" />
      <EmailSignOff />
    </EmailLayout>
  );
}

OnboardingReminderEmail.PreviewProps = {
  recipientName: "Alex",
  onboardingUrl: "http://localhost:3000/onboarding",
  incompleteStepCount: 4,
} satisfies OnboardingReminderEmailProps;

export default OnboardingReminderEmail;
