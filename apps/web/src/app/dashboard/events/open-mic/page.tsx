import { OpenMicEventsInbox } from "@/components/events/open-mic-nights-inbox";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import { PageHeader } from "@/components/page-header";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Open Mic",
};

export default function OpenMicPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: "/dashboard/events", label: "Events" }}
        title="Open Mic"
        description="Run first-come, first-served sign-ups for Open Mic. Enable the Open Mic add-on on an event, then open the runner to call performers up one at a time."
      />
      <ArborOnlyGuard>
        <OpenMicEventsInbox />
      </ArborOnlyGuard>
    </div>
  );
}