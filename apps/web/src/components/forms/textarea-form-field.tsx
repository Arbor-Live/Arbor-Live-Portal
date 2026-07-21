"use client";

import type { FieldPath, FieldValues } from "react-hook-form";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { cn } from "@/lib/utils";

type TextareaFormFieldProps<T extends FieldValues> = {
  name: FieldPath<T>;
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
  description?: string;
  rows?: number;
};

export function TextareaFormField<T extends FieldValues>({
  name,
  label,
  placeholder,
  autoFocus,
  disabled,
  className,
  description,
  rows,
}: TextareaFormFieldProps<T>) {
  return (
    <FormField
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <textarea
              placeholder={placeholder}
              autoFocus={autoFocus}
              disabled={disabled}
              rows={rows}
              className={cn(
                "min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
                className,
              )}
              {...field}
              value={field.value ?? ""}
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
