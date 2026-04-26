"use client";

import { useRef } from "react";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";

export type TimelineBlockDraft = {
  id?: string;
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

function toLocalInput(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

function parseInputDate(value: string) {
  const date = new Date(value);
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
  const duration = Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000));
  const startGlobal = block.dayIndex * MINUTES_PER_DAY + minutesInDay(start);
  const endGlobal = startGlobal + duration;
  return { start, end, duration, startGlobal, endGlobal };
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
  onAddPreset,
}: {
  dayCount: number;
  blocks: TimelineBlockDraft[];
  onChange: (next: TimelineBlockDraft[]) => void;
  onAddPreset: (preset: "full" | "setupStrike") => void;
}) {
  const dragRef = useRef<{
    index: number;
    mode: DragMode;
    dayIndex: number;
    left: number;
    width: number;
  } | null>(null);

  const maxDerivedDay = blocks.reduce((max, block) => {
    const range = toTimelineRange(block);
    if (!range) return Math.max(max, block.dayIndex);
    const extraDays = Math.floor((range.duration + minutesInDay(range.start)) / MINUTES_PER_DAY);
    return Math.max(max, block.dayIndex + extraDays);
  }, 0);
  const safeDayCount = Math.max(1, dayCount, maxDerivedDay + 1);

  function updateBlockByGlobalRange(index: number, nextStartGlobal: number, nextEndGlobal: number) {
    const original = blocks[index];
    const originalStart = parseInputDate(original.startsAt);
    if (!originalStart) return;
    const snappedStart = snapMinutes(nextStartGlobal);
    const snappedEnd = Math.max(snappedStart + SNAP_MINUTES, snapMinutes(nextEndGlobal));
    const oldDayZero = new Date(startOfDay(originalStart).getTime() - original.dayIndex * MS_PER_DAY);
    const startDayIndex = Math.floor(snappedStart / MINUTES_PER_DAY);
    const startMinute = ((snappedStart % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    const duration = Math.max(SNAP_MINUTES, Math.round(snappedEnd - snappedStart));
    const endAbsolute = startMinute + duration;
    const endDayOffset = Math.floor(endAbsolute / MINUTES_PER_DAY);
    const endMinute = endAbsolute % MINUTES_PER_DAY;

    const nextStartDate = new Date(oldDayZero.getTime() + startDayIndex * MS_PER_DAY + startMinute * 60_000);
    const nextEndDate = new Date(
      oldDayZero.getTime() + (startDayIndex + endDayOffset) * MS_PER_DAY + endMinute * 60_000,
    );

    onChange(
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
    );
  }

  function beginDrag(index: number, mode: DragMode, dayIndex: number, clientX: number, width: number, left: number) {
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
        const nextStart = rowOffset + clamp(snappedOnRow, 0, MINUTES_PER_DAY * 2 - duration);
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
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const timeMarks = Array.from({ length: 13 }).map((_, idx) => idx * 120);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => onAddPreset("full")}>
          Quick Add: Setup + Show + Strike
        </Button>
        <Button type="button" variant="outline" onClick={() => onAddPreset("setupStrike")}>
          Quick Add: Setup + Strike Only
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            onChange([
              ...blocks,
              {
                blockType: "setup",
                label: "New block",
                dayIndex: 0,
                startsAt: "",
                endsAt: "",
                notes: "",
              },
            ])
          }
        >
          Add Block
        </Button>
      </div>

      <div className="space-y-2">
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
                    className="absolute top-0 h-full border-l border-border/50"
                    style={{ left: `${(hour / 24) * 100}%` }}
                  />
                ))}
                {segments.map((segment) => {
                  const { block, idx, overlapStart, overlapEnd } = segment;
                  const left = ((overlapStart - dayStart) / MINUTES_PER_DAY) * 100;
                  const width = ((overlapEnd - overlapStart) / MINUTES_PER_DAY) * 100;
                  return (
                    <div
                      key={`${block.id ?? "new"}-${idx}`}
                      className={`absolute overflow-hidden rounded border px-2 text-xs ${blockColor(block.blockType)}`}
                      style={{
                        top: `${segment.lane * laneHeight + 4}px`,
                        height: `${blockHeight}px`,
                        left: `${left}%`,
                        width: `${Math.max(4, width)}%`,
                      }}
                      onMouseDown={(event) => {
                        if (!(event.target instanceof HTMLElement)) return;
                        const rowRect = event.currentTarget.parentElement?.getBoundingClientRect();
                        if (!rowRect) return;
                        const target = event.target.getAttribute("data-drag-handle");
                        const mode: DragMode =
                          target === "start" ? "resizeStart" : target === "end" ? "resizeEnd" : "move";
                        beginDrag(idx, mode, dayIndex, event.clientX, rowRect.width, rowRect.left);
                        event.preventDefault();
                      }}
                    >
                      <div
                        data-drag-handle="start"
                        className="absolute left-0 top-0 z-10 h-full w-1.5 cursor-ew-resize bg-foreground/20"
                      />
                      <span className="truncate leading-[30px]">{block.label}</span>
                      <div
                        data-drag-handle="end"
                        className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-ew-resize bg-foreground/20"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        {blocks.map((block, index) => (
          <div key={block.id ?? `block-${index}`} className="grid gap-2 md:grid-cols-7">
            <SearchableSelect
              value={block.blockType}
              onChange={(value) =>
                onChange(
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
                onChange(blocks.map((row, i) => (i === index ? { ...row, label: e.target.value } : row)))
              }
            />
            <SearchableSelect
              value={String(block.dayIndex)}
              onChange={(value) =>
                onChange(blocks.map((row, i) => (i === index ? { ...row, dayIndex: Number(value) } : row)))
              }
              options={Array.from({ length: safeDayCount }).map((__, idx) => ({
                value: String(idx),
                label: `Day ${idx + 1}`,
              }))}
              placeholder="Search day..."
              emptyLabel="Select day"
            />
            <DateTimePicker
              value={block.startsAt}
              onChange={(value) =>
                onChange(blocks.map((row, i) => (i === index ? { ...row, startsAt: value } : row)))
              }
              placeholder="Block start"
            />
            <DateTimePicker
              value={block.endsAt}
              onChange={(value) =>
                onChange(blocks.map((row, i) => (i === index ? { ...row, endsAt: value } : row)))
              }
              placeholder="Block end"
            />
            <Input
              placeholder="Notes"
              value={block.notes}
              onChange={(e) =>
                onChange(blocks.map((row, i) => (i === index ? { ...row, notes: e.target.value } : row)))
              }
            />
            <Button type="button" variant="outline" onClick={() => onChange(blocks.filter((_, i) => i !== index))}>
              Remove
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
