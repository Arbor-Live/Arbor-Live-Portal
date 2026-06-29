"use client";

import { motion } from "framer-motion";
import { useFormContext } from "react-hook-form";
import { CheckIcon } from "@phosphor-icons/react";
import {
  ADDON_SERVICE_OPTIONS,
  CREW_OR_RENTAL_OPTIONS,
  type BookingRequestFormValues,
} from "@/lib/validations/booking-request";

export function ServicesField() {
  const { watch, setValue, getFieldState } = useFormContext<BookingRequestFormValues>();
  const crewOrRental = watch("crewOrRental");
  const selected = watch("servicesNeeded") ?? [];
  const crewError = getFieldState("crewOrRental").error?.message;
  const servicesError = getFieldState("servicesNeeded").error?.message;

  function toggleService(service: (typeof ADDON_SERVICE_OPTIONS)[number]) {
    const next = selected.includes(service)
      ? selected.filter((item) => item !== service)
      : [...selected, service];
    setValue("servicesNeeded", next, { shouldDirty: true, shouldValidate: true });
    if (service === "Lighting" && next.includes("Lighting")) {
      setValue(
        "lightingPreference",
        "Standard Lighting - Some more lighting that is themed to your event, with a more reactive experience to the music",
        { shouldDirty: true },
      );
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-medium">Crewed or rental?</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {CREW_OR_RENTAL_OPTIONS.map((option) => {
            const isSelected = crewOrRental === option;
            return (
              <motion.button
                key={option}
                type="button"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setValue("crewOrRental", option, { shouldDirty: true, shouldValidate: true })}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-md border p-3 text-left text-sm ${
                  isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                }`}
              >
                <span
                  className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
                    isSelected ? "border-primary bg-primary text-primary-foreground" : ""
                  }`}
                >
                  {isSelected ? <CheckIcon className="size-3" weight="bold" /> : null}
                </span>
                <span>{option}</span>
              </motion.button>
            );
          })}
        </div>
        {crewError ? <p className="text-sm text-destructive">{crewError}</p> : null}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Production areas</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {ADDON_SERVICE_OPTIONS.map((option) => {
            const isSelected = selected.includes(option);
            return (
              <motion.button
                key={option}
                type="button"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => toggleService(option)}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-md border p-3 text-left text-sm ${
                  isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                }`}
              >
                <span
                  className={`flex size-4 shrink-0 items-center justify-center rounded-sm border ${
                    isSelected ? "border-primary bg-primary text-primary-foreground" : ""
                  }`}
                >
                  {isSelected ? <CheckIcon className="size-3" weight="bold" /> : null}
                </span>
                <span>{option}</span>
              </motion.button>
            );
          })}
        </div>
        {servicesError ? <p className="text-sm text-destructive">{servicesError}</p> : null}
      </div>
    </div>
  );
}
