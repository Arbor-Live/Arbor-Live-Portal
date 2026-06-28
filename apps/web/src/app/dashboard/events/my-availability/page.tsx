import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CrewAvailabilityInbox } from "@/components/events/crew-availability-inbox";
import { ArborOnlyGuard } from "@/components/org-context-guard";

export default function MyAvailabilityPage() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>My Availability</CardTitle>
          <CardDescription>
            Respond to upcoming crewed events for your team. Default view covers the next three weeks.
          </CardDescription>
        </CardHeader>
      </Card>
      <ArborOnlyGuard>
        <CrewAvailabilityInbox />
      </ArborOnlyGuard>
    </div>
  );
}
