/**
 * Extract a user-readable message from Convex mutation/query errors.
 * Strips Convex client wrappers like:
 * `[CONVEX M(...)] [Request ID: ...] Server Error Uncaught Error: … at handler …`
 */
export function getConvexErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  const raw = extractRawMessage(error);
  if (!raw) return fallback;

  const cleaned = cleanConvexServerMessage(raw);
  return cleaned || fallback;
}

function extractRawMessage(error: unknown): string | null {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    const withData = error as { data?: { message?: unknown } };
    if (typeof withData.data?.message === "string" && withData.data.message.trim()) {
      return withData.data.message;
    }

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
    // Drop leading Convex metadata prefixes when present.
    text = text
      .replace(/^\[CONVEX[^\]]*\]\s*/i, "")
      .replace(/^\[Request ID:[^\]]*\]\s*/i, "")
      .replace(/^Server Error\s*/i, "")
      .trim();
  }

  // Drop trailing stack / "Called by client" noise.
  text = text
    .replace(/\s+at handler\s*\([^)]*\)[\s\S]*$/i, "")
    .replace(/\s+Called by client\.?\s*$/i, "")
    .trim();

  if (/^client error$/i.test(text)) {
    return "";
  }

  // If multiple lines remain, keep the first meaningful line.
  const firstLine = text.split("\n").map((line) => line.trim()).find(Boolean);
  return firstLine ?? text;
}
