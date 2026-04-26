"use client";

import { forwardRef, useMemo, type ComponentProps } from "react";
import DatePicker from "react-datepicker";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function toLocalDateTimeInput(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

function parseLocalDateTimeInput(value: string) {
  if (!value) return null;
  const date = new Date(value);
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
  const selected = useMemo(() => parseLocalDateTimeInput(value), [value]);

  return (
    <DatePicker
      selected={selected}
      onChange={(date: Date | null) => onChange(date ? toLocalDateTimeInput(date) : "")}
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

