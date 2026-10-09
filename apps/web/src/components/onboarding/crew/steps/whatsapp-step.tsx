import { OnboardingAckCheckbox, OnboardingLinkCard } from "@/components/onboarding/onboarding-ui";
import { ONBOARDING_LINKS } from "@/lib/onboarding-links";
import type { FormState } from "../types";

export function WhatsappStep({
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
        Crew coordination, shift reminders, and last-minute changes all happen in our WhatsApp
        group, <span className="font-medium">{ONBOARDING_LINKS.whatsappGroupName}</span>.
      </p>
      <OnboardingLinkCard
        href={ONBOARDING_LINKS.whatsappInvite}
        title="Join the WhatsApp group"
        description={ONBOARDING_LINKS.whatsappGroupName}
      />
      <OnboardingAckCheckbox
        checked={form.whatsappAcknowledged}
        onChange={(next) => patch({ whatsappAcknowledged: next })}
        label="I've joined the Arbor WhatsApp group."
      />
      {fieldError ? <p className="text-sm text-destructive">{fieldError}</p> : null}
    </div>
  );
}
