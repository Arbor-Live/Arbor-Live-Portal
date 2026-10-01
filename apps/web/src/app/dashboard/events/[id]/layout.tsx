import type { Metadata } from "next";
import { EventEditorLayoutClient } from "@/components/events/event-editor-layout-client";
import { eventTabMetadata } from "@/lib/event-tab-metadata";
import type { Id } from "@/lib/convex-api";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  return eventTabMetadata(params, "Event");
}

export default async function EditEventLayout({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EventEditorLayoutClient eventId={id as Id<"events">} />;
}
