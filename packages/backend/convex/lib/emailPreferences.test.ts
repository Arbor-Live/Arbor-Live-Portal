import { describe, expect, it } from "vitest";
import {
  emailOptOutsForInviteKind,
  isConfigurableEmailTemplate,
  isEmailPreferenceApplicable,
  isEmailRequired,
  isEmailTemplateEnabled,
  isTemplateEnabledForChannel,
  listApplicableEmailPreferences,
  resolveDisabledEmailTemplates,
} from "./emailPreferences";

describe("isConfigurableEmailTemplate", () => {
  it("accepts registry templates and rejects auth/transactional ones", () => {
    expect(isConfigurableEmailTemplate("artist_need_inquiry")).toBe(true);
    expect(isConfigurableEmailTemplate("crew_scheduled")).toBe(true);
    expect(isConfigurableEmailTemplate("password_reset")).toBe(false);
    expect(isConfigurableEmailTemplate("nope")).toBe(false);
  });
});

describe("resolveDisabledEmailTemplates", () => {
  it("reads the opt-out list", () => {
    expect([...resolveDisabledEmailTemplates({ emailOptOuts: ["artist_need_inquiry"] })]).toEqual([
      "artist_need_inquiry",
    ]);
  });

  it("has nothing disabled for a profile with no list", () => {
    expect([...resolveDisabledEmailTemplates({})]).toEqual([]);
    expect([...resolveDisabledEmailTemplates(null)]).toEqual([]);
  });

  it("drives isEmailTemplateEnabled", () => {
    const profile = { emailOptOuts: ["weekly_digest"] };
    expect(isEmailTemplateEnabled(profile, "weekly_digest")).toBe(false);
    expect(isEmailTemplateEnabled(profile, "crew_scheduled")).toBe(true);
  });
});

describe("emailOptOutsForInviteKind", () => {
  it("keeps advisors off damage-report emails and crew on", () => {
    expect(emailOptOutsForInviteKind("advisor")).toEqual(["damage_report_admin"]);
    expect(emailOptOutsForInviteKind("crew")).toEqual([]);
    expect(emailOptOutsForInviteKind(undefined)).toEqual([]);
  });
});

describe("isEmailPreferenceApplicable", () => {
  const base = {
    isPortalAdmin: false,
    verticals: [] as string[],
    assignableAsCrew: false,
    isArtistMember: false,
  };

  it("matches each audience to the viewer's roles", () => {
    expect(isEmailPreferenceApplicable("everyone", base)).toBe(true);
    expect(isEmailPreferenceApplicable("crew", base)).toBe(false);
    expect(isEmailPreferenceApplicable("crew", { ...base, assignableAsCrew: true })).toBe(true);
    expect(
      isEmailPreferenceApplicable("operations", {
        ...base,
        isPortalAdmin: true,
        verticals: ["Operations"],
      }),
    ).toBe(true);
    expect(
      isEmailPreferenceApplicable("crew_vertical", {
        ...base,
        isPortalAdmin: true,
        verticals: ["Operations"],
      }),
    ).toBe(false);
    expect(isEmailPreferenceApplicable("artist", { ...base, isArtistMember: true })).toBe(true);
  });

  it("shows only the union of a multi-org member's applicable preferences", () => {
    const templates = listApplicableEmailPreferences({
      isPortalAdmin: true,
      verticals: ["Operations"],
      assignableAsCrew: true,
      isArtistMember: true,
    }).map((definition) => definition.template);
    expect(templates).toContain("artist_need_inquiry");
    expect(templates).toContain("crew_scheduled");
    expect(templates).toContain("band_assigned");
    expect(templates).not.toContain("booking_request_admin");
  });
});

describe("isTemplateEnabledForChannel", () => {
  const profile = {
    emailOptOuts: ["event_cancelled"],
    inAppOptOuts: ["comment_mention"],
    pushOptOuts: ["schedule_published"],
  };

  it("reads each channel's own opt-out list", () => {
    expect(isTemplateEnabledForChannel(profile, "event_cancelled", "email")).toBe(false);
    expect(isTemplateEnabledForChannel(profile, "event_cancelled", "inApp")).toBe(true);
    expect(isTemplateEnabledForChannel(profile, "comment_mention", "inApp")).toBe(false);
    expect(isTemplateEnabledForChannel(profile, "comment_mention", "push")).toBe(true);
    expect(isTemplateEnabledForChannel(profile, "schedule_published", "push")).toBe(false);
  });

  it("never turns off templates that aren't configurable", () => {
    const muted = { emailOptOuts: ["password_reset"], pushOptOuts: ["band_payment_confirmation"] };
    expect(isTemplateEnabledForChannel(muted, "password_reset", "email")).toBe(true);
    expect(isTemplateEnabledForChannel(muted, "band_payment_confirmation", "push")).toBe(true);
  });

  it("always sends calendar-invite emails, but their bell and push stay optional", () => {
    const muted = {
      emailOptOuts: ["crew_scheduled", "crew_unscheduled"],
      pushOptOuts: ["crew_scheduled"],
    };
    expect(isEmailRequired("crew_scheduled")).toBe(true);
    expect(isEmailRequired("schedule_published")).toBe(false);
    expect(isTemplateEnabledForChannel(muted, "crew_scheduled", "email")).toBe(true);
    expect(isTemplateEnabledForChannel(muted, "crew_unscheduled", "email")).toBe(true);
    expect(isTemplateEnabledForChannel(muted, "crew_scheduled", "push")).toBe(false);
  });

  it("defaults everything on", () => {
    expect(isTemplateEnabledForChannel(null, "crew_scheduled", "push")).toBe(true);
    expect(isTemplateEnabledForChannel({}, "crew_scheduled", "inApp")).toBe(true);
  });
});
