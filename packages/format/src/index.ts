export const PORTAL_TIMEZONE = "America/Los_Angeles";

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const dateTimePresets = {
  short: {
    timeZone: PORTAL_TIMEZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  },
  long: {
    timeZone: PORTAL_TIMEZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  },
  timeOnly: {
    timeZone: PORTAL_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

const datePreset: Intl.DateTimeFormatOptions = {
  timeZone: PORTAL_TIMEZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
};

export function formatUsd(value: number) {
  return usdFormatter.format(value);
}

export function formatUsdOptional(value?: number | null) {
  if (value === undefined || value === null) return "-";
  return formatUsd(value);
}

export function formatDateTime(
  ms: number,
  style: keyof typeof dateTimePresets = "short",
  timezone: string = PORTAL_TIMEZONE,
) {
  const preset = dateTimePresets[style];
  return new Intl.DateTimeFormat("en-US", { ...preset, timeZone: timezone }).format(new Date(ms));
}

export function formatDate(ms: number, timezone: string = PORTAL_TIMEZONE) {
  return new Intl.DateTimeFormat("en-US", { ...datePreset, timeZone: timezone }).format(new Date(ms));
}

export function pacificDateKey(ms: number, timezone: string = PORTAL_TIMEZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

/**
 * Format an instant as a `datetime-local` value (`YYYY-MM-DDTHH:mm`) in the
 * portal timezone. Use this whenever hydrating inputs from stored ms.
 */
export function toPacificDateTimeInput(
  ms: number | Date,
  timezone: string = PORTAL_TIMEZONE,
) {
  const date = ms instanceof Date ? ms : new Date(ms);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/**
 * Parse a `datetime-local` / wall-clock string as portal timezone.
 * Accepts `YYYY-MM-DDTHH:mm` or `YYYY-MM-DDTHH:mm:ss`.
 *
 * Uses a binary search over UTC instants so wall-clock times stay correct on
 * DST transition days (unlike adding fixed hours to local midnight). Ambiguous
 * fall-back times resolve to the earlier occurrence; spring-forward gaps
 * (nonexistent local times) return null.
 */
export function pacificDateTimeInputToMs(
  value: string,
  timezone: string = PORTAL_TIMEZONE,
) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? "0");
  if (
    ![year, month, day, hour, minute, second].every((n) => Number.isFinite(n)) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }

  const target = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  // Wide UTC window covering any Pacific offset for this civil date.
  let low = Date.UTC(year, month - 1, day) - 24 * 60 * 60 * 1000;
  let high = Date.UTC(year, month - 1, day) + 48 * 60 * 60 * 1000;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (toPacificDateTimeInput(mid, timezone) < target) low = mid + 1;
    else high = mid;
  }
  if (toPacificDateTimeInput(low, timezone) !== target) {
    return null;
  }
  return low + second * 1000;
}

/** Parse `YYYY-MM-DD` + `HH:mm` as portal timezone wall clock. */
export function pacificDateAndTimeToMs(
  date: string,
  time: string,
  timezone: string = PORTAL_TIMEZONE,
) {
  if (!date || !time) return null;
  return pacificDateTimeInputToMs(`${date}T${time}`, timezone);
}

/**
 * Add civil calendar days in the portal timezone while keeping the same
 * wall-clock `HH:mm`. Unlike adding fixed milliseconds, this preserves local
 * clock time across DST transitions.
 */
export function addPacificCalendarDays(
  ms: number,
  days: number,
  timezone: string = PORTAL_TIMEZONE,
) {
  const input = toPacificDateTimeInput(ms, timezone);
  if (!input) {
    throw new Error("Invalid instant.");
  }
  const [datePart, timePart] = input.split("T");
  if (!datePart || !timePart) {
    throw new Error("Invalid Pacific datetime input.");
  }
  const [year, month, day] = datePart.split("-").map(Number);
  if (![year, month, day].every((n) => Number.isFinite(n))) {
    throw new Error("Invalid Pacific date parts.");
  }
  const nextUtc = Date.UTC(year!, month! - 1, day!) + days * 24 * 60 * 60 * 1000;
  const next = new Date(nextUtc);
  const nextDate = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
  const result = pacificDateTimeInputToMs(`${nextDate}T${timePart}`, timezone);
  if (result === null) {
    throw new Error("Failed to add Pacific calendar days.");
  }
  return result;
}

/** Add whole weeks on the Pacific civil calendar (same wall-clock time). */
export function addPacificWeeks(
  ms: number,
  weeks: number,
  timezone: string = PORTAL_TIMEZONE,
) {
  return addPacificCalendarDays(ms, weeks * 7, timezone);
}

/**
 * Series occurrence start from the template anchor, walking Pacific weeks
 * (`occurrenceIndex * intervalWeeks`) rather than fixed UTC milliseconds.
 */
export function occurrenceStartAt(
  anchorStartAt: number,
  occurrenceIndex: number,
  intervalWeeks: number,
  timezone: string = PORTAL_TIMEZONE,
) {
  if (occurrenceIndex < 0) {
    throw new Error("Occurrence index must be non-negative.");
  }
  if (intervalWeeks < 1) {
    throw new Error("Interval must be at least 1 week.");
  }
  if (occurrenceIndex === 0) return anchorStartAt;
  return addPacificWeeks(anchorStartAt, occurrenceIndex * intervalWeeks, timezone);
}

/**
 * Map an occurrence start onto the series end using the anchor pair's Pacific
 * calendar day-span and end wall-clock time (not a fixed duration in ms).
 */
export function occurrenceEndAtFromAnchor(
  startAt: number,
  anchorStartAt: number,
  anchorEndAt: number,
  timezone: string = PORTAL_TIMEZONE,
) {
  const anchorStartParts = getPacificDateParts(anchorStartAt, timezone);
  const anchorEndParts = getPacificDateParts(anchorEndAt, timezone);
  const startUtc = Date.UTC(
    anchorStartParts.year,
    anchorStartParts.month - 1,
    anchorStartParts.day,
  );
  const endUtc = Date.UTC(
    anchorEndParts.year,
    anchorEndParts.month - 1,
    anchorEndParts.day,
  );
  const daySpan = Math.round((endUtc - startUtc) / (24 * 60 * 60 * 1000));

  const endInput = toPacificDateTimeInput(anchorEndAt, timezone);
  if (!endInput) {
    throw new Error("Invalid anchor end instant.");
  }
  const endTime = endInput.slice(11);
  if (!/^\d{2}:\d{2}$/.test(endTime)) {
    throw new Error("Invalid anchor end wall-clock time.");
  }

  const startParts = getPacificDateParts(startAt, timezone);
  const endDayUtc =
    Date.UTC(startParts.year, startParts.month - 1, startParts.day) +
    daySpan * 24 * 60 * 60 * 1000;
  const endDay = new Date(endDayUtc);
  const endDate = `${endDay.getUTCFullYear()}-${String(endDay.getUTCMonth() + 1).padStart(2, "0")}-${String(endDay.getUTCDate()).padStart(2, "0")}`;
  const result = pacificDateTimeInputToMs(`${endDate}T${endTime}`, timezone);
  if (result === null) {
    throw new Error("Failed to compute occurrence end from anchor.");
  }
  return result;
}

/**
 * Calendar-day span for schedule dayIndex (America/Los_Angeles by default).
 * Count from an anchor (usually event start) to a later instant (event end,
 * or a block start/end). Overnight strike after an 11pm show end is 2 days
 * even when `events.endAt` is still the same evening — pass the block end.
 */
export function pacificScheduleDayCount(
  startMs: number,
  endMs: number,
  timezone: string = PORTAL_TIMEZONE,
) {
  const start = getPacificDateParts(startMs, timezone);
  const end = getPacificDateParts(endMs, timezone);
  const startUtc = Date.UTC(start.year, start.month - 1, start.day);
  const endUtc = Date.UTC(end.year, end.month - 1, end.day);
  const dayDiff = Math.round((endUtc - startUtc) / (24 * 60 * 60 * 1000));
  return Math.max(1, dayDiff + 1);
}

/** Max schedule dayIndex allowed for a block given the event's start anchor. */
export function pacificScheduleMaxDayIndex(
  eventStartMs: number,
  blockStartsAt: number,
  blockEndsAt: number,
  timezone: string = PORTAL_TIMEZONE,
) {
  return Math.max(
    0,
    pacificScheduleDayCount(eventStartMs, blockStartsAt, timezone) - 1,
    pacificScheduleDayCount(eventStartMs, blockEndsAt, timezone) - 1,
  );
}

/** dayIndex for a block start, relative to the event start calendar day. */
export function pacificDayIndexFromAnchor(
  eventStartMs: number,
  blockStartsAt: number,
  timezone: string = PORTAL_TIMEZONE,
) {
  return Math.max(0, pacificScheduleDayCount(eventStartMs, blockStartsAt, timezone) - 1);
}

export function formatDateTimeRange(
  startMs: number,
  endMs: number,
  timezone: string = PORTAL_TIMEZONE,
) {
  const sameDay = pacificDateKey(startMs, timezone) === pacificDateKey(endMs, timezone);
  const startLabel = formatDateTime(startMs, "long", timezone);

  if (sameDay) {
    const endTime = formatDateTime(endMs, "timeOnly", timezone);
    return `${startLabel} – ${endTime}`;
  }

  const endLabel = formatDateTime(endMs, "long", timezone);
  return `${startLabel} – ${endLabel}`;
}

export type PayPeriod = {
  startMs: number;
  endMs: number;
  dueMs: number;
  label: string;
};

function getPacificDateParts(ms: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date(ms));
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pacificDateKeyFromParts(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function pacificStartOfDayMs(
  year: number,
  month: number,
  day: number,
  timezone: string = PORTAL_TIMEZONE,
) {
  const targetKey = pacificDateKeyFromParts(year, month, day);
  let low = Date.UTC(year, month - 1, day - 1, 0, 0, 0);
  let high = Date.UTC(year, month - 1, day + 1, 0, 0, 0);
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (pacificDateKey(mid, timezone) < targetKey) low = mid + 1;
    else high = mid;
  }
  return low;
}

export function pacificEndOfDayMs(
  year: number,
  month: number,
  day: number,
  timezone: string = PORTAL_TIMEZONE,
) {
  const nextDay = day + 1;
  const nextMonth = nextDay > daysInMonth(year, month) ? month + 1 : month;
  const nextYear = nextMonth > 12 ? year + 1 : year;
  const normalizedDay = nextDay > daysInMonth(year, month) ? 1 : nextDay;
  const normalizedMonth = nextMonth > 12 ? 1 : nextMonth;
  return pacificStartOfDayMs(nextYear, normalizedMonth, normalizedDay, timezone) - 1;
}

const monthLabelFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: PORTAL_TIMEZONE,
  month: "short",
});

