"use client";

import { motion } from "framer-motion";
import { useFormContext, type FieldPath } from "react-hook-form";
import { CheckIcon } from "@phosphor-icons/react";
import type { BookingRequestFormValues } from "@/lib/validations/booking-request";

type MultiChoiceFieldProps<T extends string> = {
  name: FieldPath<BookingRequestFormValues>;
  options: readonly T[];
};

export function MultiChoiceField<T extends string>({ name, options }: MultiChoiceFieldProps<T>) {
  const {
    watch,
    setValue,
    getFieldState,
  } = useFormContext<BookingRequestFormValues>();
  const selected = (watch(name) as T[] | undefined) ?? [];
  const error = getFieldState(name).error?.message;

  function toggle(option: T) {
    const next = selected.includes(option)
      ? selected.filter((item) => item !== option)
      : [...selected, option];
    setValue(name, next as never, { shouldDirty: true, shouldValidate: true });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2">
        {options.map((option) => {
          const isSelected = selected.includes(option);
          return (
            <motion.button
              key={option}
              type="button"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => toggle(option)}
              className={`flex w-full cursor-pointer items-start gap-3 rounded-md border p-3 text-left text-sm transition-colors ${
                isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/40"
              }`}
            >
              <span
                className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm border ${
                  isSelected ? "border-primary bg-primary text-primary-foreground" : ""
                }`}
              >
                {isSelected ? (
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}>
                    <CheckIcon className="size-3" weight="bold" />
                  </motion.span>
                ) : null}
              </span>
              <span>{option}</span>
            </motion.button>
          );
        })}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
