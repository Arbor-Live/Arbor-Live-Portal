import { addDaysToDateKey, pacificDateAndTimeToMs, toPacificDateTimeInput } from "@arbor/format";
import { crewSections } from "./crewAvailability";
import type { ScheduleBlockType } from "./scheduleBlockTypes";

/**
 * Crew availability is physical time on the person, answered per *night*
 * (`crewAvailabilityNights`), not per event. Everything here is pure so the
 * staff-side compatibility layer, the crew inbox, and the legacy conversion
 * share one set of rules.
 */

export type TimeWindow = { startsAt: number; endsAt: number };

export type NightStatus = "free" | "partial" | "backup" | "no";
export type UsualLevel = "usually" | "sometimes" | "rarely";

export const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** The evenings everyone is asked about once; people may add other weekdays. */
export const ASKED_WEEKDAYS: readonly Weekday[] = ["thursday", "friday", "saturday"];

export type UsualEvenings = Partial<Record<Weekday, UsualLevel>>;

/** Starts before this hour belong to the night before (they're after midnight). */
export const NIGHT_ENDS_HOUR = 6;

const NIGHT_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isNightKey(value: string) {
  if (!NIGHT_KEY_PATTERN.test(value)) return false;
  return pacificDateAndTimeToMs(value, "12:00") !== null;
}

/**
 * The night an instant belongs to: its Pacific calendar day, except that
 * anything before 6 AM is still the night before (a show past midnight stays
 * on the night it started).
 */
export function nightKeyForStart(ms: number) {
  const input = toPacificDateTimeInput(ms);
  const dateKey = input.slice(0, 10);
  const hour = Number(input.slice(11, 13));
  return hour < NIGHT_ENDS_HOUR ? addDaysToDateKey(dateKey, -1) : dateKey;
}

/** The instants a night key covers: 6 AM that day to 6 AM the next. */
export function nightBounds(nightKey: string): TimeWindow {
  const startsAt = pacificDateAndTimeToMs(nightKey, "06:00");
  const endsAt = pacificDateAndTimeToMs(addDaysToDateKey(nightKey, 1), "06:00");
  if (startsAt === null || endsAt === null) throw new Error(`Invalid night key: ${nightKey}`);
  return { startsAt, endsAt };
}

export function weekdayOfNightKey(nightKey: string): Weekday {
  return WEEKDAYS[new Date(`${nightKey}T12:00:00Z`).getUTCDay()]!;
}

type SectionLike = {
  _id: string;
  blockType: ScheduleBlockType;
  label: string;
  startsAt: number;
  endsAt: number;
};

type EventLike = { startAt: number; endAt: number };

/** The night an event belongs to (its start, with the past-midnight rule). */
export function nightKeyForEvent(event: EventLike) {
  return nightKeyForStart(event.startAt);
}

/**
 * When crew are needed for one event: the earliest crew section (setup, early
 * setup, a daytime load-in) to the last section or the event's end, whichever
 * is later. Falls back to the event's own start and end.
 */
export function eventCrewSpan(event: EventLike, blocks: SectionLike[]): TimeWindow {
  const sections = crewSections(blocks);
  return {
    startsAt: Math.min(event.startAt, ...sections.map((section) => section.startsAt)),
    endsAt: Math.max(event.endAt, ...sections.map((section) => section.endsAt)),
  };
}

/** One night's span across its events: earliest crew call to the last end. */
export function nightSpan(spans: TimeWindow[]): TimeWindow | null {
  if (spans.length === 0) return null;
  return {
    startsAt: Math.min(...spans.map((span) => span.startsAt)),
    endsAt: Math.max(...spans.map((span) => span.endsAt)),
  };
}

/** A setup section added by "Early setup…" (`planEarlySetup` on the web). */
export function isEarlySetupSection(block: Pick<SectionLike, "blockType" | "label">) {
  return block.blockType === "setup" && block.label.trim().toLowerCase().startsWith("early setup");
}

