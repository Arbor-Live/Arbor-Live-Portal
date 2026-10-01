import { EventEditorLayoutClient } from "@/components/events/event-editor-layout-client";
import type { Id } from "@/lib/convex-api";

// Each tab page (Overview, Run of Show, Lineup, Equipment, Billing, Promo) sets
// its own document title. This layout must not export metadata: a layout title
// string would clear the root `| Arbor Live` title template for those descendants.

export default async function EditEventLayout({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EventEditorLayoutClient eventId={id as Id<"events">} />;
}
