import Link from "next/link";
import { ArrowSquareOutIcon, SlidersHorizontalIcon } from "@phosphor-icons/react/dist/ssr";
import { EventRequestsInbox } from "@/components/events/event-requests-inbox";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Booking requests",
};

export default function EventRequestsPage() {
  return (
    <div className="space-y-4 pb-24">
      <PageHeader
        back={{ href: "/dashboard/ops-center", label: "Ops Center" }}
        title="Booking requests"
        description="Inbound booking requests, from first ask to event. Answer what needs you, and convert accepted requests into tentative events."
        actions={
          <>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/ops-center/requests/settings">
                <SlidersHorizontalIcon />
                Round-robin settings
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/request" target="_blank">
                Open public form
                <ArrowSquareOutIcon className="size-3" aria-hidden />
              </Link>
            </Button>
          </>
        }
      />
      <ArborOnlyGuard>
        <EventRequestsInbox />
      </ArborOnlyGuard>
    </div>
  );
}
