"use client";

import { useId, useMemo, useState } from "react";
import { CalendarBlankIcon, ClockIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { DateRange } from "react-day-picker";
import {
  PORTAL_TIMEZONE,
  pacificDateKey,
  pacificDateTimeInputToMs,
  toPacificDateTimeInput,
} from "@/lib/format";
import { cn } from "@/lib/utils";

const TIME_STEP_SECONDS = 15 * 60;
const DEFAULT_RANGE_DURATION_MS = 60 * 60 * 1000;

function splitNaiveDateTime(value: string) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value.trim());
  if (!match) return { date: "", time: "" };
  return { date: match[1], time: match[2] };
}

function instantFromNaive(value: string) {
  const ms = pacificDateTimeInputToMs(value);
  return ms == null ? undefined : new Date(ms);
}

function formatInstantLabel(ms: number, timeOnly = false) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PORTAL_TIMEZONE,
    ...(timeOnly
      ? { hour: "numeric", minute: "2-digit" }
      : {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
  }).format(new Date(ms));
}

function formatDateOnly(ms: number) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PORTAL_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(ms));
}

function formatTimeOnly(ms: number) {
  return formatInstantLabel(ms, true);
}

function formatDateTimeLabel(value: string) {
  const ms = pacificDateTimeInputToMs(value);
  if (ms == null) return "";
  return `${formatTimeOnly(ms)} · ${formatDateOnly(ms)}`;
}

function formatRangeTriggerLabel(startValue: string, endValue: string) {
  const startMs = pacificDateTimeInputToMs(startValue);
  const endMs = pacificDateTimeInputToMs(endValue);
  if (startMs == null) return "";
  if (endMs == null) return formatDateTimeLabel(startValue);
  if (pacificDateKey(startMs) === pacificDateKey(endMs)) {
    return `${formatTimeOnly(startMs)} – ${formatTimeOnly(endMs)} · ${formatDateOnly(startMs)}`;
  }
  return `${formatTimeOnly(startMs)} ${formatDateOnly(startMs)} – ${formatTimeOnly(endMs)} ${formatDateOnly(endMs)}`;
}

function durationOrDefault(startValue: string, endValue: string) {
  const startMs = pacificDateTimeInputToMs(startValue);
  const endMs = pacificDateTimeInputToMs(endValue);
  if (startMs != null && endMs != null && endMs > startMs) return endMs - startMs;
  return DEFAULT_RANGE_DURATION_MS;
}

function endPreservingDuration(startValue: string, endValue: string, nextStart: string) {
  const nextStartMs = pacificDateTimeInputToMs(nextStart);
  if (nextStartMs == null) return endValue;
  return toPacificDateTimeInput(nextStartMs + durationOrDefault(startValue, endValue));
}

function snapTimeToQuarterHour(value: string) {
  const match = /^(\d{2}):(\d{2})/.exec(value.trim());
  if (!match) return value;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value;
  const snapped = Math.min(45, Math.round(minute / 15) * 15);
  return `${String(hour).padStart(2, "0")}:${String(snapped).padStart(2, "0")}`;
}

export function TimeInput({
  id,
  value,
  onChange,
  disabled,
  className,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className="relative flex min-w-0 w-full items-center">
      <ClockIcon className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" />
      <Input
        id={id}
        type="time"
        step={TIME_STEP_SECONDS}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(snapTimeToQuarterHour(event.target.value))}
        className={cn(
          "appearance-none bg-background pl-8 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none",
          className,
        )}
      />
    </div>
  );
}

