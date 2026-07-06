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