/** Early setup windows on these blocks, merged. */
export function earlySetupWindows(blocks: SectionLike[]): TimeWindow[] {
  return mergeWindows(
    crewSections(blocks)
      .filter(isEarlySetupSection)
      .map((block) => ({ startsAt: block.startsAt, endsAt: block.endsAt })),
  );
}

// ---------------------------------------------------------------------------
// Window math
// ---------------------------------------------------------------------------

/** Sorted, non-overlapping union (touching windows join). Empty windows drop. */
export function mergeWindows(windows: TimeWindow[]): TimeWindow[] {
  const sorted = windows
    .filter((window) => window.endsAt > window.startsAt)
    .map((window) => ({ startsAt: window.startsAt, endsAt: window.endsAt }))
    .sort((a, b) => a.startsAt - b.startsAt);
  const merged: TimeWindow[] = [];
  for (const window of sorted) {
    const last = merged[merged.length - 1];
    if (last && window.startsAt <= last.endsAt) {
      last.endsAt = Math.max(last.endsAt, window.endsAt);
    } else {
      merged.push(window);
    }
  }
  return merged;
}

/** `from` with every `minus` window cut out. */
export function subtractWindows(from: TimeWindow[], minus: TimeWindow[]): TimeWindow[] {
  let remaining = mergeWindows(from);
  for (const cut of mergeWindows(minus)) {
    remaining = remaining.flatMap((window) => {
      if (cut.endsAt <= window.startsAt || cut.startsAt >= window.endsAt) return [window];
      const pieces: TimeWindow[] = [];
      if (cut.startsAt > window.startsAt) pieces.push({ startsAt: window.startsAt, endsAt: cut.startsAt });
      if (cut.endsAt < window.endsAt) pieces.push({ startsAt: cut.endsAt, endsAt: window.endsAt });
      return pieces;
    });
  }
  return remaining;
}

/** The parts of `windows` inside `to`. */
export function clipWindows(windows: TimeWindow[], to: TimeWindow): TimeWindow[] {
  return mergeWindows(
    windows.map((window) => ({
      startsAt: Math.max(window.startsAt, to.startsAt),
      endsAt: Math.min(window.endsAt, to.endsAt),
    })),
  );
}

/** How much of `target` the windows cover, in ms. */
export function coveredMs(windows: TimeWindow[], target: TimeWindow) {
  return clipWindows(windows, target).reduce((sum, window) => sum + window.endsAt - window.startsAt, 0);
}

export function windowsCover(windows: TimeWindow[], target: TimeWindow) {
  return coveredMs(windows, target) >= target.endsAt - target.startsAt;
}

// ---------------------------------------------------------------------------
// Night answers
// ---------------------------------------------------------------------------

export type NightAnswer = {
  status: NightStatus;
  /** `free`: the night span when answered. `partial`: the free parts. Else empty. */
  windows: TimeWindow[];
  notes?: string;
  respondedAt: number;
};

/** Most available first. */
export const NIGHT_STATUS_RANK: Record<NightStatus, number> = {
  free: 0,
  partial: 1,
  backup: 2,
  no: 3,
};

function joinNotes(...notes: Array<string | undefined>) {
  const distinct = [...new Set(notes.map((note) => note?.trim()).filter((note): note is string => Boolean(note)))];
  return distinct.length > 0 ? distinct.join(" · ") : undefined;
}

/**
 * Two answers for the same night (several events, different answers): the most
 * available wins — free > partial > backup > no. Free and partial time is
 * unioned, so a "yes" to one event and "part" of another keeps both.
 */
export function mergeNightAnswers(a: NightAnswer, b: NightAnswer): NightAnswer {
  const winner = NIGHT_STATUS_RANK[a.status] <= NIGHT_STATUS_RANK[b.status] ? a.status : b.status;
  const hasTime = (answer: NightAnswer) => answer.status === "free" || answer.status === "partial";
  const windows =
    winner === "free" || winner === "partial"
      ? mergeWindows([...(hasTime(a) ? a.windows : []), ...(hasTime(b) ? b.windows : [])])
      : [];
  return {
    status: winner,
    windows,
    notes: joinNotes(a.notes, b.notes),
    respondedAt: Math.max(a.respondedAt, b.respondedAt),
  };
}

