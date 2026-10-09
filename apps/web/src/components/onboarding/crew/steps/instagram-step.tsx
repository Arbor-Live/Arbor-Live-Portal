import { OnboardingAckCheckbox, OnboardingLinkCard } from "@/components/onboarding/onboarding-ui";
import { ONBOARDING_LINKS } from "@/lib/onboarding-links";
import type { FormState } from "../types";

export function InstagramStep({
  form,
  patch,
  fieldError,
}: {
  form: FormState;
  patch: (next: Partial<FormState>) => void;
  fieldError: string | null;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground/70">
        Follow both of our accounts to stay in the loop on events and see your work featured.
      </p>
      <div className="space-y-2">
        <OnboardingLinkCard
          href={ONBOARDING_LINKS.instagramArbor}
          title="Follow @thearborstanford"
          description="Main Arbor Live account"
        />
        <OnboardingLinkCard
          href={ONBOARDING_LINKS.instagramTrivia}
          title="Follow @arbortrivia"
          description="Trivia nights and specials"
        />
      </div>
      <OnboardingAckCheckbox
        checked={form.instagramAcknowledged}
        onChange={(next) => patch({ instagramAcknowledged: next })}
        label="I've followed both Instagram accounts."
      />
      {fieldError ? <p className="text-sm text-destructive">{fieldError}</p> : null}
    </div>
  );
}
