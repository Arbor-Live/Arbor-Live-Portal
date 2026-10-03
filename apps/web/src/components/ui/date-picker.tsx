"use client";

import { useMemo, useState } from "react";
import { CalendarBlankIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  PORTAL_TIMEZONE,
  formatDate,
  pacificDateAndTimeToMs,
  pacificDateKey,
} from "@/lib/format";
import { cn } from "@/lib/utils";

function instantFromDateKey(value: string) {
  const ms = pacificDateAndTimeToMs(value, "12:00");
  return ms == null ? undefined : new Date(ms);
}

export function DatePickerField({
  value,
  onChange,
  placeholder,
  className,
  id,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => instantFromDateKey(value), [value]);
  const label = selected ? formatDate(selected.getTime()) : "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          id={id}
          aria-label={ariaLabel ? `${ariaLabel}: ${label || placeholder || "Pick a date"}` : undefined}
          data-empty={!value}
          data-testid="date-picker"
          data-value={value}
          className={cn(
            "w-full justify-start font-normal data-[empty=true]:text-muted-foreground",
            className,
          )}
        >
          <CalendarBlankIcon />
          {label || placeholder || "Pick a date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="z-80 w-auto overflow-hidden p-0" align="start">
        <Calendar
          mode="single"
          timeZone={PORTAL_TIMEZONE}
          noonSafe
          captionLayout="dropdown"
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            onChange(date ? pacificDateKey(date.getTime()) : "");
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
