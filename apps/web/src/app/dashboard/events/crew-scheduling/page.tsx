import { CrewSchedulingDashboard } from "@/components/events/crew-scheduling-dashboard";
import { AdminOnlyGuard, ArborOnlyGuard } from "@/components/org-context-guard";
import { PageHeader } from "@/components/page-header";
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
        <AdminOnlyGuard>
          <CrewSchedulingDashboard />
        </AdminOnlyGuard>
      </ArborOnlyGuard>
    </div>
  );
}
