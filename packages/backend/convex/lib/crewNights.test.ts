import { pacificDateAndTimeToMs } from "@arbor/format";
import { describe, expect, it } from "vitest";
import {
  convertLegacyResponses,
  deriveEventResponse,
  earlySetupWindows,
  eventCrewSpan,
  legacyResponseToNight,
  mergeNightAnswers,
  mergeWindows,
  nightKeyForEvent,
  nightKeyForStart,
  nightSpan,
  subtractWindows,
  weekdayOfNightKey,
  type NightAnswer,
} from "./crewNights";

/** Pacific wall clock on Fri Oct 16 2026 (or the next day with `day: "2026-10-17"`). */
function at(time: string, day = "2026-10-16") {
  return pacificDateAndTimeToMs(day, time)!;
}

function block(id: string, blockType: "setup" | "show" | "strike" | "set", label: string, from: string, to: string, toDay?: string) {
  return { _id: id, blockType, label, startsAt: at(from), endsAt: at(to, toDay) };
}

const NIGHT = "2026-10-16";

/** Event A: setup 5–7, show 7–10, strike 10–11. */
const eventA = { startAt: at("19:00"), endAt: at("22:00") };
const blocksA = [
  block("a-setup", "setup", "Setup", "17:00", "19:00"),
  block("a-show", "show", "Show", "19:00", "22:00"),
  block("a-set", "set", "Headliner", "20:00", "21:00"),
  block("a-strike", "strike", "Strike", "22:00", "23:00"),
];

/** Event B overlaps A: setup 8–9, show 9–11:30. */
const eventB = { startAt: at("21:00"), endAt: at("23:30") };
const blocksB = [
  block("b-setup", "setup", "Setup", "20:00", "21:00"),
  block("b-show", "show", "Show", "21:00", "23:30"),
];

const answered = 1_000;

describe("night keys", () => {
  it("is the Pacific day of the start", () => {
    expect(nightKeyForStart(at("19:00"))).toBe(NIGHT);
    expect(weekdayOfNightKey(NIGHT)).toBe("friday");
  });

  it("keeps a show past midnight on the night it started", () => {
    expect(nightKeyForStart(at("00:30", "2026-10-17"))).toBe(NIGHT);
    expect(nightKeyForStart(at("07:00", "2026-10-17"))).toBe("2026-10-17");
  });
});

describe("night span", () => {
  it("runs from the earliest crew call to the last end, across events", () => {
    const spanA = eventCrewSpan(eventA, blocksA);
    expect(spanA).toEqual({ startsAt: at("17:00"), endsAt: at("23:00") });
    const spanB = eventCrewSpan(eventB, blocksB);
    expect(nightSpan([spanA, spanB])).toEqual({ startsAt: at("17:00"), endsAt: at("23:30") });
  });

  it("includes an early setup and falls back to the event times without sections", () => {
    const early = [block("e", "setup", "Early setup", "15:30", "17:00"), ...blocksA];
    expect(eventCrewSpan(eventA, early).startsAt).toBe(at("15:30"));
    expect(eventCrewSpan(eventA, [])).toEqual({ startsAt: at("19:00"), endsAt: at("22:00") });
  });

  it("ignores moments (sets) and is empty with no events", () => {
    const onlySet = [block("s", "set", "Set", "12:00", "13:00")];
    expect(eventCrewSpan(eventA, onlySet)).toEqual({ startsAt: at("19:00"), endsAt: at("22:00") });
    expect(nightSpan([])).toBeNull();
  });
});

describe("window math", () => {
  it("merges overlapping and touching windows", () => {
    expect(
      mergeWindows([
        { startsAt: 5, endsAt: 7 },
        { startsAt: 1, endsAt: 3 },
        { startsAt: 3, endsAt: 4 },
        { startsAt: 6, endsAt: 9 },
      ]),
    ).toEqual([
      { startsAt: 1, endsAt: 4 },
      { startsAt: 5, endsAt: 9 },
    ]);
  });

  it("cuts busy times out of free time", () => {
    expect(subtractWindows([{ startsAt: 0, endsAt: 10 }], [{ startsAt: 3, endsAt: 5 }])).toEqual([
      { startsAt: 0, endsAt: 3 },
      { startsAt: 5, endsAt: 10 },
    ]);
  });
});

