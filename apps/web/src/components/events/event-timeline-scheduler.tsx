"use client";

import { useRef } from "react";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import {
  applyScheduleBlockEndChange,
  applyScheduleBlockStartChange,
  createScheduleBlockDraft,
  getBlockRef,
  sortScheduleBlocksByTime,
} from "@/lib/event-schedule-draft";
import { localDateTimeInputToMs } from "@/lib/crew-availability";

export type TimelineBlockDraft = {
  id?: string;
  clientId?: string;
  blockType: "setup" | "show" | "strike" | "custom";
  label: string;
  dayIndex: number;
  startsAt: string;
  endsAt: string;
  notes: string;
};

const MINUTES_PER_DAY = 24 * 60;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SNAP_MINUTES = 15;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Wall-clock digits only — timezone applied when persisting via localDateTimeInputToMs. */
function toLocalInput(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

function parseInputDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function minutesInDay(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function snapMinutes(value: number) {
  return Math.round(value / SNAP_MINUTES) * SNAP_MINUTES;
}

function startMinutesFromTrackClientX(clientX: number, trackWidth: number, trackLeft: number) {
  if (trackWidth <= 0) return 0;
  const ratio = clamp((clientX - trackLeft) / trackWidth, 0, 1);
  return snapMinutes(clamp(ratio * MINUTES_PER_DAY, 0, MINUTES_PER_DAY - SNAP_MINUTES));
}

function blockColor(type: TimelineBlockDraft["blockType"]) {
  if (type === "setup") return "bg-blue-500/30 border-blue-500";
  if (type === "show") return "bg-emerald-500/30 border-emerald-500";
  if (type === "strike") return "bg-amber-500/30 border-amber-500";
  return "bg-muted border-border";
}

function toTimelineRange(block: TimelineBlockDraft) {
  const start = parseInputDate(block.startsAt);
  const end = parseInputDate(block.endsAt);
  if (!start || !end) return null;
  const startMs = localDateTimeInputToMs(block.startsAt);
  const endMs = localDateTimeInputToMs(block.endsAt);
  const durationMinutes =
    startMs != null && endMs != null
      ? Math.max(15, Math.round((endMs - startMs) / 60000))
      : Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000));
  const startGlobal = block.dayIndex * MINUTES_PER_DAY + minutesInDay(start);
  const endGlobal = startGlobal + durationMinutes;
  return { start, end, duration: durationMinutes, startGlobal, endGlobal };
}

type DragMode = "move" | "resizeStart" | "resizeEnd";
type DaySegment = {
  idx: number;
  block: TimelineBlockDraft;
  overlapStart: number;
  overlapEnd: number;
  lane: number;
};

