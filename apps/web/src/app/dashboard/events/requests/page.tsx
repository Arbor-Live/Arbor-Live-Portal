import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EventRequestsInbox } from "@/components/events/event-requests-inbox";
import { ArborOnlyGuard } from "@/components/org-context-guard";

export default function EventRequestsPage() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Booking Requests</CardTitle>
          <CardDescription>
            Review inbound booking requests and convert them into tentative events.
          </CardDescription>
        </CardHeader>
      </Card>
      <ArborOnlyGuard>
        <EventRequestsInbox />
      </ArborOnlyGuard>
    </div>
  );
}
