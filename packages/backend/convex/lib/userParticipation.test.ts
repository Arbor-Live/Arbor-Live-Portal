import { describe, expect, it } from "vitest";
import {
  ADVISOR_PARTICIPATION_PRESET,
  CREW_PARTICIPATION_DEFAULTS,
  participationForInviteKind,
  resolveParticipationFlags,
} from "./userParticipation";

describe("participationForInviteKind", () => {
  it("uses crew defaults unless the invite is advisor", () => {
    expect(participationForInviteKind(undefined)).toEqual(CREW_PARTICIPATION_DEFAULTS);
    expect(participationForInviteKind("crew")).toEqual(CREW_PARTICIPATION_DEFAULTS);
    expect(participationForInviteKind("advisor")).toEqual(ADVISOR_PARTICIPATION_PRESET);
  });

  it("marks advisors as non-crew", () => {
    expect(ADVISOR_PARTICIPATION_PRESET.assignableAsCrew).toBe(false);
    expect(CREW_PARTICIPATION_DEFAULTS.assignableAsCrew).toBe(true);
  });
});

describe("resolveParticipationFlags", () => {
  it("treats missing profiles as crew defaults", () => {
    expect(resolveParticipationFlags(null)).toEqual(CREW_PARTICIPATION_DEFAULTS);
    expect(resolveParticipationFlags(undefined)).toEqual(CREW_PARTICIPATION_DEFAULTS);
    expect(resolveParticipationFlags({})).toEqual(CREW_PARTICIPATION_DEFAULTS);
  });

  it("honors explicit advisor-style flags", () => {
    expect(
      resolveParticipationFlags({
        requiresOnboarding: false,
        includeInTimecards: false,
        assignableAsCrew: false,
      }),
    ).toEqual(ADVISOR_PARTICIPATION_PRESET);
  });
});
