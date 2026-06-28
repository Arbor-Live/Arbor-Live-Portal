import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EventSeriesOverview } from "@/components/events/event-series-overview";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import type { Id } from "@/lib/convex-api";

export default async function EventSeriesPage({
  params,
}: {
  params: Promise<{ seriesId: string }>;
}) {
  const { seriesId } = await params;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Event Series</CardTitle>
          <CardDescription>
            Recurring series overview. Each occurrence has its own crew schedule and availability responses.
          </CardDescription>
        </CardHeader>
      </Card>
      <ArborOnlyGuard>
        <EventSeriesOverview seriesId={seriesId as Id<"eventSeries">} />
      </ArborOnlyGuard>
    </div>
  );
}
