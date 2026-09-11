import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";

const captureException = vi.fn();

vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

import { getConvexAppErrorData, getConvexErrorMessage } from "./convex-error";

describe("getConvexErrorMessage", () => {
  beforeEach(() => {
    captureException.mockClear();
  });

  it("extracts the Uncaught Error message and drops Called by client", () => {
    const raw = `[CONVEX M(eventPullLists:scaffoldFromInvoice)] [Request ID: abc] Server Error
Uncaught Error: Linked invoice has no equipment line items to scaffold.
    at handler (../convex/eventPullLists.ts:536:6)
  Called by client`;
    expect(getConvexErrorMessage(raw)).toBe(
      "Linked invoice has no equipment line items to scaffold.",
    );
    expect(captureException).not.toHaveBeenCalled();
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

  it("prefers ConvexError data.message and does not report expected errors", () => {
    const error = new ConvexError({
      code: "INVOICE_NOT_FOUND",
      message: "Invoice not found.",
      report: false,
    });
    expect(getConvexErrorMessage(error)).toBe("Invoice not found.");
    expect(captureException).not.toHaveBeenCalled();
  });

  it("reports ConvexError when data.report is true", () => {
    const error = new ConvexError({
      code: "UNEXPECTED",
      message: "Something went wrong. Please try again.",
      report: true,
      function: "invoices.updateDraft",
      causeName: "TypeError",
    });
    expect(getConvexErrorMessage(error)).toBe("Something went wrong. Please try again.");
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0]?.[1]).toMatchObject({
      tags: {
        convex_code: "UNEXPECTED",
        convex_function: "invoices.updateDraft",
        convex_cause: "TypeError",
      },
    });
  });

  it("reports a given error object only once", () => {
    const error = new ConvexError({
      code: "UNEXPECTED",
      message: "Something went wrong. Please try again.",
      report: true,
      function: "invoices.finalize",
    });
    getConvexErrorMessage(error);
    getConvexErrorMessage(error);
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});

describe("getConvexAppErrorData", () => {
  it("reads structured data from ConvexError", () => {
    const error = new ConvexError({
      code: "QUOTE_NOT_FOUND",
      message: "Quote not found.",
      report: false,
    });
    expect(getConvexAppErrorData(error)).toEqual({
      code: "QUOTE_NOT_FOUND",
      message: "Quote not found.",
      report: false,
    });
  });
});
