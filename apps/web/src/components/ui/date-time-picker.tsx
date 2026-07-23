"use client";

import { forwardRef, useMemo, type ComponentProps } from "react";
import DatePicker from "react-datepicker";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Format picker Date → wall-clock string (digits only; timezone applied on save). */
function toNaiveDateTimeInput(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

/** Parse wall-clock string into a Date whose local components match (picker UI). */
function parseNaiveDateTimeInput(value: string) {
  if (!value) return null;
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

const DateTimeInput = forwardRef<HTMLInputElement, ComponentProps<typeof Input>>(function DateTimeInput(
  props,
  ref,
) {
  return (
    <Input
      ref={ref}
      {...props}
      className={cn(
        "focus-visible:ring-0 focus-visible:border-input",
        props.className,
      )}
    />
  );
});

export function DateTimePicker({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const selected = useMemo(() => parseNaiveDateTimeInput(value), [value]);

  return (
    <DatePicker
      selected={selected}
      onChange={(date: Date | null) => onChange(date ? toNaiveDateTimeInput(date) : "")}
      showTimeSelect
      timeIntervals={15}
      dateFormat="yyyy-MM-dd HH:mm"
      placeholderText={placeholder}
      customInput={<DateTimeInput className={className} />}
      wrapperClassName="app-date-time-wrapper"
      popperClassName="app-date-time-popper"
      popperPlacement="bottom-start"
      calendarClassName="app-date-time-calendar"
      showPopperArrow={false}
      timeCaption="Time"
      autoComplete="off"
    />
  );
}
