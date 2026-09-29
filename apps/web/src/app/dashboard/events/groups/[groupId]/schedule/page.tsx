import { EventGroupTabContent } from "@/components/events/event-group-tab-content";
import type { Id } from "@/lib/convex-api";

export default async function EventGroupSchedulePage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  return <EventGroupTabContent groupId={groupId as Id<"eventSeries">} tab="schedule" />;
}
