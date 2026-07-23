"use client";

import { useMemo } from "react";
import type { Id } from "@/lib/convex-api";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { toLocalDateTimeInput } from "@/lib/crew-availability";
import { formatDateTime } from "@/lib/format";

export type ScheduleBlockOption = {
  _id: Id<"eventScheduleBlocks">;
  blockType: string;
  label: string;
  startsAt: number;
  endsAt: number;
};

/**
 * Schedule-block + start/end window picker used by crew availability (partial)
 * and trainee assignment. Uses SearchableSelect + DateTimePicker — do not replace
 * with native `<select>` / `datetime-local`.
 */
export function ScheduleBlockWindowFields({
  scheduleBlocks,
  scheduleBlockId,
  startsAtInput,
  endsAtInput,
  onChange,
  notes,
  onNotesChange,
  blockPlaceholder = "Link to schedule block…",
  emptyBlockLabel = "Custom times",
}: {
  scheduleBlocks: ScheduleBlockOption[];
  scheduleBlockId?: string;
  startsAtInput: string;
  endsAtInput: string;
  onChange: (next: {
    scheduleBlockId?: string;
    startsAtInput: string;
    endsAtInput: string;
  }) => void;
  notes?: string;
  onNotesChange?: (notes: string) => void;
  blockPlaceholder?: string;
  emptyBlockLabel?: string;
}) {
  const blockOptions = useMemo(
    () =>
      scheduleBlocks.map((block) => ({
        value: block._id,
        label: `${block.label} (${block.blockType})`,
        description: `${formatDateTime(block.startsAt)} – ${formatDateTime(block.endsAt, "timeOnly")}`,
      })),
    [scheduleBlocks],
  );

  function applyBlock(blockId: string) {
    const block = scheduleBlocks.find((entry) => entry._id === blockId);
    if (!block) {
      onChange({
        scheduleBlockId: blockId || undefined,
        startsAtInput,
        endsAtInput,
      });
      return;
    }
    onChange({
      scheduleBlockId: block._id,
      startsAtInput: toLocalDateTimeInput(new Date(block.startsAt)),
      endsAtInput: toLocalDateTimeInput(new Date(block.endsAt)),
    });
  }

  return (
    <div className="space-y-2">
      {blockOptions.length > 0 ? (
        <SearchableSelect
          value={scheduleBlockId ?? ""}
          onChange={applyBlock}
          options={blockOptions}
          placeholder={blockPlaceholder}
          emptyLabel={emptyBlockLabel}
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          No schedule blocks on this event — set custom start and end times below.
        </p>
      )}
      <div className="grid gap-2 md:grid-cols-2">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Start</p>
          <DateTimePicker
            value={startsAtInput}
            onChange={(value) =>
              onChange({
                scheduleBlockId,
                startsAtInput: value,
                endsAtInput,
              })
            }
          />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">End</p>
          <DateTimePicker
            value={endsAtInput}
            onChange={(value) =>
              onChange({
                scheduleBlockId,
                startsAtInput,
                endsAtInput: value,
              })
            }
          />
        </div>
      </div>
      {onNotesChange ? (
        <Input
          placeholder="Notes for this window (optional)"
          value={notes ?? ""}
          onChange={(event) => onNotesChange(event.target.value)}
        />
      ) : null}
    </div>
  );
}
