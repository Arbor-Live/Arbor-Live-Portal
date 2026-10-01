import type { Metadata } from "next";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EventSeriesOverview } from "@/components/events/event-series-overview";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import { api, type Id } from "@/lib/convex-api";
import { fetchAuthQuery } from "@/lib/auth-server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ seriesId: string }>;
}): Promise<Metadata> {
  const { seriesId } = await params;
  const data = await fetchAuthQuery(api.eventSeries.get, {
    id: seriesId as Id<"eventSeries">,
  });
  const title = data?.series.title?.trim();
  return { title: title ? `${title} · Series` : "Event series" };
}

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
