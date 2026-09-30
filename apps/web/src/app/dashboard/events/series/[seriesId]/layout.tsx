import { ArborOnlyGuard } from "@/components/org-context-guard";
import { EventGroupWorkspace } from "@/components/events/group/event-group-workspace";
import type { Id } from "@/lib/convex-api";

export default async function EventGroupLayout({
  params,
}: {
  params: Promise<{ seriesId: string }>;
}) {
  const { seriesId } = await params;
  return (
    <ArborOnlyGuard>
      <EventGroupWorkspace groupId={seriesId as Id<"eventSeries">} />
    </ArborOnlyGuard>
  );
}
