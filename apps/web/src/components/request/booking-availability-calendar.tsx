"use client";

import { memo, useMemo, useState, type ComponentProps } from "react";
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

type DayLoadMap = Record<string, { count: number; level: "free" | "busy" | "unavailable" }>;

const pacificDateKeyCache = new Map<number, string>();

function calendarPacificDateKey(ms: number): string {
  const cached = pacificDateKeyCache.get(ms);
  if (cached !== undefined) return cached;
  const key = pacificDateKey(ms);
  pacificDateKeyCache.set(ms, key);
  return key;
}

const BookingCalendarDayButton = memo(function BookingCalendarDayButton({
  day,
  modifiers,
  children,
  dayLoad,
  ...props
}: ComponentProps<typeof CalendarDayButton> & { dayLoad: DayLoadMap | undefined }) {
  const dateKey = calendarPacificDateKey(day.date.getTime());
  const level = dayLoad?.[dateKey]?.level ?? "free";

  return (
    <CalendarDayButton day={day} modifiers={modifiers} {...props}>
      {children}
      {!modifiers.outside ? (
        <span
          className={cn(
            "booking-day-load-dot",
            modifiers.selected ? "booking-day-load-dot-selected" : bookingDayLoadClassName(level),
          )}
          aria-hidden
        />
      ) : null}
    </CalendarDayButton>
  );
});

export const BookingAvailabilityCalendar = memo(function BookingAvailabilityCalendar({
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

  const dayButtonComponent = useMemo(
    () =>
      function DayButton(props: ComponentProps<typeof CalendarDayButton>) {
        return <BookingCalendarDayButton {...props} dayLoad={dayLoad} />;
      },
    [dayLoad],
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
            onSelectDate(calendarPacificDateKey(date.getTime()));
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
            DayButton: dayButtonComponent,
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
});

export function getDayLoadLevel(dayLoad: DayLoadMap | undefined, dateKey: string) {
  return dayLoad?.[dateKey]?.level ?? "free";
}
