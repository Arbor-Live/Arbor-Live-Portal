import { EventEditorLayoutClient } from "@/components/events/event-editor-layout-client";
import type { Id } from "@/lib/convex-api";

export default async function EditEventLayout({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EventEditorLayoutClient eventId={id as Id<"events">} />;
}
