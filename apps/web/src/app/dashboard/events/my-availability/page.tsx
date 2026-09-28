import { CrewAvailabilityInbox } from "@/components/events/crew-availability-inbox";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import { PageHeader } from "@/components/page-header";

export default function MyAvailabilityPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: "/dashboard/events", label: "Events" }}
        title="My Availability"
        description="Respond to upcoming crewed events for your team. Default view covers the next three weeks."
      />
      <ArborOnlyGuard>
        <CrewAvailabilityInbox />
      </ArborOnlyGuard>
    </div>
  );
}
