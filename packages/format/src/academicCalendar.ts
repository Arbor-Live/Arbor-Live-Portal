/**
 * Stanford academic calendar (quarters, breaks, no-class holidays), keyed by
 * Pacific calendar day (`YYYY-MM-DD`, see `pacificDateKey`).
 *
 * Quarter dates come from the Registrar's "Academic Calendar: 2023-24 through
 * 2033-34" (updated September 2024). No-class holidays are not in that table;
 * they follow the rules on the per-year calendars at
 * studentservices.stanford.edu (e.g. 2026-27): MLK Day, Presidents' Day,
 * Memorial Day, Independence Day (observed), Democracy Day (U.S. general
 * election day, even years), and the day before spring finals.
 * All dates are subject to change by the University; update `YEARS` when the
 * Registrar publishes a new table.
 */

export type AcademicTerm = "autumn" | "winter" | "spring" | "summer";

/** Why a day has no regular classes. */
export type NoClassKind = "break" | "holiday" | "finals";

export type NoClassDay = { kind: NoClassKind; label: string };

export type AcademicQuarter = {
  /** e.g. `2026-27-autumn` */
  id: string;
  term: AcademicTerm;
  /** e.g. `2026-27` */
  academicYear: string;
  /** e.g. `Autumn 2026` */
  label: string;
  /** First day of classes. */
  startDate: string;
  /** First and last day of end-quarter examinations. */
  finalsStartDate: string;
  finalsEndDate: string;
  /**
   * Last day this quarter owns for reporting: the day before the next quarter
   * starts, so consecutive quarters tile the year (the break after a quarter
   * counts toward it). The last covered quarter ends on its final exam day.
   */
  reportingEndDate: string;
};

export type AcademicYear = {
  /** e.g. `2026-27` */
  id: string;
  /** e.g. `2026–27` */
  label: string;
  /** First day of autumn classes. */
  startDate: string;
  /** Day before the next autumn quarter (or the last summer exam day). */
  endDate: string;
  quarters: AcademicQuarter[];
};

type YearRow = {
  startYear: number;
  /** All `MM-DD`; the year is implied by the quarter (autumn = startYear). */
  autumnStart: string;
  thanksgivingMonday: string;
  autumnFinals: [string, string];
  winterStart: string;
  winterFinals: [string, string];
  springStart: string;
  springFinals: [string, string];
  summerStart: string;
  summerFinals: [string, string];
};

// Transcribed from the Registrar's 2023-24 → 2033-34 table. Autumn 2023 and
// 2026 start on a Tuesday. The table lists 2025-26 winter exams as
// "16-Mar – 22-Mar" (a Sunday); exams run Mon–Fri, so the end is Mar 20.
const YEARS: YearRow[] = [
  { startYear: 2023, autumnStart: "09-26", thanksgivingMonday: "11-20", autumnFinals: ["12-11", "12-15"], winterStart: "01-08", winterFinals: ["03-18", "03-22"], springStart: "04-01", springFinals: ["06-07", "06-12"], summerStart: "06-24", summerFinals: ["08-16", "08-17"] },
  { startYear: 2024, autumnStart: "09-23", thanksgivingMonday: "11-25", autumnFinals: ["12-09", "12-13"], winterStart: "01-06", winterFinals: ["03-17", "03-21"], springStart: "03-31", springFinals: ["06-06", "06-11"], summerStart: "06-23", summerFinals: ["08-15", "08-16"] },
  { startYear: 2025, autumnStart: "09-22", thanksgivingMonday: "11-24", autumnFinals: ["12-08", "12-12"], winterStart: "01-05", winterFinals: ["03-16", "03-20"], springStart: "03-30", springFinals: ["06-05", "06-10"], summerStart: "06-22", summerFinals: ["08-14", "08-15"] },
  { startYear: 2026, autumnStart: "09-22", thanksgivingMonday: "11-23", autumnFinals: ["12-07", "12-11"], winterStart: "01-04", winterFinals: ["03-15", "03-19"], springStart: "03-29", springFinals: ["06-04", "06-09"], summerStart: "06-21", summerFinals: ["08-13", "08-14"] },
  { startYear: 2027, autumnStart: "09-20", thanksgivingMonday: "11-22", autumnFinals: ["12-06", "12-10"], winterStart: "01-03", winterFinals: ["03-13", "03-17"], springStart: "03-27", springFinals: ["06-02", "06-07"], summerStart: "06-19", summerFinals: ["08-11", "08-12"] },
  { startYear: 2028, autumnStart: "09-25", thanksgivingMonday: "11-20", autumnFinals: ["12-11", "12-15"], winterStart: "01-08", winterFinals: ["03-19", "03-23"], springStart: "04-02", springFinals: ["06-08", "06-13"], summerStart: "06-25", summerFinals: ["08-17", "08-18"] },
  { startYear: 2029, autumnStart: "09-24", thanksgivingMonday: "11-19", autumnFinals: ["12-10", "12-14"], winterStart: "01-07", winterFinals: ["03-18", "03-22"], springStart: "04-01", springFinals: ["06-07", "06-12"], summerStart: "06-24", summerFinals: ["08-16", "08-17"] },
  { startYear: 2030, autumnStart: "09-23", thanksgivingMonday: "11-25", autumnFinals: ["12-09", "12-13"], winterStart: "01-06", winterFinals: ["03-17", "03-21"], springStart: "03-31", springFinals: ["06-06", "06-11"], summerStart: "06-23", summerFinals: ["08-15", "08-16"] },
  { startYear: 2031, autumnStart: "09-22", thanksgivingMonday: "11-24", autumnFinals: ["12-08", "12-12"], winterStart: "01-05", winterFinals: ["03-15", "03-19"], springStart: "03-29", springFinals: ["06-04", "06-09"], summerStart: "06-21", summerFinals: ["08-13", "08-14"] },
  { startYear: 2032, autumnStart: "09-20", thanksgivingMonday: "11-22", autumnFinals: ["12-06", "12-10"], winterStart: "01-03", winterFinals: ["03-14", "03-18"], springStart: "03-28", springFinals: ["06-03", "06-08"], summerStart: "06-20", summerFinals: ["08-12", "08-13"] },
  { startYear: 2033, autumnStart: "09-26", thanksgivingMonday: "11-21", autumnFinals: ["12-12", "12-16"], winterStart: "01-09", winterFinals: ["03-20", "03-24"], springStart: "04-03", springFinals: ["06-09", "06-14"], summerStart: "06-26", summerFinals: ["08-18", "08-19"] },
];

