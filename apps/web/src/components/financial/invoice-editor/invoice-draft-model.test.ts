import { describe, expect, it } from "vitest";
import { ARTIST_TBD_VALUE } from "@/components/bands/artist-select";
import {
  adoptServerArtistChanges,
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
