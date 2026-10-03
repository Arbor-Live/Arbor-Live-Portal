"use client";

import { DatePickerField } from "@/components/ui/date-picker";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  INSIGHTS_ACADEMIC_PRESETS,
  INSIGHTS_ROLLING_PRESETS,
  insightsSelectionDateInputs,
  type InsightsRangePreset,
  type InsightsRangeSelection,
} from "@/lib/insights-range";

/**
 * Stanford periods (this / last quarter, this / last academic year), rolling
 * windows, and "Custom" with From / To pickers. Two toggle groups share one
 * selection; the period's name and dates show beside them.
 */
export function InsightsRangePicker({
  value,
  onChange,
}: {
  value: InsightsRangeSelection;
  onChange: (next: InsightsRangeSelection) => void;
}) {
  const dates = insightsSelectionDateInputs(value);
  const selected = value.kind === "custom" ? "custom" : value.preset;
  const select = (next: string) => {
    if (!next) return;
    if (next === "custom") onChange({ kind: "custom", startDate: dates.startDate, endDate: dates.endDate });
    else onChange({ kind: "preset", preset: next as InsightsRangePreset });
  };

  return (
    <div className="space-y-2" data-testid="insights-range">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={INSIGHTS_ACADEMIC_PRESETS.some((preset) => preset.id === selected) ? selected : ""}
          aria-label="Stanford calendar period"
          onValueChange={select}
        >
          {INSIGHTS_ACADEMIC_PRESETS.map((preset) => (
            <ToggleGroupItem key={preset.id} value={preset.id}>
              {preset.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={INSIGHTS_ACADEMIC_PRESETS.some((preset) => preset.id === selected) ? "" : selected}
          aria-label="Rolling or custom range"
          onValueChange={select}
        >
          {INSIGHTS_ROLLING_PRESETS.map((preset) => (
            <ToggleGroupItem key={preset.id} value={preset.id}>
              {preset.label}
            </ToggleGroupItem>
          ))}
          <ToggleGroupItem value="custom">Custom</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {value.kind === "custom" ? (
        <div className="flex flex-wrap items-center gap-2">
          <DatePickerField
            id="insights-range-from"
            aria-label="From"
            value={value.startDate}
            onChange={(startDate) => startDate && onChange({ ...value, startDate })}
            placeholder="From"
            className="w-48"
          />
          <span className="text-sm text-muted-foreground">to</span>
          <DatePickerField
            id="insights-range-to"
            aria-label="To"
            value={value.endDate}
            onChange={(endDate) => endDate && onChange({ ...value, endDate })}
            placeholder="To"
            className="w-48"
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="insights-range-dates">
          {"periodLabel" in dates && dates.periodLabel ? (
            <span className="font-medium text-foreground">{dates.periodLabel} · </span>
          ) : null}
          {formatRangeDates(dates.startDate, dates.endDate)}
        </p>
      )}
    </div>
  );
}

/** The keys are already Pacific calendar days, so format them as plain dates (UTC). */
function formatRangeDates(startDate: string, endDate: string) {
  const format = (key: string) => {
    const [year, month, day] = key.split("-").map(Number);
    return new Date(Date.UTC(year!, month! - 1, day!)).toLocaleDateString("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };
  return `${format(startDate)} – ${format(endDate)}`;
}
