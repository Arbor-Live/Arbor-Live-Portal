import { Suspense } from "react";
import { InsightsShell } from "@/components/insights/insights-shell";
import { ArborOnlyGuard, OperationsOrAdminGuard } from "@/components/org-context-guard";
import { Skeleton } from "@/components/ui/skeleton";

export default function InsightsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ArborOnlyGuard>
      <OperationsOrAdminGuard>
        {/* The range lives in search params, which need a Suspense boundary. */}
        <Suspense fallback={<Skeleton className="h-48 w-full" />}>
          <InsightsShell>{children}</InsightsShell>
        </Suspense>
      </OperationsOrAdminGuard>
    </ArborOnlyGuard>
  );
}
