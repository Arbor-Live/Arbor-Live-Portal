"use client";

import { DatePickerField } from "@/components/ui/date-picker";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  INSIGHTS_RANGE_PRESETS,
  insightsSelectionDateInputs,
  type InsightsRangePreset,
  type InsightsRangeSelection,
} from "@/lib/insights-range";

/** Presets as a toggle; "Custom" adds From / To pickers. */
export function InsightsRangePicker({
  value,
  onChange,
}: {
  value: InsightsRangeSelection;
  onChange: (next: InsightsRangeSelection) => void;
}) {
  const dates = insightsSelectionDateInputs(value);
  const toggleValue = value.kind === "custom" ? "custom" : value.preset;

  return (
    <div className="flex flex-wrap items-center gap-3" data-testid="insights-range">
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        value={toggleValue}
        aria-label="Date range"
        onValueChange={(next) => {
          if (!next) return;
          if (next === "custom") {
            onChange({ kind: "custom", ...dates });
          } else {
            onChange({ kind: "preset", preset: next as InsightsRangePreset });
          }
        }}
      >
        {INSIGHTS_RANGE_PRESETS.map((preset) => (
          <ToggleGroupItem key={preset.id} value={preset.id}>
            {preset.label}
          </ToggleGroupItem>
        ))}
        <ToggleGroupItem value="custom">Custom</ToggleGroupItem>
      </ToggleGroup>
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
        <span className="text-sm text-muted-foreground" data-testid="insights-range-dates">
          {formatRangeDates(dates.startDate, dates.endDate)}
        </span>
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
