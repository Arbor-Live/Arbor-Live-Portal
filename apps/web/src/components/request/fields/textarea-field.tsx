"use client";

import { useFormContext, type FieldPath } from "react-hook-form";
import { Label } from "@/components/ui/label";
import type { BookingRequestFormValues } from "@/lib/validations/booking-request";

type TextareaFieldProps = {
  name: FieldPath<BookingRequestFormValues>;
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
};

export function TextareaField({ name, label, placeholder, autoFocus }: TextareaFieldProps) {
  const {
    register,
    getFieldState,
  } = useFormContext<BookingRequestFormValues>();
  const error = getFieldState(name).error?.message;

  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <textarea
        id={name}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-invalid={Boolean(error)}
        className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive"
        {...register(name)}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
