"use client";

import { motion } from "framer-motion";
import { useFormContext, type FieldPath, type FieldValues } from "react-hook-form";
import { CheckIcon } from "@phosphor-icons/react";

type SingleChoiceFieldProps<T extends FieldValues, O extends string> = {
  name: FieldPath<T>;
  options: readonly O[];
  otherFieldName?: FieldPath<T>;
  otherTriggerValue?: O;
  otherPlaceholder?: string;
};

export function SingleChoiceField<T extends FieldValues, O extends string>({
  name,
  options,
  otherFieldName,
  otherTriggerValue,
  otherPlaceholder = "Please specify",
}: SingleChoiceFieldProps<T, O>) {
  const { watch, setValue, register, getFieldState } = useFormContext<T>();
  const value = watch(name) as O | undefined;
  const error = getFieldState(name).error?.message;
  const otherError = otherFieldName ? getFieldState(otherFieldName).error?.message : undefined;

  return (
    <div className="space-y-3">
      <div className="grid gap-2">
        {options.map((option) => {
          const selected = value === option;
          return (
            <motion.button
              key={option}
              type="button"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setValue(name, option as never, { shouldDirty: true, shouldValidate: true })}
              className={`flex w-full cursor-pointer items-start gap-3 rounded-md border p-3 text-left text-sm transition-colors ${
                selected ? "border-primary bg-primary/5" : "hover:bg-muted/40"
              }`}
            >
              <span
                className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border ${
                  selected ? "border-primary bg-primary text-primary-foreground" : ""
                }`}
              >
                {selected ? <CheckIcon className="size-3" weight="bold" /> : null}
              </span>
              <span>{option}</span>
            </motion.button>
          );
        })}
      </div>
      {otherFieldName && otherTriggerValue && value === otherTriggerValue ? (
        <div className="space-y-2">
          <input
            type="text"
            placeholder={otherPlaceholder}
            aria-invalid={Boolean(otherError)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            {...register(otherFieldName)}
          />
          {otherError ? <p className="text-sm text-destructive">{otherError}</p> : null}
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
