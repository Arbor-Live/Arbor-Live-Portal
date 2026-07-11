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
