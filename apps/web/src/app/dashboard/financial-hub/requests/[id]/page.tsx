import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EventRequestDetailClient } from "@/components/events/event-request-detail";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import type { Id } from "@/lib/convex-api";

export default async function EventRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Booking request</CardTitle>
          <CardDescription>Review submission details and convert to an event when ready.</CardDescription>
        </CardHeader>
      </Card>
      <ArborOnlyGuard>
        <EventRequestDetailClient requestId={id as Id<"eventRequests">} />
      </ArborOnlyGuard>
    </div>
  );
}
