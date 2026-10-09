import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { UserSelect, type UserSelectOption } from "@/components/users/user-select";
import { BandPayeePayoutMethodField } from "@/components/bands/band-payee-payout-method-field";
import { OnboardingTextarea } from "@/components/onboarding/onboarding-ui";
import {
  BAND_PAYEE_MAILING_ADDRESS_HINT,
  BAND_PAYEE_MAILING_ADDRESS_PLACEHOLDER,
} from "@/lib/band-payout-copy";
import { PENDING_PAYEE_PREFIX, normalizeEmail } from "../constants";
import type { FormState } from "../types";

export function RatesStep({
  form,
  patch,
  members,
  payeeOptions,
  payeeSelectValue,
}: {
  form: FormState;
  patch: (next: Partial<FormState>) => void;
  members: Array<{ userId: string; name: string; email: string }> | undefined;
  payeeOptions: UserSelectOption[];
  payeeSelectValue: string;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="band-rate">Rate per person per hour (USD)</Label>
        <NumberInput
          id="band-rate"
          min={0}
          value={form.performerHourlyRateUsd}
          onValueChange={(performerHourlyRateUsd) => patch({ performerHourlyRateUsd })}
          autoFocus
        />
      </div>

      <div className="space-y-2 border-t border-border/50 pt-4">
        <p className="text-sm font-medium text-foreground">Designated payee</p>
        <p className="text-xs text-muted-foreground">
          One person who receives and distributes payment on behalf of the artist. You can
          pick a current member or a pending invite — fill in their name and mailing
          address below if needed.
        </p>
        <UserSelect
          value={payeeSelectValue}
          onChange={(value) => {
            if (value.startsWith(PENDING_PAYEE_PREFIX)) {
              const email = normalizeEmail(value.slice(PENDING_PAYEE_PREFIX.length));
              const localPart = email.split("@")[0] ?? email;
              patch({
                designatedPayeeUserId: "",
                designatedPayeeEmail: email,
                designatedPayeeName:
                  form.designatedPayeeName.trim() || localPart || email,
              });
              return;
            }
            const user = (members ?? []).find((row) => row.userId === value);
            patch({
              designatedPayeeUserId: value,
              designatedPayeeName: user?.name ?? form.designatedPayeeName,
              designatedPayeeEmail: user?.email ?? form.designatedPayeeEmail,
            });
          }}
          options={payeeOptions}
          placeholder="Select member or pending invite…"
          emptyLabel="Select payee"
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="band-payee-name">Payee name</Label>
            <Input
              id="band-payee-name"
              value={form.designatedPayeeName}
              onChange={(event) => patch({ designatedPayeeName: event.target.value })}
              placeholder="Payee name"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="band-payee-email">Payee email</Label>
            <Input
              id="band-payee-email"
              type="email"
              value={form.designatedPayeeEmail}
              onChange={(event) => patch({ designatedPayeeEmail: event.target.value })}
              placeholder="Payee email"
            />
          </div>
        </div>
        <BandPayeePayoutMethodField
          value={form.designatedPayeePayoutMethod}
          onChange={(method) => patch({ designatedPayeePayoutMethod: method })}
          idPrefix="band-onboarding"
        />
        <div className="space-y-1">
          <Label htmlFor="band-payee-mailing-address">Mailing address</Label>
          <OnboardingTextarea
            id="band-payee-mailing-address"
            value={form.designatedPayeeMailingAddress}
            onChange={(event) =>
              patch({ designatedPayeeMailingAddress: event.target.value })
            }
            placeholder={BAND_PAYEE_MAILING_ADDRESS_PLACEHOLDER}
          />
          <p className="text-xs text-muted-foreground">
            {BAND_PAYEE_MAILING_ADDRESS_HINT}
          </p>
        </div>
      </div>
    </div>
  );
}
