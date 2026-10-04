"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseRateInput, type GlobalCrewRates } from "@/lib/crew-rate-modes";

/**
 * Edit the global Normal and Lead rates. Everyone pinned to those modes
 * follows them, so the dialog says so before the save. Closes only after the
 * save succeeds (`onSave` resolves `true`).
 */
export function GlobalRatesDialog({
  open,
  onOpenChange,
  rates,
  pinned,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rates: GlobalCrewRates;
  /** How many people are pinned to each mode, for the description. */
  pinned: { normal: number; lead: number };
  onSave: (rates: GlobalCrewRates) => Promise<boolean>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="crew-rates-global-dialog">
        {/* Remount per open, so a cancelled edit doesn't come back next time. */}
        {open ? <GlobalRatesForm rates={rates} pinned={pinned} onSave={onSave} onCancel={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function GlobalRatesForm({
  rates,
  pinned,
  onSave,
  onCancel,
}: {
  rates: GlobalCrewRates;
  pinned: { normal: number; lead: number };
  onSave: (rates: GlobalCrewRates) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [normal, setNormal] = useState(String(rates.normal));
  const [lead, setLead] = useState(String(rates.lead));
  const [saving, setSaving] = useState(false);

  const normalRate = parseRateInput(normal);
  const leadRate = parseRateInput(lead);
  const valid = normalRate !== null && leadRate !== null;
  const dirty = valid && (normalRate !== rates.normal || leadRate !== rates.lead);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid || !dirty) return;
        setSaving(true);
        void onSave({ normal: normalRate, lead: leadRate }).finally(() => setSaving(false));
      }}
    >
      <DialogHeader>
        <DialogTitle>Global crew rates</DialogTitle>
        <DialogDescription>
          {`${pinned.normal} ${pinned.normal === 1 ? "person is" : "people are"} on Normal and ${pinned.lead} on Lead, and follow these rates. Custom rates don't change. Invoice crew lines use them too, and empty-shift estimates use the average of both.`}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="crew-rates-global-normal">Normal rate (USD/h)</Label>
          <Input
            id="crew-rates-global-normal"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={normal}
            onChange={(event) => setNormal(event.target.value)}
            aria-invalid={normalRate === null}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="crew-rates-global-lead">Lead rate (USD/h)</Label>
          <Input
            id="crew-rates-global-lead"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={lead}
            onChange={(event) => setLead(event.target.value)}
            aria-invalid={leadRate === null}
          />
        </div>
      </div>
      {!valid ? <p className="text-sm text-destructive">Enter a rate of $0 or more for both.</p> : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save global rates"}
        </Button>
      </DialogFooter>
    </form>
  );
}