describe("old per-event answers → one night", () => {
  const spanA = eventCrewSpan(eventA, blocksA);
  const spanB = eventCrewSpan(eventB, blocksB);

  it("maps each status", () => {
    expect(legacyResponseToNight({ responseStatus: "yes", respondedAt: answered }, spanA)).toEqual({
      status: "free",
      windows: [spanA],
      respondedAt: answered,
    });
    expect(legacyResponseToNight({ responseStatus: "only_if_necessary", respondedAt: answered }, spanA).status).toBe(
      "backup",
    );
    expect(legacyResponseToNight({ responseStatus: "no", respondedAt: answered }, spanA).status).toBe("no");
  });

  it("turns a partial answer into its windows minus busy times", () => {
    const night = legacyResponseToNight(
      {
        responseStatus: "partial",
        partialWindows: [{ startsAt: at("17:00"), endsAt: at("22:00") }],
        busyWindows: [{ startsAt: at("19:00"), endsAt: at("20:00") }],
        respondedAt: answered,
      },
      spanA,
    );
    expect(night).toEqual({
      status: "partial",
      windows: [
        { startsAt: at("17:00"), endsAt: at("19:00") },
        { startsAt: at("20:00"), endsAt: at("22:00") },
      ],
      respondedAt: answered,
    });
  });

  it("is no when busy times cover every picked part", () => {
    const night = legacyResponseToNight(
      {
        responseStatus: "partial",
        partialWindows: [{ startsAt: at("17:00"), endsAt: at("19:00") }],
        busyWindows: [{ startsAt: at("16:00"), endsAt: at("20:00") }],
        respondedAt: answered,
      },
      spanA,
    );
    expect(night.status).toBe("no");
  });

  it("lets the most available answer win on one night", () => {
    const merged = convertLegacyResponses([
      { response: { responseStatus: "no", notes: "class", respondedAt: 1 }, crewSpan: spanB },
      { response: { responseStatus: "yes", respondedAt: 2 }, crewSpan: spanA },
      { response: { responseStatus: "only_if_necessary", respondedAt: 3 }, crewSpan: spanB },
    ]);
    expect(merged).toEqual({ status: "free", windows: [spanA], notes: "class", respondedAt: 3 });
  });

  it("unions partial time across events and keeps backup over no", () => {
    const merged = convertLegacyResponses([
      {
        response: {
          responseStatus: "partial",
          partialWindows: [{ startsAt: at("17:00"), endsAt: at("19:00") }],
          respondedAt: 1,
        },
        crewSpan: spanA,
      },
      {
        response: {
          responseStatus: "partial",
          partialWindows: [{ startsAt: at("18:00"), endsAt: at("21:00") }],
          respondedAt: 2,
        },
        crewSpan: spanB,
      },
    ]);
    expect(merged).toEqual({
      status: "partial",
      windows: [{ startsAt: at("17:00"), endsAt: at("21:00") }],
      respondedAt: 2,
    });
    expect(
      convertLegacyResponses([
        { response: { responseStatus: "no", respondedAt: 1 }, crewSpan: spanA },
        { response: { responseStatus: "only_if_necessary", respondedAt: 2 }, crewSpan: spanB },
      ])?.status,
    ).toBe("backup");
  });

  it("is idempotent: merging an answer into itself changes nothing", () => {
    const night: NightAnswer = {
      status: "partial",
      windows: [{ startsAt: at("17:00"), endsAt: at("19:00") }],
      notes: "late class",
      respondedAt: 5,
    };
    expect(mergeNightAnswers(night, night)).toEqual(night);
    const twice = mergeNightAnswers(mergeNightAnswers(night, night), night);
    expect(twice).toEqual(night);
  });

  it("returns null for no answers", () => {
    expect(convertLegacyResponses([])).toBeNull();
  });
});

