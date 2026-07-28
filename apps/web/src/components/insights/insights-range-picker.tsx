"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getDefaultInsightsDateInputs } from "@/lib/insights-range";

type InsightsRangePickerProps = {
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
};

export function InsightsRangePicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: InsightsRangePickerProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">From</span>
        <Input
          type="date"
          value={startDate}
          onChange={(event) => onStartDateChange(event.target.value)}
          className="w-auto"
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">To</span>
        <Input
          type="date"
          value={endDate}
          onChange={(event) => onEndDateChange(event.target.value)}
          className="w-auto"
        />
      </label>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          const defaults = getDefaultInsightsDateInputs();
          onStartDateChange(defaults.startDate);
          onEndDateChange(defaults.endDate);
        }}
      >
        Last 12 months
      </Button>
    </div>
  );
}