export function EventTimelineScheduler({
  dayCount,
  blocks,
  onChange,
  onQuickAdd,
  quickAddLabel,
  quickAddDisabled,
  quickAddDisabledReason,
  readOnly = false,
  anchorStartsAt,
}: {
  dayCount: number;
  blocks: TimelineBlockDraft[];
  onChange: (next: TimelineBlockDraft[]) => void;
  onQuickAdd: () => void;
  quickAddLabel: string;
  quickAddDisabled?: boolean;
  quickAddDisabledReason?: string;
  readOnly?: boolean;
  /** Event start as Pacific wall-clock `YYYY-MM-DDTHH:mm` — new blocks use this Day 1 date. */
  anchorStartsAt?: string;
}) {
  const dragRef = useRef<{
    index: number;
    mode: DragMode;
    dayIndex: number;
    left: number;
    width: number;
  } | null>(null);
  const latestBlocksRef = useRef(blocks);

  function emit(next: TimelineBlockDraft[], sort = true) {
    const out = sort ? sortScheduleBlocksByTime(next) : next;
    latestBlocksRef.current = out;
    onChange(out);
  }

  const canCreateOnEventDay = Boolean(anchorStartsAt && localDateTimeInputToMs(anchorStartsAt) != null);

  const maxDerivedDay = blocks.reduce((max, block) => {
    const range = toTimelineRange(block);
    if (!range) return Math.max(max, block.dayIndex);
    const extraDays = Math.floor((range.duration + minutesInDay(range.start)) / MINUTES_PER_DAY);
    return Math.max(max, block.dayIndex + extraDays);
  }, 0);
  /** Day rows to render — grows when blocks spill past midnight after show end. */
  const safeDayCount = Math.max(1, dayCount, maxDerivedDay + 1);
  /** Drag/select may use any rendered day (including overnight strike spill). */
  const allowedDayCount = safeDayCount;
  const maxGlobalMinutes = allowedDayCount * MINUTES_PER_DAY;

  function updateBlockByGlobalRange(index: number, nextStartGlobal: number, nextEndGlobal: number) {
    const original = blocks[index];
    const originalStart = parseInputDate(original.startsAt);
    if (!originalStart) return;
    const snappedStart = snapMinutes(clamp(nextStartGlobal, 0, maxGlobalMinutes - SNAP_MINUTES));
    const snappedEnd = Math.max(
      snappedStart + SNAP_MINUTES,
      snapMinutes(clamp(nextEndGlobal, snappedStart + SNAP_MINUTES, maxGlobalMinutes * 2)),
    );
    const oldDayZero = new Date(startOfDay(originalStart).getTime() - original.dayIndex * MS_PER_DAY);
    const startDayIndex = Math.min(
      allowedDayCount - 1,
      Math.max(0, Math.floor(snappedStart / MINUTES_PER_DAY)),
    );
    const startMinute = ((snappedStart % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    const duration = Math.max(SNAP_MINUTES, Math.round(snappedEnd - snappedStart));
    const endAbsolute = startMinute + duration;
    const endDayOffset = Math.floor(endAbsolute / MINUTES_PER_DAY);
    const endMinute = endAbsolute % MINUTES_PER_DAY;

    const nextStartDate = new Date(oldDayZero.getTime() + startDayIndex * MS_PER_DAY + startMinute * 60_000);
    const nextEndDate = new Date(
      oldDayZero.getTime() + (startDayIndex + endDayOffset) * MS_PER_DAY + endMinute * 60_000,
    );

    emit(
      blocks.map((row, i) =>
        i === index
          ? {
              ...row,
              dayIndex: startDayIndex,
              startsAt: toLocalInput(nextStartDate),
              endsAt: toLocalInput(nextEndDate),
            }
          : row,
      ),
      false,
    );
  }

  function beginDrag(index: number, mode: DragMode, dayIndex: number, clientX: number, width: number, left: number) {
    latestBlocksRef.current = blocks;
    dragRef.current = { index, mode, dayIndex, left, width };
    const onMove = (event: MouseEvent) => {
      const state = dragRef.current;
      if (!state) return;
      const range = toTimelineRange(blocks[state.index]);
      if (!range) return;
      const rawMinutes = ((event.clientX - state.left) / state.width) * MINUTES_PER_DAY;
      const snappedOnRow = snapMinutes(rawMinutes);
      const rowOffset = state.dayIndex * MINUTES_PER_DAY;
      if (state.mode === "move") {
        const duration = range.endGlobal - range.startGlobal;
        const nextStart = rowOffset + clamp(snappedOnRow, 0, maxGlobalMinutes - rowOffset - duration);
        updateBlockByGlobalRange(state.index, nextStart, nextStart + duration);
        return;
      }
      if (state.mode === "resizeStart") {
        const nextStart = rowOffset + clamp(snappedOnRow, 0, range.endGlobal - rowOffset - SNAP_MINUTES);
        updateBlockByGlobalRange(state.index, nextStart, range.endGlobal);
        return;
      }
      const nextEnd = rowOffset + Math.max(snappedOnRow, range.startGlobal - rowOffset + SNAP_MINUTES);
      updateBlockByGlobalRange(state.index, range.startGlobal, nextEnd);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      emit(latestBlocksRef.current);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const timeMarks = Array.from({ length: 13 }).map((_, idx) => idx * 120);

  return (
    <div className="space-y-3">
      {!readOnly ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={quickAddDisabled}
            title={quickAddDisabled ? quickAddDisabledReason : undefined}
            className={quickAddDisabled ? "opacity-40 blur-[0.5px]" : undefined}
            onClick={onQuickAdd}
          >
            {quickAddLabel}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canCreateOnEventDay}
            title={
              canCreateOnEventDay
                ? undefined
                : "Set event start first."
            }
            className={!canCreateOnEventDay ? "opacity-40 blur-[0.5px]" : undefined}
            onClick={() => {
              if (!anchorStartsAt) return;
              const next = createScheduleBlockDraft({ anchorStartsAt });
              if (!next) return;
              emit([...blocks, next]);
            }}
          >
            Add Block
          </Button>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="px-3">
          <div className="relative h-5 rounded border bg-muted/30">
            {timeMarks.map((mark) => (
              <div
                key={`time-${mark}`}
                className="absolute top-0 -translate-x-1/2 text-[10px] text-muted-foreground"
                style={{ left: `${(mark / MINUTES_PER_DAY) * 100}%` }}
              >
                {String(Math.floor(mark / 60)).padStart(2, "0")}:00
              </div>
            ))}
          </div>
        </div>
        {Array.from({ length: safeDayCount }).map((_, dayIndex) => {
          const dayStart = dayIndex * MINUTES_PER_DAY;
          const dayEnd = dayStart + MINUTES_PER_DAY;
          const segments: DaySegment[] = [];
          for (let idx = 0; idx < blocks.length; idx += 1) {
            const block = blocks[idx];
            const range = toTimelineRange(block);
            if (!range) continue;
            const overlapStart = Math.max(range.startGlobal, dayStart);
            const overlapEnd = Math.min(range.endGlobal, dayEnd);
            if (overlapEnd - overlapStart <= 0) continue;
            segments.push({ idx, block, overlapStart, overlapEnd, lane: 0 });
          }
          segments.sort((a, b) => a.overlapStart - b.overlapStart || a.overlapEnd - b.overlapEnd);
          const laneEnds: number[] = [];
          for (const segment of segments) {
            let laneIndex = laneEnds.findIndex((laneEnd) => laneEnd <= segment.overlapStart);
            if (laneIndex < 0) {
              laneIndex = laneEnds.length;
              laneEnds.push(segment.overlapEnd);
            } else {
              laneEnds[laneIndex] = segment.overlapEnd;
            }
            segment.lane = laneIndex;
          }
          const laneCount = Math.max(1, laneEnds.length);
          const laneHeight = 36;
          const blockHeight = 30;
          return (
            <div key={`day-${dayIndex}`} className="rounded-md border p-3">
              <p className="mb-2 text-sm font-medium">Day {dayIndex + 1}</p>
              <div
                className="relative rounded bg-muted/40"
                style={{ height: `${laneCount * laneHeight + 8}px` }}
              >
                {Array.from({ length: 24 }).map((__, hour) => (
                  <div
                    key={`grid-${dayIndex}-${hour}`}
                    className="pointer-events-none absolute top-0 h-full border-l border-border/50"
                    style={{ left: `${(hour / 24) * 100}%` }}
                  />
                ))}
                {!readOnly && canCreateOnEventDay && anchorStartsAt ? (
                  <div
                    className="absolute inset-0 z-0"
                    onDoubleClick={(event) => {
                      event.preventDefault();
                      const rect = event.currentTarget.getBoundingClientRect();
                      const startMinutesInDay = startMinutesFromTrackClientX(
                        event.clientX,
                        rect.width,
                        rect.left,
                      );
                      const next = createScheduleBlockDraft({
                        anchorStartsAt,
                        dayIndex,
                        startMinutesInDay,
                      });
                      if (!next) return;
                      emit([...blocks, next]);
                    }}
                  />
                ) : null}
                {segments.map((segment) => {
                  const { block, idx, overlapStart, overlapEnd } = segment;
                  const left = ((overlapStart - dayStart) / MINUTES_PER_DAY) * 100;
                  const width = ((overlapEnd - overlapStart) / MINUTES_PER_DAY) * 100;
                  return (
                    <div
                      key={getBlockRef(block) ?? `block-${idx}`}
                      data-schedule-block=""
                      className={`absolute z-10 overflow-hidden rounded border px-2 text-xs ${blockColor(block.blockType)}`}
                      style={{
                        top: `${segment.lane * laneHeight + 4}px`,
                        height: `${blockHeight}px`,
                        left: `${left}%`,
                        width: `${Math.max(4, width)}%`,
                      }}
                      onMouseDown={
                        readOnly
                          ? undefined
                          : (event) => {
                              if (!(event.target instanceof HTMLElement)) return;
                              const rowRect = event.currentTarget.parentElement?.getBoundingClientRect();
                              if (!rowRect) return;
                              const target = event.target.getAttribute("data-drag-handle");
                              const mode: DragMode =
                                target === "start" ? "resizeStart" : target === "end" ? "resizeEnd" : "move";
                              beginDrag(idx, mode, dayIndex, event.clientX, rowRect.width, rowRect.left);
                              event.preventDefault();
                            }
                      }
                    >
                      {!readOnly ? (
                        <div
                          data-drag-handle="start"
                          className="absolute left-0 top-0 z-10 h-full w-1.5 cursor-ew-resize bg-foreground/20"
                        />
                      ) : null}
                      <span className="truncate leading-[30px]">{block.label}</span>
                      {!readOnly ? (
                        <div
                          data-drag-handle="end"
                          className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-ew-resize bg-foreground/20"
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {!readOnly ? (
      <div className="space-y-2">
        {blocks.map((block, index) => (
          <div key={getBlockRef(block) ?? `block-${index}`} className="grid gap-2 md:grid-cols-7">
            <SearchableSelect
              value={block.blockType}
              onChange={(value) =>
                emit(
                  blocks.map((row, i) =>
                    i === index ? { ...row, blockType: value as TimelineBlockDraft["blockType"] } : row,
                  ),
                )
              }
              options={[
                { value: "setup", label: "setup" },
                { value: "show", label: "show" },
                { value: "strike", label: "strike" },
                { value: "custom", label: "custom" },
              ]}
              placeholder="Search block type..."
              emptyLabel="Select block type"
            />
            <Input
              value={block.label}
              onChange={(e) =>
                emit(blocks.map((row, i) => (i === index ? { ...row, label: e.target.value } : row)))
              }
            />
            <SearchableSelect
              value={String(Math.min(block.dayIndex, allowedDayCount - 1))}
              onChange={(value) => {
                const nextDayIndex = clamp(Number(value), 0, allowedDayCount - 1);
                emit(
                  blocks.map((row, i) => {
                    if (i !== index) return row;
                    const deltaDays = nextDayIndex - row.dayIndex;
                    if (deltaDays === 0) return { ...row, dayIndex: nextDayIndex };
                    const shift = (input: string) => {
                      const date = parseInputDate(input);
                      if (!date) return input;
                      return toLocalInput(new Date(date.getTime() + deltaDays * MS_PER_DAY));
                    };
                    return {
                      ...row,
                      dayIndex: nextDayIndex,
                      startsAt: shift(row.startsAt),
                      endsAt: shift(row.endsAt),
                    };
                  }),
                );
              }}
              options={Array.from({ length: allowedDayCount }).map((__, idx) => ({
                value: String(idx),
                label: `Day ${idx + 1}`,
              }))}
              placeholder="Search day..."
              emptyLabel="Select day"
            />
            <DateTimePicker
              value={block.startsAt}
              openToDate={anchorStartsAt}
              onChange={(value) =>
                emit(blocks.map((row, i) => (i === index ? applyScheduleBlockStartChange(row, value) : row)))
              }
              placeholder="Block start"
            />
            <DateTimePicker
              value={block.endsAt}
              openToDate={anchorStartsAt}
              onChange={(value) =>
                emit(blocks.map((row, i) => (i === index ? applyScheduleBlockEndChange(row, value) : row)))
              }
              placeholder="Block end"
            />
            <Input
              placeholder="Notes"
              value={block.notes}
              onChange={(e) =>
                emit(blocks.map((row, i) => (i === index ? { ...row, notes: e.target.value } : row)))
              }
            />
            <Button type="button" variant="outline" onClick={() => emit(blocks.filter((_, i) => i !== index))}>
              Remove
            </Button>
          </div>
        ))}
      </div>
      ) : null}
    </div>
  );
}
