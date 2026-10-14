import { describe, expect, it } from "vitest";
import { ARTIST_TBD_VALUE } from "@/components/bands/artist-select";
import { applyCrewDayRates } from "@/lib/invoice-crew-from-event";
import {
  adoptServerArtistChanges,
  crewLineRateUsd,
  layoutArtistBill,
  type ArtistRow,
  type ServerArtistLines,
} from "./invoice-draft-model";

function row(partial: Partial<ArtistRow>): ArtistRow {
  return { organizationId: ARTIST_TBD_VALUE, label: "TBD artist", hours: "1", people: "1", rateUsd: "0", ...partial };
}

const tbd: ServerArtistLines = new Map([["n1", { label: "TBD artist", organizationId: ARTIST_TBD_VALUE }]]);

describe("adoptServerArtistChanges", () => {
  it("follows an act booked on the lineup", () => {
    const after: ServerArtistLines = new Map([["n1", { label: "The Foos", organizationId: "org-a" }]]);
    const next = adoptServerArtistChanges([row({ needId: "n1", rateUsd: "50" })], tbd, after);
    expect(next).toEqual([row({ needId: "n1", rateUsd: "50", label: "The Foos", organizationId: "org-a" })]);
  });

  it("drops the link when the position was removed on the event", () => {
    expect(adoptServerArtistChanges([row({ needId: "n1" })], tbd, new Map())).toEqual([row({ needId: undefined })]);
  });

  it("keeps a row the user edited", () => {
    const after: ServerArtistLines = new Map([["n1", { label: "The Foos", organizationId: "org-a" }]]);
    const edited = row({ needId: "n1", label: "The Bars", organizationId: "org-b" });
    expect(adoptServerArtistChanges([edited], tbd, after)).toBeNull();
  });

  it("returns null when nothing changed", () => {
    expect(adoptServerArtistChanges([row({ needId: "n1" }), row({})], tbd, tbd)).toBeNull();
  });
});

describe("layoutArtistBill", () => {
  function position(needId: string, invoiceIds: string[] = []) {
    return {
      eventId: "e1",
      needId,
      label: needId,
      artistTypes: ["band" as const],
      status: "open" as const,
      genres: "",
      invoiceIds,
    };
  }

  it("lays lines and open positions out in bill order, then unplaced lines", () => {
    const items = layoutArtistBill(
      [{ needId: "support" }, {}],
      [position("headliner"), position("support", ["inv"])],
      "inv",
    );
    expect(items.map((item) => (item.kind === "line" ? `line:${item.idx}` : `open:${item.position.needId}`))).toEqual([
      "open:headliner",
      "line:0",
      "line:1",
    ]);
  });

  it("leaves out positions another invoice prices", () => {
    expect(layoutArtistBill([], [position("headliner", ["other"])], "inv")).toEqual([]);
  });

  it("shows a position this quote stopped pricing as open again", () => {
    expect(layoutArtistBill([], [position("headliner", ["inv"])], "inv")).toEqual([
      { kind: "open", position: expect.objectContaining({ needId: "headliner" }) },
    ]);
  });
});

describe("crewLineRateUsd with day rates", () => {
  const settings = { crewNormalRateUsd: 20, crewLeadRateUsd: 22 };
  const row = (hoursTier: "regular" | "past_regular", rateUsd?: string) =>
    ({ label: "Setup → Strike — Crew (Open slot)", quantity: "2", rateUsd, source: "event", hoursTier }) as const;

  it("bills hours past 8 at 1.5× on a normal day", () => {
    const priced = applyCrewDayRates(row("past_regular", "20"), false);
    expect(priced.label).toBe("Setup → Strike — Crew (Open slot) · OT after 8 hrs");
    expect(crewLineRateUsd(priced, "normal", "", settings)).toBe(30);
    expect(crewLineRateUsd(applyCrewDayRates(row("regular", "20"), false), "normal", "", settings)).toBe(20);
  });

  it("bills 1.5× then double time on an OT day, from the mode default when unrated", () => {
    expect(crewLineRateUsd(applyCrewDayRates(row("regular"), true), "normal", "", settings)).toBe(30);
    const dt = applyCrewDayRates(row("past_regular", "22"), true);
    expect(dt.label).toContain("· DT after 8 hrs");
    expect(crewLineRateUsd(dt, "normal", "", settings)).toBe(44);
  });
});
