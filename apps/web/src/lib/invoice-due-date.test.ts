import { describe, expect, it } from "vitest";
import {
  firstLinkedEventStartAtMs,
  invoiceDueDateFromFirstEvent,
} from "./invoice-due-date";
import { pacificDateAndTimeToMs } from "@arbor/format";

describe("invoiceDueDateFromFirstEvent", () => {
  it("is the first event calendar day plus 30 days, not the last day", () => {
    const fridayStart = pacificDateAndTimeToMs("2026-10-16", "19:00")!;
    const sundayEnd = pacificDateAndTimeToMs("2026-10-18", "23:00")!;
    expect(invoiceDueDateFromFirstEvent(fridayStart)).toBe("2026-11-15");
    expect(invoiceDueDateFromFirstEvent(sundayEnd)).toBe("2026-11-17");
  });
});

describe("firstLinkedEventStartAtMs", () => {
  it("picks the earliest start among linked occurrences", () => {
    const first = pacificDateAndTimeToMs("2026-10-16", "19:00")!;
    const later = pacificDateAndTimeToMs("2026-10-23", "19:00")!;
    expect(
      firstLinkedEventStartAtMs([
        { startAt: later },
        { startAt: first },
      ]),
    ).toBe(first);
  });
});
