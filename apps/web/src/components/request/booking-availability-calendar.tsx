"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { api } from "@/lib/convex-api";
import {
  BOOKING_DAY_LOAD_LEGEND,
  bookingDayLoadClassName,
  monthDateRange,
  parseDateInput,
} from "@/lib/booking-day-load";
import { PORTAL_TIMEZONE, pacificDateAndTimeToMs, pacificDateKey } from "@/lib/format";
import { cn } from "@/lib/utils";

export function BookingAvailabilityCalendar({
  selectedDate,
  highlightedDates = [],
  onSelectDate,
  minDate = new Date(),
}: {
  selectedDate: string;
  highlightedDates?: string[];
  onSelectDate: (dateKey: string) => void;
  minDate?: Date;
}) {
  const selected = useMemo(() => parseDateInput(selectedDate) ?? undefined, [selectedDate]);
  const [visibleMonth, setVisibleMonth] = useState(() => selected ?? minDate);
  const { rangeStart, rangeEnd } = useMemo(() => monthDateRange(visibleMonth), [visibleMonth]);
  const dayLoad = useQuery(api.eventRequests.getPublicBookingDayLoad, { rangeStart, rangeEnd });
  const highlighted = useMemo(
    () =>
      highlightedDates
        .map((dateKey) => {
          const ms = pacificDateAndTimeToMs(dateKey, "12:00");
          return ms == null ? undefined : new Date(ms);
        })
        .filter((date): date is Date => date != null),
    [highlightedDates],
  );

  return (
    <div className="booking-availability-calendar">
      <div className="booking-availability-calendar-shell">
        <Calendar
          mode="single"
          timeZone={PORTAL_TIMEZONE}
          noonSafe
          selected={selected}
          month={visibleMonth}
          onMonthChange={setVisibleMonth}
          onSelect={(date) => {
            if (!date) return;
            onSelectDate(pacificDateKey(date.getTime()));
          }}
          disabled={{ before: minDate }}
          modifiers={{ highlighted }}
          modifiersClassNames={{
            highlighted: "ring-1 ring-primary/50",
          }}
          className="w-full bg-transparent p-3 [--cell-size:--spacing(11)]"
          classNames={{
            root: "w-full",
            months: "w-full",
            month: "w-full",
            month_grid: "w-full",
          }}
          components={{
            DayButton: ({ day, modifiers, children, ...props }) => {
              const dateKey = pacificDateKey(day.date.getTime());
              const level = dayLoad?.[dateKey]?.level ?? "free";
              return (
                <CalendarDayButton day={day} modifiers={modifiers} {...props}>
                  {children}
                  {!modifiers.outside ? (
                    <span
                      className={cn(
                        "booking-day-load-dot",
                        modifiers.selected
                          ? "booking-day-load-dot-selected"
                          : bookingDayLoadClassName(level),
                      )}
                      aria-hidden
                    />
                  ) : null}
                </CalendarDayButton>
              );
            },
          }}
        />

        <div className="booking-availability-legend">
          {BOOKING_DAY_LOAD_LEGEND.map((item) => (
            <span key={item.level} className="booking-availability-legend-item">
              <span className={cn("booking-day-load-dot", item.className)} aria-hidden />
              {item.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function getDayLoadLevel(
  dayLoad: Record<string, { count: number; level: "free" | "busy" | "unavailable" }> | undefined,
  dateKey: string,
) {
  return dayLoad?.[dateKey]?.level ?? "free";
}
