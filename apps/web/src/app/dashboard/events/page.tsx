import { EventsMainPageClient } from "@/components/events/events-main-page-client";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import { PageHeader } from "@/components/page-header";

export default function EventsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Events"
        description="Track your event calendar and monitor upcoming event states in one place."
      />
      <ArborOnlyGuard>
        <EventsMainPageClient />
      </ArborOnlyGuard>
    </div>
  );
}
