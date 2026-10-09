import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OnboardingAckCheckbox, OnboardingLinkCard } from "@/components/onboarding/onboarding-ui";
import { ONBOARDING_LINKS } from "@/lib/onboarding-links";
import type { FormState } from "../types";

export function SignatureStep({
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
        Review the full onboarding agreement, then sign below to complete onboarding.
      </p>
      <OnboardingLinkCard href={ONBOARDING_LINKS.onboardingDoc} title="Review the onboarding agreement" />

      <div className="space-y-2">
        <Label htmlFor="crew-signature">Type your full legal name to sign</Label>
        <Input
          id="crew-signature"
          value={form.signatureLegalName}
          onChange={(event) => patch({ signatureLegalName: event.target.value })}
          placeholder="Full legal name"
          autoFocus
        />
      </div>

      <OnboardingAckCheckbox
        checked={form.agreedToDoc}
        onChange={(next) => patch({ agreedToDoc: next })}
        label="I agree to the onboarding terms and expectations above."
      />

      {fieldError ? <p className="text-sm text-destructive">{fieldError}</p> : null}
    </div>
  );
}
