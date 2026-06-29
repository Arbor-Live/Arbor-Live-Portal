"use client";

import { motion } from "framer-motion";
import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getTurnoutTier, type BookingRequestFormValues } from "@/lib/validations/booking-request";

function PersonDot({ index }: { index: number }) {
  return (
    <motion.span
      className="inline-block size-2 rounded-full bg-primary"
      initial={{ opacity: 0, y: 8, scale: 0.5 }}
      animate={{ opacity: 0.85, y: 0, scale: 1 }}
      transition={{ delay: index * 0.02, type: "spring", stiffness: 320, damping: 22 }}
    />
  );
}

export function TurnoutField() {
  const { register, watch, getFieldState } = useFormContext<BookingRequestFormValues>();
  const raw = watch("expectedTurnout");
  const count = Number.isFinite(raw) && raw > 0 ? raw : 0;
  const tier = getTurnoutTier(count || 1);
  const error = getFieldState("expectedTurnout").error?.message;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="expectedTurnout">Expected turnout</Label>
        <Input
          id="expectedTurnout"
          type="number"
          min={1}
          aria-invalid={Boolean(error)}
          {...register("expectedTurnout", { valueAsNumber: true })}
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      <motion.div
        key={`${tier.label}-${count}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-md border bg-muted/20 p-4"
      >
        <p className="text-sm font-medium">{tier.label}</p>
        <p className="text-xs text-muted-foreground">{tier.description}</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {Array.from({ length: tier.people }).map((_, index) => (
            <PersonDot key={index} index={index} />
          ))}
        </div>
        {count >= 200 ? (
          <p className="mt-3 text-xs text-amber-700">
            Major events require additional coordination after your request is submitted.
          </p>
        ) : null}
      </motion.div>
    </div>
  );
}
