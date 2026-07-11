"use client";

import { ErrorState } from "@/components/error-state";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      error={error}
      reset={reset}
      title="Something went wrong"
      description="We hit a snag while loading this page. Please try again, or head back to the dashboard."
    />
  );
}