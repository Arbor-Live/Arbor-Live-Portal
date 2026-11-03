import { UsualEveningsFields } from "@/components/availability/usual-evenings-fields";
import type { FormState } from "../types";

export function EveningsStep({
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
        Most events are Thursday to Saturday evenings. Tell us how often you&apos;re free, and new
        nights on My Availability start from it, so most weeks you just confirm. You can change it
        any time in Account settings.
      </p>
      <UsualEveningsFields
        value={form.usualEvenings}
        onChange={(usualEvenings) => patch({ usualEvenings })}
        idPrefix="onboarding-usual"
      />
      {fieldError ? <p className="text-sm text-destructive">{fieldError}</p> : null}
    </div>
  );
}
