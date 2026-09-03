import { describe, expect, it } from "vitest";
import { getConvexErrorMessage } from "./convex-error";

describe("getConvexErrorMessage", () => {
  it("extracts the Uncaught Error message and drops Called by client", () => {
    const raw = `[CONVEX M(eventPullLists:scaffoldFromInvoice)] [Request ID: abc] Server Error
Uncaught Error: Linked invoice has no equipment line items to scaffold.
    at handler (../convex/eventPullLists.ts:536:6)
  Called by client`;
    expect(getConvexErrorMessage(raw)).toBe(
      "Linked invoice has no equipment line items to scaffold.",
    );
  });

  it("does not return Called by client when the server message is empty", () => {
    const raw = `[CONVEX M(eventPullLists:scaffoldFromInvoice)] Server Error
  Called by client`;
    expect(getConvexErrorMessage(raw, "Could not save invoice.")).toBe("Could not save invoice.");
  });

  it("keeps ArgumentValidationError lines", () => {
    const raw = `[CONVEX M(invoices:updateDraft)] [Request ID: x] Server Error
ArgumentValidationError: Value is not a valid ID
  Called by client`;
    expect(getConvexErrorMessage(raw)).toBe("ArgumentValidationError: Value is not a valid ID");
  });

  it("strips a bare Called by client string", () => {
    expect(getConvexErrorMessage("Called by client", "fallback")).toBe("fallback");
  });
});
