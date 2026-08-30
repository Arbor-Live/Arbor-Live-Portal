import { describe, expect, it } from "vitest";
import { invoiceDueEndMs } from "./invoicePaymentStatus";

describe("invoiceDueEndMs", () => {
  it("returns null when no due date is set", () => {
    expect(invoiceDueEndMs({})).toBeNull();
    expect(invoiceDueEndMs({ dueDate: undefined })).toBeNull();
  });

  it("lands on the midnight after the due day in Pacific", () => {
    // 2026-08-01 is PDT (UTC-7): 9am = 16:00Z, +15h = 2026-08-02T07:00Z.
    expect(invoiceDueEndMs({ dueDate: "2026-08-01" }, "America/Los_Angeles")).toBe(
      Date.UTC(2026, 7, 2, 7, 0, 0),
    );
    // 2026-01-15 is PST (UTC-8): 9am = 17:00Z, +15h = 2026-01-16T08:00Z.
    expect(invoiceDueEndMs({ dueDate: "2026-01-15" }, "America/Los_Angeles")).toBe(
      Date.UTC(2026, 0, 16, 8, 0, 0),
    );
  });
});