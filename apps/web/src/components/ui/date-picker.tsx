"use client";

import { forwardRef, useMemo, type ComponentProps } from "react";
import DatePicker from "react-datepicker";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function toLocalDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDateInput(value: string) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

const DateInput = forwardRef<HTMLInputElement, ComponentProps<typeof Input>>(function DateInput(
  props,
  ref,
) {
  return (
    <Input
      ref={ref}
      {...props}
      className={cn("focus-visible:ring-0 focus-visible:border-input", props.className)}
    />
  );
});

export function DatePickerField({
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
  const selected = useMemo(() => parseLocalDateInput(value), [value]);

  return (
    <DatePicker
      selected={selected}
      onChange={(date: Date | null) => onChange(date ? toLocalDateInput(date) : "")}
      dateFormat="MMM d, yyyy"
      placeholderText={placeholder}
      customInput={<DateInput className={className} />}
      wrapperClassName="app-date-time-wrapper"
      popperClassName="app-date-time-popper"
      popperPlacement="bottom-start"
      calendarClassName="app-date-time-calendar"
      showPopperArrow={false}
      autoComplete="off"
    />
  );
}