function formatPayPeriodLabel(
  year: number,
  month: number,
  startDay: number,
  endDay: number,
  timezone: string = PORTAL_TIMEZONE,
) {
  const monthLabel = monthLabelFormatter.format(
    new Date(pacificStartOfDayMs(year, month, startDay, timezone)),
  );
  return `${monthLabel} ${startDay}–${endDay}, ${year}`;
}

export function payPeriodForDate(ms: number, timezone: string = PORTAL_TIMEZONE): PayPeriod {
  const { year, month, day } = getPacificDateParts(ms, timezone);

  if (day <= 15) {
    return {
      startMs: pacificStartOfDayMs(year, month, 1, timezone),
      endMs: pacificEndOfDayMs(year, month, 15, timezone),
      dueMs: pacificEndOfDayMs(year, month, 15, timezone),
      label: formatPayPeriodLabel(year, month, 1, 15, timezone),
    };
  }

  const lastDay = daysInMonth(year, month);
  return {
    startMs: pacificStartOfDayMs(year, month, 16, timezone),
    endMs: pacificEndOfDayMs(year, month, lastDay, timezone),
    dueMs: pacificEndOfDayMs(year, month, lastDay, timezone),
    label: formatPayPeriodLabel(year, month, 16, lastDay, timezone),
  };
}

function previousPayPeriod(period: PayPeriod, timezone: string = PORTAL_TIMEZONE): PayPeriod {
  const anchor = period.startMs - 1;
  return payPeriodForDate(anchor, timezone);
}

export function recentPayPeriods(
  now: number,
  count: number,
  timezone: string = PORTAL_TIMEZONE,
): PayPeriod[] {
  const periods: PayPeriod[] = [];
  let current = payPeriodForDate(now, timezone);
  for (let index = 0; index < count; index += 1) {
    periods.push(current);
    current = previousPayPeriod(current, timezone);
  }
  return periods;
}

export function payPeriodStatus(
  period: PayPeriod,
  now: number,
): "open" | "due" | "past_due" {
  if (now <= period.endMs) return "open";
  if (now <= period.dueMs) return "due";
  return "past_due";
}

export {
  BOOKING_DECLINE_REASON_CODES,
  EVENT_CANCEL_REASON_CODES,
  bookingDeclineReasonLabel,
  eventCancelReasonLabel,
  type BookingDeclineReasonCode,
  type EventCancelReasonCode,
} from "./statusReasonCodes";
