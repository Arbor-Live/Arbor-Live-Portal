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

  it("opts advisors out of damage-report emails", () => {
    expect(ADVISOR_PARTICIPATION_PRESET.damageReportEmails).toBe(false);
    expect(CREW_PARTICIPATION_DEFAULTS.damageReportEmails).toBe(true);
  });
});

describe("resolveParticipationFlags", () => {
  it("treats missing profiles as crew defaults", () => {
    expect(resolveParticipationFlags(null)).toEqual(CREW_PARTICIPATION_DEFAULTS);
    expect(resolveParticipationFlags(undefined)).toEqual(CREW_PARTICIPATION_DEFAULTS);
    expect(resolveParticipationFlags({})).toEqual(CREW_PARTICIPATION_DEFAULTS);
  });

  it("keeps legacy advisors off damage-report emails", () => {
    expect(
      resolveParticipationFlags({
        requiresOnboarding: false,
        includeInTimecards: false,
        assignableAsCrew: false,
      }).damageReportEmails,
    ).toBe(false);
  });

  it("honors an explicit damage-report opt-in on an advisor-like profile", () => {
    expect(
      resolveParticipationFlags({
        requiresOnboarding: false,
        includeInTimecards: false,
        assignableAsCrew: false,
        damageReportEmails: true,
      }).damageReportEmails,
    ).toBe(true);
  });

  it("honors an explicit damage-report opt-out on a crew profile", () => {
    expect(
      resolveParticipationFlags({
        requiresOnboarding: true,
        includeInTimecards: true,
        assignableAsCrew: true,
        damageReportEmails: false,
      }).damageReportEmails,
    ).toBe(false);
  });
});