const TERM_LABELS: Record<AcademicTerm, string> = {
  autumn: "Autumn",
  winter: "Winter",
  spring: "Spring",
  summer: "Summer",
};

const DAY_MS = 24 * 60 * 60 * 1000;

function dateKeyToUtc(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year!, month! - 1, day!);
}

function utcToDateKey(utc: number) {
  const date = new Date(utc);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/** Shift a `YYYY-MM-DD` key by whole days. */
export function addDaysToDateKey(dateKey: string, days: number) {
  return utcToDateKey(dateKeyToUtc(dateKey) + days * DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
function weekdayOf(dateKey: string) {
  return new Date(dateKeyToUtc(dateKey)).getUTCDay();
}

/** The `nth` (1-based) `weekday` of a month; `nth = -1` for the last one. */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number) {
  if (nth > 0) {
    const first = Date.UTC(year, month - 1, 1);
    const offset = (weekday - new Date(first).getUTCDay() + 7) % 7;
    return utcToDateKey(first + (offset + (nth - 1) * 7) * DAY_MS);
  }
  const last = Date.UTC(year, month, 0);
  const offset = (new Date(last).getUTCDay() - weekday + 7) % 7;
  return utcToDateKey(last - offset * DAY_MS);
}

/** A fixed-date federal holiday moved off the weekend (Sat → Fri, Sun → Mon). */
function observedDate(dateKey: string) {
  const weekday = weekdayOf(dateKey);
  if (weekday === 6) return addDaysToDateKey(dateKey, -1);
  if (weekday === 0) return addDaysToDateKey(dateKey, 1);
  return dateKey;
}

type BuiltYear = AcademicYear & { noClassRanges: Array<NoClassDay & { startDate: string; endDate: string }> };

function buildYears(): BuiltYear[] {
  const built = YEARS.map((row): BuiltYear => {
    const fall = row.startYear;
    const next = row.startYear + 1;
    const id = `${fall}-${String(next % 100).padStart(2, "0")}`;
    const date = (year: number, monthDay: string) => `${year}-${monthDay}`;
    const quarter = (
      term: AcademicTerm,
      year: number,
      start: string,
      finals: [string, string],
    ): AcademicQuarter => ({
      id: `${id}-${term}`,
      term,
      academicYear: id,
      label: `${TERM_LABELS[term]} ${year}`,
      startDate: date(year, start),
      finalsStartDate: date(year, finals[0]),
      finalsEndDate: date(year, finals[1]),
      reportingEndDate: date(year, finals[1]),
    });
    const quarters = [
      quarter("autumn", fall, row.autumnStart, row.autumnFinals),
      quarter("winter", next, row.winterStart, row.winterFinals),
      quarter("spring", next, row.springStart, row.springFinals),
      quarter("summer", next, row.summerStart, row.summerFinals),
    ];
    const [autumn, winter, spring, summer] = quarters as [
      AcademicQuarter,
      AcademicQuarter,
      AcademicQuarter,
      AcademicQuarter,
    ];
    const thanksgiving = date(fall, row.thanksgivingMonday);
    const single = (label: string, day: string) => ({ kind: "holiday" as const, label, startDate: day, endDate: day });
    const noClassRanges: BuiltYear["noClassRanges"] = [
      { kind: "break", label: "Thanksgiving recess", startDate: thanksgiving, endDate: addDaysToDateKey(thanksgiving, 6) },
      single("Martin Luther King, Jr., Day", nthWeekdayOfMonth(next, 1, 1, 3)),
      single("Presidents' Day", nthWeekdayOfMonth(next, 2, 1, 3)),
      single("Memorial Day", nthWeekdayOfMonth(next, 5, 1, -1)),
      single("Day before finals", addDaysToDateKey(spring.finalsStartDate, -1)),
      single("Independence Day", observedDate(`${next}-07-04`)),
      ...quarters.map((q) => ({
        kind: "finals" as const,
        label: `${q.label} finals`,
        startDate: q.finalsStartDate,
        endDate: q.finalsEndDate,
      })),
      { kind: "break", label: "Winter break", startDate: addDaysToDateKey(autumn.finalsEndDate, 1), endDate: addDaysToDateKey(winter.startDate, -1) },
      { kind: "break", label: "Spring break", startDate: addDaysToDateKey(winter.finalsEndDate, 1), endDate: addDaysToDateKey(spring.startDate, -1) },
      { kind: "break", label: "Between quarters", startDate: addDaysToDateKey(spring.finalsEndDate, 1), endDate: addDaysToDateKey(summer.startDate, -1) },
    ];
    if (fall % 2 === 0) {
      // Democracy Day: U.S. general election day (Tuesday after the first Monday).
      noClassRanges.push(single("Democracy Day", addDaysToDateKey(nthWeekdayOfMonth(fall, 11, 1, 1), 1)));
    }
    return {
      id,
      label: `${fall}–${String(next % 100).padStart(2, "0")}`,
      startDate: autumn.startDate,
      endDate: summer.finalsEndDate,
      quarters,
      noClassRanges,
    };
  });

  // Tile reporting ranges: each quarter runs to the day before the next one.
  const allQuarters = built.flatMap((year) => year.quarters);
  allQuarters.forEach((quarter, index) => {
    const following = allQuarters[index + 1];
    if (following) quarter.reportingEndDate = addDaysToDateKey(following.startDate, -1);
  });
  built.forEach((year, index) => {
    const following = built[index + 1];
    if (!following) return;
    year.endDate = addDaysToDateKey(following.startDate, -1);
    year.noClassRanges.push({
      kind: "break",
      label: "Summer break",
      startDate: addDaysToDateKey(year.quarters[3]!.finalsEndDate, 1),
      endDate: year.endDate,
    });
  });
  return built;
}

const BUILT_YEARS = buildYears();

export const STANFORD_ACADEMIC_YEARS: readonly AcademicYear[] = BUILT_YEARS.map(
  ({ noClassRanges: _noClassRanges, ...year }) => year,
);

export const STANFORD_QUARTERS: readonly AcademicQuarter[] = STANFORD_ACADEMIC_YEARS.flatMap(
  (year) => year.quarters,
);

/** First and last day the calendar knows about. */
export const STANFORD_CALENDAR_COVERAGE = {
  startDate: STANFORD_ACADEMIC_YEARS[0]!.startDate,
  endDate: STANFORD_ACADEMIC_YEARS[STANFORD_ACADEMIC_YEARS.length - 1]!.endDate,
};

const KIND_PRIORITY: Record<NoClassKind, number> = { holiday: 0, break: 1, finals: 2 };

/**
 * Why `dateKey` has no regular classes, or `null` for an ordinary day (and for
 * days outside the calendar's coverage). Weekends are not flagged on their
 * own — only when they fall inside a break.
 */
export function stanfordNoClassDay(dateKey: string): NoClassDay | null {
  const year = BUILT_YEARS.find((row) => row.startDate <= dateKey && dateKey <= row.endDate);
  if (!year) return null;
  const hits = year.noClassRanges
    .filter((range) => range.startDate <= dateKey && dateKey <= range.endDate)
    .sort((a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind]);
  const hit = hits[0];
  return hit ? { kind: hit.kind, label: hit.label } : null;
}

/** The quarter whose reporting range contains `dateKey`. */
export function stanfordQuarterForDate(dateKey: string): AcademicQuarter | null {
  return (
    STANFORD_QUARTERS.find(
      (quarter) => quarter.startDate <= dateKey && dateKey <= quarter.reportingEndDate,
    ) ?? null
  );
}

/** The quarter in session on `dateKey` (first day of classes through finals). */
export function stanfordQuarterInSession(dateKey: string): AcademicQuarter | null {
  return (
    STANFORD_QUARTERS.find(
      (quarter) => quarter.startDate <= dateKey && dateKey <= quarter.finalsEndDate,
    ) ?? null
  );
}

/** The quarter in session on `dateKey`, else the next one to start. */
export function stanfordCurrentOrNextQuarter(dateKey: string): AcademicQuarter | null {
  return (
    stanfordQuarterInSession(dateKey) ??
    STANFORD_QUARTERS.find((quarter) => quarter.startDate > dateKey) ??
    null
  );
}

/** The quarter `offset` quarters away from `quarter` (−1 = previous). */
export function stanfordQuarterOffset(quarter: AcademicQuarter, offset: number): AcademicQuarter | null {
  const index = STANFORD_QUARTERS.findIndex((row) => row.id === quarter.id);
  return STANFORD_QUARTERS[index + offset] ?? null;
}

export function stanfordAcademicYearForDate(dateKey: string): AcademicYear | null {
  return (
    STANFORD_ACADEMIC_YEARS.find((year) => year.startDate <= dateKey && dateKey <= year.endDate) ??
    null
  );
}

export function stanfordAcademicYearOffset(year: AcademicYear, offset: number): AcademicYear | null {
  const index = STANFORD_ACADEMIC_YEARS.findIndex((row) => row.id === year.id);
  return STANFORD_ACADEMIC_YEARS[index + offset] ?? null;
}

/** A stretch when Arbor Live is closed and doesn't staff events. */
export type ArborClosure = { label: string; startDate: string; endDate: string };

/**
 * Arbor Live closes for the long Stanford breaks — winter break, spring break,
 * and the whole summer (spring finals through the day before autumn classes,
 * summer quarter included). Thanksgiving and one-day holidays stay open.
 */
export const ARBOR_CLOSURES: readonly ArborClosure[] = BUILT_YEARS.flatMap((year, index) => {
  const [autumn, winter, spring] = year.quarters as [AcademicQuarter, AcademicQuarter, AcademicQuarter];
  const nextAutumn = BUILT_YEARS[index + 1]?.startDate;
  const summerYear = spring.startDate.slice(0, 4);
  return [
    {
      label: "Winter break",
      startDate: addDaysToDateKey(autumn.finalsEndDate, 1),
      endDate: addDaysToDateKey(winter.startDate, -1),
    },
    {
      label: "Spring break",
      startDate: addDaysToDateKey(winter.finalsEndDate, 1),
      endDate: addDaysToDateKey(spring.startDate, -1),
    },
    {
      label: `Summer ${summerYear}`,
      startDate: addDaysToDateKey(spring.finalsEndDate, 1),
      endDate: nextAutumn ? addDaysToDateKey(nextAutumn, -1) : year.endDate,
    },
  ];
});

/** The Arbor closure covering `dateKey`, if any. */
export function arborClosureForDate(dateKey: string): ArborClosure | null {
  return (
    ARBOR_CLOSURES.find((closure) => closure.startDate <= dateKey && dateKey <= closure.endDate) ??
    null
  );
}

/** Closures overlapping the inclusive `startDate`–`endDate` day range. */
export function arborClosuresInRange(startDate: string, endDate: string): ArborClosure[] {
  return ARBOR_CLOSURES.filter(
    (closure) => closure.startDate <= endDate && startDate <= closure.endDate,
  );
}

/**
 * What a calendar day means for scheduling: an Arbor closure wins over a
 * Stanford no-class reason (summer quarter has classes but Arbor is closed).
 */
export type AcademicDayNote = { kind: NoClassKind | "closed"; label: string };

export function academicDayNote(dateKey: string): AcademicDayNote | null {
  const closure = arborClosureForDate(dateKey);
  if (closure) return { kind: "closed", label: `Arbor closed · ${closure.label}` };
  return stanfordNoClassDay(dateKey);
}

/**
 * Which days a recurring series leaves out. Both modes skip Arbor closures,
 * Stanford breaks, and holidays; `breaks_and_finals` also skips exams.
 */
export type AcademicSkipMode = "breaks" | "breaks_and_finals";

export function shouldSkipForAcademicCalendar(
  dateKey: string,
  mode: AcademicSkipMode | undefined,
): AcademicDayNote | null {
  if (!mode) return null;
  const note = academicDayNote(dateKey);
  if (!note) return null;
  if (note.kind === "finals" && mode !== "breaks_and_finals") return null;
  return note;
}

const SHORT_DAY = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
const SHORT_DAY_YEAR = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** "Dec 12 – Jan 3, 2027" for an inclusive `YYYY-MM-DD` day range. */
export function formatDateKeyRange(startDate: string, endDate: string) {
  const end = SHORT_DAY_YEAR.format(new Date(dateKeyToUtc(endDate)));
  if (startDate === endDate) return end;
  return `${SHORT_DAY.format(new Date(dateKeyToUtc(startDate)))} – ${end}`;
}
