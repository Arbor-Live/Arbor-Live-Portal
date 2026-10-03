import { Suspense } from "react";
import { InsightsShell } from "@/components/insights/insights-shell";
import { AdminOnlyGuard, ArborOnlyGuard } from "@/components/org-context-guard";
import { Skeleton } from "@/components/ui/skeleton";

export default function InsightsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ArborOnlyGuard>
      <AdminOnlyGuard>
        {/* The range lives in search params, which need a Suspense boundary. */}
        <Suspense fallback={<Skeleton className="h-48 w-full" />}>
          <InsightsShell>{children}</InsightsShell>
        </Suspense>
      </AdminOnlyGuard>
    </ArborOnlyGuard>
  );
}
