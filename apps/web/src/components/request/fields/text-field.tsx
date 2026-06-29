"use client";

import { useFormContext, type FieldPath, type FieldValues } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TextFieldProps<T extends FieldValues> = {
  name: FieldPath<T>;
  label: string;
  placeholder?: string;
  type?: "text" | "email" | "tel" | "number";
  autoFocus?: boolean;
};

export function TextField<T extends FieldValues>({
  name,
  label,
  placeholder,
  type = "text",
  autoFocus,
}: TextFieldProps<T>) {
  const { register, getFieldState } = useFormContext<T>();
  const error = getFieldState(name).error?.message;

  return (
    <div className="space-y-2">
      <Label htmlFor={String(name)}>{label}</Label>
      <Input
        id={String(name)}
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
