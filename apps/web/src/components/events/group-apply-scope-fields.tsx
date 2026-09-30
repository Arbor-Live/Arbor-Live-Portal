"use client";

import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import {
  formatOccurrencePreview,
  groupDayLabel,
  groupDayNoun,
  groupScopeLabels,
  type EventGroupKind,
  type SeriesEditScope,
} from "@/lib/event-series";

const SCOPE_ORDER: SeriesEditScope[] = ["all", "future", "this"];

export type GroupApplyDay = {
  _id: string;
  occurrenceIndex?: number;
  startAt: number;
};

/**
 * The one apply model for event groups: all days · this day and later ·
 * this day only. The day picker appears only when the scope needs a day.
 */
export function GroupApplyScopeFields({
  idPrefix,
  kind,
  days,
  scope,
  dayIndex,
  onScopeChange,
  onDayIndexChange,
}: {
  idPrefix: string;
  kind: EventGroupKind;
  days: GroupApplyDay[];
  scope: SeriesEditScope;
  /** 0-based `occurrenceIndex`, as a string (form value). */
  dayIndex: string;
  onScopeChange: (scope: SeriesEditScope) => void;
  onDayIndexChange: (dayIndex: string) => void;
}) {
  const labels = groupScopeLabels(kind);
  const noun = groupDayNoun(kind);
  return (
    <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="min-w-0 space-y-1">
        <Label id={`${idPrefix}-scope-label`}>Apply to</Label>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={scope}
          onValueChange={(value) => value && onScopeChange(value as SeriesEditScope)}
          aria-labelledby={`${idPrefix}-scope-label`}
          className="flex w-full flex-wrap"
          data-testid={`${idPrefix}-apply-scope`}
        >
          {SCOPE_ORDER.map((value) => (
            <ToggleGroupItem key={value} value={value} className="flex-1">
              {labels[value]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {scope !== "all" ? (
        <div
          className="min-w-0 space-y-1"
          role="group"
          aria-labelledby={`${idPrefix}-scope-day-label`}
          data-testid={`${idPrefix}-apply-day`}
        >
          <Label id={`${idPrefix}-scope-day-label`}>
            {scope === "this" ? `Which ${noun}` : `From ${noun}`}
          </Label>
          <SearchableSelect
            value={dayIndex}
            onChange={onDayIndexChange}
            options={days.map((row) => ({
              value: String(row.occurrenceIndex ?? 0),
              label: `${groupDayLabel(kind, row.occurrenceIndex)} · ${formatOccurrencePreview(row.startAt)}`,
            }))}
            placeholder={`Select ${noun}...`}
            emptyLabel={`Select ${noun}`}
          />
        </div>
      ) : null}
    </div>
  );
}
