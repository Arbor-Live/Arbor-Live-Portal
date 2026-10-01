import { CrewAvailabilityInbox } from "@/components/events/crew-availability-inbox";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import { PageHeader } from "@/components/page-header";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My availability",
};

export default function MyAvailabilityPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: "/dashboard/events", label: "Events" }}
        title="My Availability"
        description="Tell the schedulers which events, and which parts of them, you can work."
      />
      <ArborOnlyGuard>
        <CrewAvailabilityInbox />
      </ArborOnlyGuard>
    </div>
  );
}
