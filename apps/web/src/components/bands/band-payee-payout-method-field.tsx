"use client";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  BAND_PAYEE_PAYOUT_METHOD_OPTIONS,
  DEFAULT_BAND_PAYEE_PAYOUT_METHOD,
  type BandPayeePayoutMethod,
} from "@/lib/band-payout-copy";

type BandPayeePayoutMethodFieldProps = {
  value: BandPayeePayoutMethod | "";
  onChange: (value: BandPayeePayoutMethod) => void;
  idPrefix?: string;
  className?: string;
};

export function BandPayeePayoutMethodField({
  value,
  onChange,
  idPrefix = "payee-payout",
  className,
}: BandPayeePayoutMethodFieldProps) {
  const selected = value || DEFAULT_BAND_PAYEE_PAYOUT_METHOD;

  return (
    <div className={cn("space-y-2", className)}>
      <Label>Payout method</Label>
      <div className="space-y-2">
        {BAND_PAYEE_PAYOUT_METHOD_OPTIONS.map((option) => (
          <label
            key={option.value}
            htmlFor={`${idPrefix}-${option.value}`}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors",
              selected === option.value && "border-primary bg-primary/5",
            )}
          >
            <input
              id={`${idPrefix}-${option.value}`}
              type="radio"
              name={`${idPrefix}-method`}
              className="mt-0.5"
              checked={selected === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>
              <span className="font-medium">{option.label}</span>
              <span className="mt-0.5 block text-muted-foreground">{option.description}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
