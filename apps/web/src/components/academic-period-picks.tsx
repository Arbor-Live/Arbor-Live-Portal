"use client";

import { useMemo } from "react";
import { usePacificToday } from "@/hooks/use-pacific-today";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  ACADEMIC_PERIOD_LABELS,
  academicPeriod,
  type AcademicPeriod,
  type AcademicPeriodPreset,
} from "@/lib/academic-periods";

const DEFAULT_PRESETS: AcademicPeriodPreset[] = ["this-quarter", "last-quarter", "next-quarter", "this-year"];

/**
 * Stanford period shortcuts for any page with a From / To range: picking one
 * sets both dates, and the button whose dates match the current range shows
 * as selected. Presets outside the calendar's coverage are hidden.
 */
export function AcademicPeriodPicks({
  startDate,
  endDate,
  onSelect,
  presets = DEFAULT_PRESETS,
  label = "Stanford calendar period",
  className,
}: {
  /** Current range as Pacific day keys (`YYYY-MM-DD`). */
  startDate: string;
  endDate: string;
  onSelect: (period: AcademicPeriod & { preset: AcademicPeriodPreset }) => void;
  presets?: AcademicPeriodPreset[];
  label?: string;
  className?: string;
}) {
  const todayKey = usePacificToday();
  const options = useMemo(() => {
    return presets
      .map((preset) => {
        const period = academicPeriod(preset, todayKey);
        return period ? { ...period, preset } : null;
      })
      .filter((option): option is AcademicPeriod & { preset: AcademicPeriodPreset } => option !== null);
  }, [presets, todayKey]);
  const selected = options.find((option) => option.startDate === startDate && option.endDate === endDate);

  if (options.length === 0) return null;
  return (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      value={selected?.preset ?? ""}
      aria-label={label}
      className={className}
      onValueChange={(next) => {
        const option = options.find((candidate) => candidate.preset === next);
        if (option) onSelect(option);
      }}
    >
      {options.map((option) => (
        <ToggleGroupItem key={option.preset} value={option.preset} title={option.label}>
          {ACADEMIC_PERIOD_LABELS[option.preset]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
