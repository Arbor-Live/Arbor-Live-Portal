import { EventEditor } from "@/components/events/event-editor";
import type { Id } from "@/lib/convex-api";

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EventEditor eventId={id as Id<"events">} />;
}
