import { OnboardingPasskeyStep } from "@/components/onboarding/onboarding-ui";

export function PasskeyStep({ onPasskeyAdded }: { onPasskeyAdded: () => void }) {
  return <OnboardingPasskeyStep onAdded={onPasskeyAdded} />;
}
