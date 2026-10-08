import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import { mergeLinkedInvoiceEvents } from "./invoiceEvents";

function event(
  id: string,
  startAt: number,
  creationTime = 0,
): Doc<"events"> {
  return { _id: id, _creationTime: creationTime, startAt } as Doc<"events">;
}

describe("mergeLinkedInvoiceEvents", () => {
  it("orders by start time with creation time as the tiebreak", () => {
    const merged = mergeLinkedInvoiceEvents(
      [event("a" as Id<"events">, 20)],
      [event("b" as Id<"events">, 10)],
    );
    expect(merged.map((row) => row._id)).toEqual(["b", "a"]);
    const tiebreak = mergeLinkedInvoiceEvents(
      [event("late" as Id<"events">, 10, 2)],
      [event("early" as Id<"events">, 10, 1)],
    );
    expect(tiebreak.map((row) => row._id)).toEqual(["early", "late"]);
  });

  it("drops duplicates between primary and additional lists", () => {
    const shared = event("shared" as Id<"events">, 5);
    const merged = mergeLinkedInvoiceEvents(
      [shared, event("a" as Id<"events">, 10)],
      [event("shared" as Id<"events">, 5), event("b" as Id<"events">, 1)],
    );
    expect(merged.map((row) => row._id)).toEqual(["b", "shared", "a"]);
  });
});
