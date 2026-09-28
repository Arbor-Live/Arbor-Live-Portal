import { CrewSchedulingDashboard } from "@/components/events/crew-scheduling-dashboard";
import { AdminOnlyGuard, ArborOnlyGuard } from "@/components/org-context-guard";
import { PageHeader } from "@/components/page-header";

export default function CrewSchedulingPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: "/dashboard/events", label: "Events" }}
        title="Crew Scheduling"
        description="Crewed events in your selected date range (default: next two weeks), with availability response counts from team-matched crew."
      />
      <ArborOnlyGuard>
        <AdminOnlyGuard>
          <CrewSchedulingDashboard />
        </AdminOnlyGuard>
      </ArborOnlyGuard>
    </div>
  );
}