export function DateTimePicker({
  value,
  onChange,
  placeholder,
  className,
  openToDate,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Naive `YYYY-MM-DDTHH:mm` used when `value` is empty so the calendar opens on the event day. */
  openToDate?: string;
}) {
  const timeFieldId = useId();
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => instantFromNaive(value), [value]);
  const defaultMonth = useMemo(
    () => selected ?? instantFromNaive(openToDate ?? ""),
    [openToDate, selected],
  );
  const { date: dateKey, time } = splitNaiveDateTime(value);
  const fallbackTime = splitNaiveDateTime(openToDate ?? "").time || "12:00";

  function commit(nextDate: string, nextTime: string) {
    if (!nextDate) {
      onChange("");
      return;
    }
    onChange(`${nextDate}T${nextTime || fallbackTime}`);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          data-empty={!value}
          data-testid="date-time-picker"
          data-value={value}
          className={cn(
            "w-full min-w-0 shrink justify-start overflow-hidden font-normal data-[empty=true]:text-muted-foreground",
            className,
          )}
        >
          <CalendarBlankIcon className="shrink-0" />
          <span className="min-w-0 truncate">
            {value ? formatDateTimeLabel(value) : (placeholder ?? "Select date")}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="z-[80] w-[19.5rem] max-w-[calc(100vw-2rem)] p-0" align="start">
        <div className="flex flex-col gap-2 border-b p-3">
          <Label htmlFor={timeFieldId}>Time</Label>
          <TimeInput
            id={timeFieldId}
            value={time || fallbackTime}
            onChange={(nextTime) => commit(dateKey || pacificDateKey(Date.now()), nextTime)}
          />
        </div>
        <Calendar
          className="w-full"
          mode="single"
          timeZone={PORTAL_TIMEZONE}
          noonSafe
          selected={selected}
          defaultMonth={defaultMonth}
          onSelect={(date) => {
            if (!date) {
              onChange("");
              return;
            }
            commit(pacificDateKey(date.getTime()), time || fallbackTime);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function defaultEndFromStart(start: string) {
  const startMs = pacificDateTimeInputToMs(start);
  if (startMs == null) return "";
  return toPacificDateTimeInput(startMs + DEFAULT_RANGE_DURATION_MS);
}

export function DateTimeRangePicker({
  startValue,
  endValue,
  onChange,
  placeholder,
  className,
  openToDate,
}: {
  startValue: string;
  endValue: string;
  onChange: (next: { start: string; end: string }) => void;
  placeholder?: string;
  className?: string;
  /** Naive `YYYY-MM-DDTHH:mm` used when `startValue` is empty so the calendar opens on the event day. */
  openToDate?: string;
}) {
  const startTimeId = useId();
  const endTimeId = useId();
  const [open, setOpen] = useState(false);
  const startSelected = useMemo(() => instantFromNaive(startValue), [startValue]);
  const endSelected = useMemo(() => instantFromNaive(endValue), [endValue]);
  const defaultMonth = useMemo(
    () => startSelected ?? instantFromNaive(openToDate ?? ""),
    [openToDate, startSelected],
  );
  const startParts = splitNaiveDateTime(startValue);
  const endParts = splitNaiveDateTime(endValue);
  const fallbackStartTime = splitNaiveDateTime(openToDate ?? "").time || "12:00";
  const startTime = startParts.time || fallbackStartTime;
  const fallbackEndTime = startParts.date
    ? splitNaiveDateTime(defaultEndFromStart(`${startParts.date}T${startTime}`)).time || "13:00"
    : "13:00";
  const endTime = endParts.time || fallbackEndTime;

  const selected: DateRange | undefined = startSelected
    ? { from: startSelected, to: endSelected ?? startSelected }
    : undefined;

  const label = formatRangeTriggerLabel(startValue, endValue);

  function commitStartTime(nextStartTime: string) {
    const startDate = startParts.date || pacificDateKey(Date.now());
    const nextStart = `${startDate}T${nextStartTime}`;
    onChange({
      start: nextStart,
      end: endPreservingDuration(startValue, endValue, nextStart),
    });
  }

  function commitEndTime(nextEndTime: string) {
    const startDate = startParts.date || pacificDateKey(Date.now());
    const endDate = endParts.date || startDate;
    const nextEnd = `${endDate}T${nextEndTime}`;
    const startMs = pacificDateTimeInputToMs(startValue || `${startDate}T${startTime}`);
    const nextEndMs = pacificDateTimeInputToMs(nextEnd);
    if (startMs != null && nextEndMs != null && nextEndMs <= startMs) {
      onChange({
        start: toPacificDateTimeInput(nextEndMs - DEFAULT_RANGE_DURATION_MS),
        end: nextEnd,
      });
      return;
    }
    onChange({
      start: startValue || `${startDate}T${startTime}`,
      end: nextEnd,
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          data-empty={!startValue}
          data-testid="date-time-range-picker"
          data-start-value={startValue}
          data-end-value={endValue}
          className={cn(
            "w-full min-w-0 shrink justify-start overflow-hidden font-normal data-[empty=true]:text-muted-foreground",
            className,
          )}
        >
          <CalendarBlankIcon className="shrink-0" />
          <span className="min-w-0 truncate">
            {label || placeholder || "Select start and end"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="z-[80] w-[19.5rem] max-w-[calc(100vw-2rem)] p-0" align="start">
        <div className="space-y-2 border-b p-3">
          <Label>Time</Label>
          <div className="flex items-center gap-2">
            <TimeInput
              id={startTimeId}
              value={startTime}
              onChange={commitStartTime}
            />
            <span className="shrink-0 text-sm text-muted-foreground">–</span>
            <TimeInput
              id={endTimeId}
              value={endTime}
              onChange={commitEndTime}
            />
          </div>
        </div>
        <Calendar
          className="w-full"
          mode="range"
          timeZone={PORTAL_TIMEZONE}
          noonSafe
          selected={selected}
          defaultMonth={defaultMonth}
          onSelect={(range) => {
            if (!range?.from) {
              onChange({ start: "", end: "" });
              return;
            }
            const fromDate = pacificDateKey(range.from.getTime());
            const nextStart = `${fromDate}T${startTime}`;
            if (!range.to) {
              onChange({
                start: nextStart,
                end: endPreservingDuration(startValue, endValue, nextStart),
              });
              return;
            }
            const toDate = pacificDateKey(range.to.getTime());
            onChange({
              start: nextStart,
              end: `${toDate}T${endTime}`,
            });
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