export type LegacyResponseStatus = "yes" | "partial" | "only_if_necessary" | "no";

export type LegacyResponse = {
  responseStatus: LegacyResponseStatus;
  partialWindows?: TimeWindow[];
  busyWindows?: TimeWindow[];
  notes?: string;
  respondedAt: number;
};

/** One old per-event answer as a night answer, given that event's crew span. */
export function legacyResponseToNight(response: LegacyResponse, crewSpan: TimeWindow): NightAnswer {
  const base = { notes: response.notes?.trim() || undefined, respondedAt: response.respondedAt };
  switch (response.responseStatus) {
    case "yes":
      return { ...base, status: "free", windows: [crewSpan] };
    case "only_if_necessary":
      return { ...base, status: "backup", windows: [] };
    case "no":
      return { ...base, status: "no", windows: [] };
    case "partial": {
      const windows = subtractWindows(response.partialWindows ?? [], response.busyWindows ?? []);
      return windows.length > 0
        ? { ...base, status: "partial", windows }
        : { ...base, status: "no", windows: [] };
    }
  }
}

/** Every old answer on one night, folded into one night answer. */
export function convertLegacyResponses(
  entries: Array<{ response: LegacyResponse; crewSpan: TimeWindow }>,
): NightAnswer | null {
  return entries.reduce<NightAnswer | null>((night, entry) => {
    const next = legacyResponseToNight(entry.response, entry.crewSpan);
    return night ? mergeNightAnswers(night, next) : next;
  }, null);
}

// ---------------------------------------------------------------------------
// Night answer → per-event answer (the staff-side compatibility layer)
// ---------------------------------------------------------------------------

export type DerivedPartialWindow = { scheduleBlockId?: string; startsAt: number; endsAt: number };

export type DerivedEventResponse = {
  responseStatus: LegacyResponseStatus;
  partialWindows?: DerivedPartialWindow[];
  notes?: string;
  respondedAt: number;
};

/**
 * What a night answer means for one event, in the old per-event shape:
 * every crew section covered → `yes`; some time covered → `partial` (fully
 * covered sections by id, plus the free time inside the event as plain
 * windows); none → `no`. Backup → `only_if_necessary`. No night → `null`.
 *
 * A `free` answer saved without windows means the whole night.
 */
export function deriveEventResponse(
  night: (NightAnswer & { status: NightStatus }) | null,
  event: EventLike,
  blocks: SectionLike[],
): DerivedEventResponse | null {
  if (!night) return null;
  const base = { notes: night.notes, respondedAt: night.respondedAt };
  if (night.status === "backup") return { ...base, responseStatus: "only_if_necessary" };
  if (night.status === "no") return { ...base, responseStatus: "no" };
  if (night.status === "free" && night.windows.length === 0) return { ...base, responseStatus: "yes" };

  const sections = crewSections(blocks);
  const span = eventCrewSpan(event, blocks);
  const targets: TimeWindow[] = sections.length > 0 ? sections : [span];
  const fullyCovered = targets.map((target) => windowsCover(night.windows, target));
  if (fullyCovered.every(Boolean)) return { ...base, responseStatus: "yes" };

  const free = clipWindows(night.windows, span);
  if (free.length === 0) return { ...base, responseStatus: "no" };

  const pickedSections: DerivedPartialWindow[] = sections
    .filter((_, index) => fullyCovered[index])
    .map((section) => ({ scheduleBlockId: section._id, startsAt: section.startsAt, endsAt: section.endsAt }));
  return { ...base, responseStatus: "partial", partialWindows: [...pickedSections, ...free] };
}
