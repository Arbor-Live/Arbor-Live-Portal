"use client";

import type { FieldPath, FieldValues } from "react-hook-form";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

type TextFormFieldProps<T extends FieldValues> = {
  name: FieldPath<T>;
  label: string;
  placeholder?: string;
  type?: "text" | "email" | "tel" | "number" | "password";
  autoComplete?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  description?: string;
};

export function TextFormField<T extends FieldValues>({
  name,
  label,
  placeholder,
  type = "text",
  autoComplete,
  autoFocus,
  disabled,
  description,
}: TextFormFieldProps<T>) {
  return (
    <FormField
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              type={type}
              placeholder={placeholder}
              autoComplete={autoComplete}
              autoFocus={autoFocus}
              disabled={disabled}
              {...field}
              value={field.value ?? ""}
              onChange={(e) => {
                const value =
                  type === "number"
                    ? e.target.value === ""
                      ? ""
                      : Number(e.target.value)
                    : e.target.value;
                field.onChange(value);
              }}
            />
          </FormControl>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
