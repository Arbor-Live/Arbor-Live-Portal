import { CrewSchedulingDashboard } from "@/components/events/crew-scheduling-dashboard";
import { ArborOnlyGuard, OperationsOrAdminGuard } from "@/components/org-context-guard";
import { PageHeader } from "@/components/page-header";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Crew scheduling",
};

export default function CrewSchedulingPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: "/dashboard/events", label: "Events" }}
        title="Crew Scheduling"
        description="Which crewed events still need crew, section by section, and who has said they can work them."
      />
      <ArborOnlyGuard>
        <OperationsOrAdminGuard>
          {/* The range lives in search params, which need a Suspense boundary. */}
          <Suspense fallback={<Skeleton className="h-48 w-full" />}>
            <CrewSchedulingDashboard />
          </Suspense>
        </OperationsOrAdminGuard>
      </ArborOnlyGuard>
    </div>
  );
}
