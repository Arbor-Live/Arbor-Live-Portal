import { OnboardingAckCheckbox, OnboardingLinkCard } from "@/components/onboarding/onboarding-ui";
import { ONBOARDING_LINKS } from "@/lib/onboarding-links";
import type { FormState } from "../types";

export function HoursStep({
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
        Log your worked hours in Sequoia after every shift so payroll stays accurate.
      </p>
      <OnboardingLinkCard
        href={ONBOARDING_LINKS.sequoiaTimecardHelp}
        title="Sequoia Time Card guide"
        description="How to enter time, effort, and absences"
      />
      <OnboardingAckCheckbox
        checked={form.timecardAcknowledged}
        onChange={(next) => patch({ timecardAcknowledged: next })}
        label="I understand how to log my hours in Sequoia."
      />
      {fieldError ? <p className="text-sm text-destructive">{fieldError}</p> : null}
    </div>
  );
}
