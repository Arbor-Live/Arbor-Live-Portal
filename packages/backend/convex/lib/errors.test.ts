import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { appError, withReportableErrors } from "./errors";

function captureThrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to throw");
}

async function captureRejected(run: Promise<unknown>): Promise<unknown> {
  return run.then(
    () => null,
    (thrown: unknown) => thrown,
  );
}

function errorData(error: unknown): Record<string, unknown> {
  if (!(error instanceof ConvexError)) {
    throw new Error(`expected a ConvexError, got ${String(error)}`);
  }
  return error.data as Record<string, unknown>;
}

describe("appError", () => {
  it("throws a ConvexError with the code, message and report false", () => {
    const error = captureThrown(() => appError("EVENT_NOT_FOUND", "Event not found."));
    expect(error).toBeInstanceOf(ConvexError);
    expect(errorData(error)).toEqual({
      code: "EVENT_NOT_FOUND",
      message: "Event not found.",
      report: false,
    });
  });
});

describe("withReportableErrors", () => {
  it("returns the value when the body does not throw", async () => {
    await expect(
      withReportableErrors("events.create", async () => ({ id: "k1" })),
    ).resolves.toEqual({ id: "k1" });
  });

  it("passes an appError through unchanged", async () => {
    const error = await captureRejected(
      withReportableErrors("events.update", async () => {
        appError("EVENT_NOT_FOUND", "Event not found.");
      }),
    );
    expect(error).toBeInstanceOf(ConvexError);
    expect(errorData(error)).toEqual({
      code: "EVENT_NOT_FOUND",
      message: "Event not found.",
      report: false,
    });
  });

  it("turns a plain Error into an UNEXPECTED reportable error", async () => {
    const error = await captureRejected(
      withReportableErrors("events.create", async () => {
        throw new TypeError("boom at /Users/someone/secret-path");
      }),
    );
    expect(error).toBeInstanceOf(ConvexError);
    expect(errorData(error)).toEqual({
      code: "UNEXPECTED",
      message: "Something went wrong. Please try again.",
      report: true,
      function: "events.create",
      causeName: "TypeError",
    });
  });

  it("does not leak the cause message or stack into the error data", async () => {
    const error = await captureRejected(
      withReportableErrors("invoices.updateDraft", async () => {
        throw new Error("token abc123 for user secret@example.com");
      }),
    );
    const data = errorData(error);
    expect(data.message).toBe("Something went wrong. Please try again.");
    expect(JSON.stringify(data)).not.toContain("abc123");
    expect(JSON.stringify(data)).not.toContain("secret@example.com");
    expect(Object.keys(data).sort()).toEqual([
      "causeName",
      "code",
      "function",
      "message",
      "report",
    ]);
    expect("stack" in data).toBe(false);
  });

  it("omits causeName when the thrown value is not an Error", async () => {
    const error = await captureRejected(
      withReportableErrors("events.setStatus", async () => {
        throw { code: 500 };
      }),
    );
    expect(errorData(error)).toEqual({
      code: "UNEXPECTED",
      message: "Something went wrong. Please try again.",
      report: true,
      function: "events.setStatus",
    });
  });
});
