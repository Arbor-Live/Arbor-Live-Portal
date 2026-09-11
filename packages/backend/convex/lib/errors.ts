import { ConvexError } from "convex/values";

export type AppErrorData = {
  code: string;
  message: string;
  /** When true, the web client should send this to Sentry. */
  report?: boolean;
  /** Convex function path, e.g. `invoices.updateDraft`. */
  function?: string;
  /** Safe cause class name only — never stacks or payloads. */
  causeName?: string;
};

/** Expected / user-facing failure. Surfaces to the client; not reported to Sentry. */
export function appError(code: string, message: string): never {
  throw new ConvexError({
    code,
    message,
    report: false,
  } satisfies AppErrorData);
}

function isAppErrorData(value: unknown): value is AppErrorData {
  if (typeof value !== "object" || value === null) return false;
  const data = value as Record<string, unknown>;
  return typeof data.code === "string" && typeof data.message === "string";
}

function isConvexAppError(error: unknown): boolean {
  return error instanceof ConvexError && isAppErrorData(error.data);
}

/**
 * Opt a function into reportable unexpected failures.
 * Existing `appError` / `ConvexError` payloads pass through unchanged.
 * Any other throw becomes a safe `UNEXPECTED` ConvexError with `report: true`.
 */
export async function withReportableErrors<T>(
  functionName: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isConvexAppError(error)) {
      throw error;
    }

    const causeName =
      error instanceof Error && error.name.trim() ? error.name : undefined;

    throw new ConvexError({
      code: "UNEXPECTED",
      message: "Something went wrong. Please try again.",
      report: true,
      function: functionName,
      ...(causeName ? { causeName } : {}),
    } satisfies AppErrorData);
  }
}
