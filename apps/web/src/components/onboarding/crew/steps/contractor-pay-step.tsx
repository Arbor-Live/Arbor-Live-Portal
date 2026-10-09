import { OnboardingAckCheckbox } from "@/components/onboarding/onboarding-ui";
import { CONTRACTOR_PAY_INFO } from "@/lib/onboarding-links";
import type { FormState } from "../types";

export function ContractorPayStep({
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
        You&apos;re set up on external payroll. Email a completed W9 to{" "}
        <a
          className="font-medium text-primary underline-offset-4 hover:underline"
          href={`mailto:${CONTRACTOR_PAY_INFO.w9Email}`}
        >
          {CONTRACTOR_PAY_INFO.w9Email}
        </a>
        , then submit an invoice for your worked hours {CONTRACTOR_PAY_INFO.invoiceCadence} to
        the same address.
      </p>
      <ol className="list-decimal space-y-2 pl-4 text-sm text-foreground/70">
        <li>
          Complete a W9 and email it to{" "}
          <span className="font-medium text-foreground">{CONTRACTOR_PAY_INFO.w9Email}</span>.
        </li>
        <li>
          Every two weeks, email an invoice for hours worked (include dates, hours, and rate)
          to the same address.
        </li>
      </ol>
      <OnboardingAckCheckbox
        checked={form.contractorPayAcknowledged}
        onChange={(next) => patch({ contractorPayAcknowledged: next })}
        label="I understand I need to submit a W9 and invoice Arbor Live every two weeks."
      />
      {fieldError ? <p className="text-sm text-destructive">{fieldError}</p> : null}
    </div>
  );
}
