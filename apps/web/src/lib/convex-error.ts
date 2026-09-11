import * as Sentry from "@sentry/nextjs";
import { ConvexError } from "convex/values";

export type ConvexAppErrorData = {
  code?: string;
  message?: string;
  report?: boolean;
  function?: string;
  causeName?: string;
};

const reportedErrors = new WeakSet<object>();

/**
 * Extract a user-readable message from Convex mutation/query errors.
 * Strips Convex client wrappers like:
 * `[CONVEX M(...)] [Request ID: ...] Server Error Uncaught Error: … at handler …`
 * `  Called by client`
 *
 * When the payload is a reportable `ConvexError` (`data.report === true`), also
 * sends it to Sentry once per error object.
 */
export function getConvexErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  reportConvexClientError(error);

  const data = getConvexAppErrorData(error);
  if (typeof data?.message === "string" && data.message.trim()) {
    return data.message.trim();
  }

  const raw = extractRawMessage(error);
  if (!raw) return fallback;

  const cleaned = cleanConvexServerMessage(raw);
  return cleaned || fallback;
}

export function getConvexAppErrorData(error: unknown): ConvexAppErrorData | null {
  if (error instanceof ConvexError) {
    return normalizeAppErrorData(error.data);
  }

  if (typeof error === "object" && error !== null && "data" in error) {
    return normalizeAppErrorData((error as { data?: unknown }).data);
  }

  return null;
}

export function reportConvexClientError(error: unknown): void {
  const data = getConvexAppErrorData(error);
  if (!data?.report) return;

  if (typeof error === "object" && error !== null) {
    if (reportedErrors.has(error)) return;
    reportedErrors.add(error);
  }

  Sentry.captureException(error instanceof Error ? error : new Error(data.message ?? "Convex error"), {
    tags: {
      convex_code: data.code ?? "UNEXPECTED",
      ...(data.function ? { convex_function: data.function } : {}),
      ...(data.causeName ? { convex_cause: data.causeName } : {}),
    },
    extra: {
      convexErrorData: data,
    },
  });
}

function normalizeAppErrorData(value: unknown): ConvexAppErrorData | null {
  if (typeof value === "string" && value.trim()) {
    return { message: value.trim() };
  }

  if (typeof value !== "object" || value === null) {
    return null;
  }

  const data = value as Record<string, unknown>;
  const message = typeof data.message === "string" ? data.message : undefined;
  const code = typeof data.code === "string" ? data.code : undefined;
  if (!message && !code) return null;

  return {
    ...(code ? { code } : {}),
    ...(message ? { message } : {}),
    report: data.report === true,
    ...(typeof data.function === "string" ? { function: data.function } : {}),
    ...(typeof data.causeName === "string" ? { causeName: data.causeName } : {}),
  };
}

function extractRawMessage(error: unknown): string | null {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    const withMessage = error as { message?: unknown };
    if (typeof withMessage.message === "string" && withMessage.message.trim()) {
      return withMessage.message;
    }
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return null;
}

function cleanConvexServerMessage(message: string): string {
  let text = message.trim();

  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as { message?: unknown };
      if (typeof parsed.message === "string" && parsed.message.trim()) {
        text = parsed.message.trim();
      }
    } catch {
      // Keep the raw message when it is not JSON.
    }
  }

  // Prefer the human message after "Uncaught Error:" / "Error:".
  const uncaught = text.match(/Uncaught (?:Error|ConvexError):\s*([\s\S]+)/i);
  if (uncaught?.[1]) {
    text = uncaught[1].trim();
  } else {
    // Drop leading Convex metadata prefixes when present (may repeat).
    for (let i = 0; i < 4; i += 1) {
      const next = text
        .replace(/^\[CONVEX[^\]]*\]\s*/i, "")
        .replace(/^\[Request ID:[^\]]*\]\s*/i, "")
        .replace(/^Server Error\s*/i, "")
        .trim();
      if (next === text) break;
      text = next;
    }
  }

  // Drop trailing stack / "Called by client" noise.
  // Convex formats: `…\n  Called by client` (always appended by the browser client).
  text = text
    .replace(/\s+at (?:async\s+)?handler\s*\([^)]*\)[\s\S]*$/i, "")
    .replace(/(?:^|\s+)Called by client\.?\s*$/i, "")
    .trim();

  if (!text || /^(?:client error|server error)$/i.test(text)) {
    return "";
  }

  // If multiple lines remain, keep the first meaningful line (skip bare stack frames).
  const firstLine = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !/^at\s+/i.test(line) && !/^called by client\.?$/i.test(line));
  return firstLine ?? text;
}
