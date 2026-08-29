"use client";

import { motion } from "framer-motion";
import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getTurnoutTier, type BookingRequestFormValues } from "@/lib/validations/booking-request";
import { TurnoutCrowdViz } from "./turnout-crowd-viz";
import { getTurnoutEnergy, TURNOUT_VIZ_MAX } from "./turnout-layout";

export function TurnoutField() {
  const { register, watch, getFieldState } = useFormContext<BookingRequestFormValues>();
  const raw = watch("expectedTurnout");
  const count = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  const tier = getTurnoutTier(count || 1);
  const energy = getTurnoutEnergy(count || 1);
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
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-md border bg-muted/20 p-4"
      >
        <p className="text-sm font-medium">{tier.label}</p>
        <p className="text-xs text-muted-foreground">{tier.description}</p>

        <div className="mt-3 py-1">
          <TurnoutCrowdViz count={count} energy={energy} />
        </div>

        {count > TURNOUT_VIZ_MAX ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Crowd preview capped at {TURNOUT_VIZ_MAX.toLocaleString()} dots. Your entered turnout (
            {count.toLocaleString()}) is still saved.
          </p>
        ) : null}

        {count >= 200 ? (
          <p className="mt-1 text-xs text-amber-700">
            Campus sensation territory. We&apos;ll reach out with extra coordination after you submit.
          </p>
        ) : null}
      </motion.div>
    </div>
  );
}
