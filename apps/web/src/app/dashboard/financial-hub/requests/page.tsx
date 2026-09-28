import { EventRequestsInbox } from "@/components/events/event-requests-inbox";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import { PageHeader } from "@/components/page-header";

export default function EventRequestsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: "/dashboard/financial-hub", label: "Ops Center" }}
        title="Booking Requests"
        description="Review inbound booking requests and convert them into tentative events."
      />
      <ArborOnlyGuard>
        <EventRequestsInbox />
      </ArborOnlyGuard>
    </div>
  );
}
