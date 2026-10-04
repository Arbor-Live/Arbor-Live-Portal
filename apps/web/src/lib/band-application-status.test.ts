import { describe, expect, it } from "vitest";
import {
  bandApplicationContext,
  bandApplicationInviteCount,
  bandApplicationLineup,
  bandApplicationListArgs,
} from "./band-application-status";

describe("band application status", () => {
  it("loads one status by index, and everything otherwise", () => {
    expect(bandApplicationListArgs(undefined)).toEqual({});
    expect(bandApplicationListArgs({ operator: "is", values: [] })).toEqual({});
    expect(bandApplicationListArgs({ operator: "is", values: ["submitted"] })).toEqual({ status: "submitted" });
    expect(bandApplicationListArgs({ operator: "is", values: ["approved", "declined"] })).toEqual({});
    expect(bandApplicationListArgs({ operator: "is_not", values: ["approved", "declined"] })).toEqual({
      status: "submitted",
    });
  });

  it("labels the artist type and first two genres", () => {
    expect(bandApplicationContext({ organizationType: "dj", genres: ["House", "Techno", "Disco"] })).toBe(
      "DJ · House, Techno",
    );
    expect(bandApplicationContext({})).toBe("Other");
  });

  it("counts invites the way approve sends them", () => {
    expect(
      bandApplicationInviteCount({
        contactEmail: "Lead@example.com",
        isSolo: false,
        members: [{ email: "lead@example.com" }, { email: "b@example.com" }, {}],
      }),
    ).toBe(2);
    expect(
      bandApplicationInviteCount({ contactEmail: "a@example.com", isSolo: true, members: [{ email: "b@example.com" }] }),
    ).toBe(1);
  });

  it("describes the line-up", () => {
    expect(bandApplicationLineup({ isSolo: true, members: [{}] })).toBe("Solo");
    expect(bandApplicationLineup({ isSolo: false, members: [{}, {}, {}] })).toBe("4 people");
  });
});
