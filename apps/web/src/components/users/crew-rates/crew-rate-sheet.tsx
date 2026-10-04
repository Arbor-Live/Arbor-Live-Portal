"use client";

import { useState } from "react";
import { StatusPill } from "@/components/page-header";
import {
  DetailSheetFooter,
  DetailSheetHeader,
  SheetField,
  SheetFields,
  SheetSection,
} from "@/components/list-page";
import { roleLabel } from "@/components/users/directory/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  CREW_RATE_MODES,
  CREW_RATE_MODE_LABELS,
  CREW_RATE_MODE_TONES,
  crewRateMode,
  crewRateRoles,
  effectiveRate,
  formatHourly,
  parseRateInput,
  type CrewRateMode,
  type CrewRateRow,
  type GlobalCrewRates,
} from "@/lib/crew-rate-modes";

const PAYROLL_LABELS: Record<string, string> = {
  stanford: "Stanford payroll",
  external: "External payroll",
};

const MODE_HINTS: Record<CrewRateMode, string> = {
  normal: "Follows the global Normal rate, and moves when it changes.",
  lead: "Follows the global Lead rate, and moves when it changes.",
  custom: "A fixed hourly rate for this person. Global changes don't touch it.",
};

/**
 * The side panel body for one person. Render it keyed on the person so the
 * draft resets when another row opens. `onSave` resolves `true` on success,
 * and the page closes the panel then.
 */
export function CrewRateSheetBody({
  person,
  globals,
  onSave,
  onCancel,
}: {
  person: CrewRateRow;
  globals: GlobalCrewRates;
  onSave: (args: { rateMode: CrewRateMode; hourlyRateUsd?: number }) => Promise<boolean>;
  onCancel: () => void;
}) {
  const savedMode = crewRateMode(person);
  const [mode, setMode] = useState<CrewRateMode>(savedMode);
  const [custom, setCustom] = useState(
    String(person.customHourlyRateUsd ?? person.hourlyRateUsd ?? 0),
  );
  const [saving, setSaving] = useState(false);

  const customRate = parseRateInput(custom);
  const valid = mode !== "custom" || customRate !== null;
  // A person with no rate row yet saves even on an unchanged Custom $0, so the
  // row exists; otherwise only a real change enables Save.
  const dirty =
    person.rateMode === null ||
    mode !== savedMode ||
    (mode === "custom" && customRate !== (person.customHourlyRateUsd ?? 0));
  const preview = effectiveRate(mode, globals, customRate ?? 0);
  const roles = crewRateRoles(person.role).map(roleLabel).join(", ");

  async function save() {
    if (!valid || !dirty) return;
    setSaving(true);
    await onSave({ rateMode: mode, hourlyRateUsd: mode === "custom" ? (customRate ?? 0) : undefined });
    setSaving(false);
  }

  return (
    <form
      className="flex flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <DetailSheetHeader
        title={person.name}
        pill={<StatusPill tone={CREW_RATE_MODE_TONES[savedMode]}>{CREW_RATE_MODE_LABELS[savedMode]}</StatusPill>}
        description={[roles, person.email].filter(Boolean).join(" · ")}
      />

      <SheetSection title="Rate">
        <ToggleGroup
          type="single"
          variant="outline"
          value={mode}
          onValueChange={(value) => value && setMode(value as CrewRateMode)}
          className="flex w-full"
          aria-label="Rate mode"
        >
          {CREW_RATE_MODES.map((value) => (
            <ToggleGroupItem key={value} value={value} className="flex-1">
              {CREW_RATE_MODE_LABELS[value]}{" "}
              {value === "custom" ? null : (
                <span className="text-muted-foreground tabular-nums">
                  {formatHourly(value === "normal" ? globals.normal : globals.lead)}
                </span>
              )}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-xs text-muted-foreground">{MODE_HINTS[mode]}</p>

        {mode === "custom" ? (
          <div className="space-y-2">
            <Label htmlFor="crew-rate-custom">Custom hourly rate (USD)</Label>
            <Input
              id="crew-rate-custom"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              aria-invalid={customRate === null}
              className="max-w-40"
            />
            {customRate === null ? <p className="text-sm text-destructive">Enter a rate of $0 or more.</p> : null}
          </div>
        ) : null}

        <p className="text-sm" data-testid="crew-rate-preview">
          Effective rate: <span className="font-medium tabular-nums">{formatHourly(preview)}</span>
          {preview === 0 ? (
            <span className="ml-2 rounded-md bg-status-amber-500/15 px-2 py-0.5 text-xs text-status-amber-800 dark:text-status-amber-200">
              Nothing to pay
            </span>
          ) : null}
        </p>
      </SheetSection>

      <SheetSection title="Details">
        <SheetFields>
          <SheetField label="Saved rate">
            {person.hourlyRateUsd === null ? "Not set" : formatHourly(person.hourlyRateUsd)}
          </SheetField>
          <SheetField label="Payment">{PAYROLL_LABELS[person.payrollMethod] ?? person.payrollMethod}</SheetField>
        </SheetFields>
        <p className="text-xs text-muted-foreground">
          The rate prices this person&apos;s timecards and their crew lines on invoices.
        </p>
      </SheetSection>

      <DetailSheetFooter>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!valid || !dirty || saving}>
          {saving ? "Saving…" : "Save rate"}
        </Button>
      </DetailSheetFooter>
    </form>
  );
}
