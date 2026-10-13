import { describe, expect, it } from "vitest";
import { bandPayoutAdminOnlyNotice } from "./band-payout-copy";

describe("bandPayoutAdminOnlyNotice", () => {
  it("names the one admin to ask", () => {
    expect(bandPayoutAdminOnlyNotice(["Jo Rivera"])).toBe(
      "Only your artist admin can set the payee. Ask Jo Rivera.",
    );
  });

  it("lists every admin when there are several", () => {
    expect(bandPayoutAdminOnlyNotice(["Ana", "Ben", "Cy"])).toBe(
      "Only your artist admin can set the payee. Ask Ana, Ben, or Cy.",
    );
  });

  it("points to Arbor when the artist has no admin", () => {
    expect(bandPayoutAdminOnlyNotice([])).toBe(
      "Only your artist admin can set the payee. Ask Arbor Live to make someone on your team an artist admin.",
    );
  });
});
