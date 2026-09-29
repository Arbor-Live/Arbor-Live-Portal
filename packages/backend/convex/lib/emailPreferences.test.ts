import { describe, expect, it } from "vitest";
import {
  emailOptOutsForInviteKind,
  isConfigurableEmailTemplate,
  isEmailPreferenceApplicable,
  isEmailTemplateEnabled,
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