describe("night answer → per-event answer", () => {
  const fullNight = (windows = [nightSpan([eventCrewSpan(eventA, blocksA), eventCrewSpan(eventB, blocksB)])!]) =>
    ({ status: "free", windows, respondedAt: answered }) as NightAnswer;

  it("is unanswered without a night", () => {
    expect(deriveEventResponse(null, eventA, blocksA)).toBeNull();
  });

  it("is yes when the night covers every crew section", () => {
    expect(deriveEventResponse(fullNight(), eventA, blocksA)).toEqual({
      responseStatus: "yes",
      respondedAt: answered,
    });
  });

  it("gives two overlapping events the same one answer", () => {
    const night = fullNight();
    expect(deriveEventResponse(night, eventA, blocksA)?.responseStatus).toBe("yes");
    expect(deriveEventResponse(night, eventB, blocksB)?.responseStatus).toBe("yes");
  });

  it("is partial when only some time is covered: whole sections by id, the rest as free time", () => {
    const night: NightAnswer = {
      status: "partial",
      windows: [{ startsAt: at("17:00"), endsAt: at("20:00") }],
      respondedAt: answered,
    };
    expect(deriveEventResponse(night, eventA, blocksA)).toEqual({
      responseStatus: "partial",
      partialWindows: [
        { scheduleBlockId: "a-setup", startsAt: at("17:00"), endsAt: at("19:00") },
        { startsAt: at("17:00"), endsAt: at("20:00") },
      ],
      respondedAt: answered,
    });
    // The same partial night barely touches B (its setup starts at 8).
    expect(deriveEventResponse(night, eventB, blocksB)?.responseStatus).toBe("no");
  });

  it("covers a night with an early setup: early setup only is part of that event, not the other", () => {
    const blocksWithEarly = [block("a-early", "setup", "Early setup", "16:00", "17:00"), ...blocksA];
    const windows = earlySetupWindows(blocksWithEarly);
    expect(windows).toEqual([{ startsAt: at("16:00"), endsAt: at("17:00") }]);
    const night: NightAnswer = { status: "partial", windows, respondedAt: answered };
    expect(deriveEventResponse(night, eventA, blocksWithEarly)).toEqual({
      responseStatus: "partial",
      partialWindows: [
        { scheduleBlockId: "a-early", startsAt: at("16:00"), endsAt: at("17:00") },
        { startsAt: at("16:00"), endsAt: at("17:00") },
      ],
      respondedAt: answered,
    });
    expect(deriveEventResponse(night, eventB, blocksB)?.responseStatus).toBe("no");
    // "I'm free" for the whole night still covers the early setup.
    const whole = fullNight([nightSpan([eventCrewSpan(eventA, blocksWithEarly), eventCrewSpan(eventB, blocksB)])!]);
    expect(deriveEventResponse(whole, eventA, blocksWithEarly)?.responseStatus).toBe("yes");
  });

  it("handles a show crossing midnight on the night it started", () => {
    const late = { startAt: at("22:00"), endAt: at("01:30", "2026-10-17") };
    const lateBlocks = [
      block("l-setup", "setup", "Setup", "20:00", "22:00"),
      block("l-show", "show", "Show", "22:00", "01:30", "2026-10-17"),
      { ...block("l-strike", "strike", "Strike", "01:30", "02:30", "2026-10-17"), startsAt: at("01:30", "2026-10-17") },
    ];
    expect(nightKeyForEvent(late)).toBe(NIGHT);
    const span = eventCrewSpan(late, lateBlocks);
    expect(span).toEqual({ startsAt: at("20:00"), endsAt: at("02:30", "2026-10-17") });
    expect(deriveEventResponse(fullNight([span]), late, lateBlocks)?.responseStatus).toBe("yes");
    // Free until midnight only: the strike after midnight is not covered.
    const untilMidnight: NightAnswer = {
      status: "partial",
      windows: [{ startsAt: at("20:00"), endsAt: at("00:00", "2026-10-17") }],
      respondedAt: answered,
    };
    const derived = deriveEventResponse(untilMidnight, late, lateBlocks);
    expect(derived?.responseStatus).toBe("partial");
    expect(derived?.partialWindows?.[0]).toEqual({
      scheduleBlockId: "l-setup",
      startsAt: at("20:00"),
      endsAt: at("22:00"),
    });
  });

  it("is partial when the night grew after an \"I'm free\" (an earlier call)", () => {
    const answeredSpan = { startsAt: at("17:00"), endsAt: at("23:00") };
    const grown = [block("a-early", "setup", "Early setup", "16:00", "17:00"), ...blocksA];
    expect(deriveEventResponse(fullNight([answeredSpan]), eventA, grown)?.responseStatus).toBe("partial");
  });

  it("maps backup and no straight through, and an unscoped free to yes", () => {
    expect(deriveEventResponse({ status: "backup", windows: [], respondedAt: 1 }, eventA, blocksA)?.responseStatus).toBe(
      "only_if_necessary",
    );
    expect(deriveEventResponse({ status: "no", windows: [], respondedAt: 1 }, eventA, blocksA)?.responseStatus).toBe(
      "no",
    );
    expect(deriveEventResponse({ status: "free", windows: [], respondedAt: 1 }, eventA, blocksA)?.responseStatus).toBe(
      "yes",
    );
  });

  it("uses the event's own times when it has no sections", () => {
    const night: NightAnswer = {
      status: "partial",
      windows: [{ startsAt: at("19:00"), endsAt: at("21:00") }],
      respondedAt: answered,
    };
    expect(deriveEventResponse(night, eventA, [])).toEqual({
      responseStatus: "partial",
      partialWindows: [{ startsAt: at("19:00"), endsAt: at("21:00") }],
      respondedAt: answered,
    });
  });
});
