"use client";

import { EventWorkspace } from "@/components/events/workspace/event-workspace";
import type { Id } from "@/lib/convex-api";

export function EventEditorLayoutClient({ eventId }: { eventId: Id<"events"> }) {
  return <EventWorkspace eventId={eventId} />;
}
