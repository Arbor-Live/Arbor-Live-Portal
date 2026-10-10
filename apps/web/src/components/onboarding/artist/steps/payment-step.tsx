import { OnboardingAckCheckbox } from "@/components/onboarding/onboarding-ui";
import { BAND_PAYEE_1099_NOTICE } from "@/lib/band-payout-copy";
import type { FormState } from "../types";

export function PaymentStep({
  form,
  patch,
}: {
  form: FormState;
  patch: (next: Partial<FormState>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-3 text-sm text-foreground/70">
        <p>
          After your event, Arbor Live pays your designated payee directly by the
          performer hourly rate on file, multiplied by the hours you performed.
        </p>
        <p>
          Your payee is responsible for distributing payment to the rest of the members.
          You can update your payee or rate anytime from your artist settings.
        </p>
        <p>{BAND_PAYEE_1099_NOTICE}</p>
      </div>
      <OnboardingAckCheckbox
        checked={form.paymentExplainedAck}
        onChange={(next) => patch({ paymentExplainedAck: next })}
        label="I understand how payouts work for this artist."
      />
    </div>
  );
}
