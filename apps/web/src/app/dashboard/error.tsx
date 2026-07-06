"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl space-y-4 py-12">
      <h2 className="text-lg font-medium">Something went wrong</h2>
      <Alert variant="destructive">
        <AlertDescription>
          {error.message || "An unexpected error occurred while loading this page."}
        </AlertDescription>
      </Alert>
      <div className="flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <a href="/dashboard">Back to dashboard</a>
        </Button>
      </div>
    </div>
  );
}
