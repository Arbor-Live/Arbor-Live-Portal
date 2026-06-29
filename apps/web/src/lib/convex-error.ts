/**
 * Extract a user-readable message from Convex mutation/query errors.
 */
export function getConvexErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
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

  return fallback;
}
