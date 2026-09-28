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
    <ArborOnlyGuard>
      <EventRequestDetailClient requestId={id as Id<"eventRequests">} />
    </ArborOnlyGuard>
  );
}
