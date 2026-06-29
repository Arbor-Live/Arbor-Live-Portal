"use client";

import { useFormContext, type FieldPath } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BookingRequestFormValues } from "@/lib/validations/booking-request";

type TextFieldProps = {
  name: FieldPath<BookingRequestFormValues>;
  label: string;
  placeholder?: string;
  type?: "text" | "email" | "tel" | "number";
  autoFocus?: boolean;
};

export function TextField({ name, label, placeholder, type = "text", autoFocus }: TextFieldProps) {
  const {
    register,
    getFieldState,
  } = useFormContext<BookingRequestFormValues>();
  const error = getFieldState(name).error?.message;

  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        type={type}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-invalid={Boolean(error)}
        {...register(name, type === "number" ? { valueAsNumber: true } : undefined)}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
