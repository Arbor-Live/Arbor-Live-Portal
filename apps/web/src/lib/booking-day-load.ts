import {
  arborClosureForDate,
  formatDate,
  formatDateKeyRange,
  pacificDateAndTimeToMs,
  pacificDateKey,
  type ArborClosure,
} from "@/lib/format";

export type BookingDayLoadLevel = "free" | "busy" | "unavailable";

export const BOOKING_DAY_LOAD_LEGEND: Array<{
  level: BookingDayLoadLevel;
  label: string;
  className: string;
}> = [
  { level: "free", label: "Free", className: "booking-day-load-dot-free" },
  { level: "busy", label: "Busy", className: "booking-day-load-dot-busy" },
  {
    level: "unavailable",
    label: "Probably unavailable",
    className: "booking-day-load-dot-unavailable",
  },
];

export function bookingDayLoadClassName(level: BookingDayLoadLevel | undefined) {
  switch (level) {
    case "busy":
      return "booking-day-load-dot-busy";
    case "unavailable":
      return "booking-day-load-dot-unavailable";
    default:
      return "booking-day-load-dot-free";
  }
}

export function toDateInput(date: Date) {
  return pacificDateKey(date.getTime());
}

/** Parse YYYY-MM-DD as a Pacific calendar day instant. */
export function parseDateInput(value: string) {
  const ms = pacificDateAndTimeToMs(value, "12:00");
  return ms == null ? null : new Date(ms);
}

export function monthDateRange(date: Date) {
  const key = pacificDateKey(date.getTime());
  const [year, month] = key.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    rangeStart: `${year}-${String(month).padStart(2, "0")}-01`,
    rangeEnd: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function formatSelectedDateLabel(dateKey: string) {
  const ms = pacificDateAndTimeToMs(dateKey, "12:00");
  if (ms == null) return dateKey;
  return formatDate(ms);
}

export const UNAVAILABLE_DAY_WARNING =
  "This day already has several events scheduled. We may have limited availability — submit anyway and our team will follow up.";

/**
 * Requests are still accepted during Arbor closures (winter break, spring
 * break, summer), but the requester should expect we may not crew them.
 */
export function arborClosureWarning(dateKeys: string[]) {
  const closures = new Map<string, ArborClosure>();
  for (const dateKey of dateKeys) {
    const closure = dateKey ? arborClosureForDate(dateKey) : null;
    if (closure) closures.set(closure.startDate, closure);
  }
  if (closures.size === 0) return null;
  const periods = [...closures.values()]
    .map((closure) => `${closure.label} (${formatDateKeyRange(closure.startDate, closure.endDate)})`)
    .join(", ");
  return `Arbor Live is closed for ${periods}. You can still submit this request, but we may not be able to crew your event.`;
}
