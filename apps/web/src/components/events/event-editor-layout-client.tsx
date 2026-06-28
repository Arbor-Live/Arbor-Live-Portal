"use client";

import { useParams, usePathname } from "next/navigation";
import { EventEditor } from "@/components/events/event-editor";
import { activeTabFromPathname } from "@/lib/event-editor-tabs";
import type { Id } from "@/lib/convex-api";

export function EventEditorLayoutClient({ eventId: eventIdProp }: { eventId?: Id<"events"> }) {
  const pathname = usePathname();
  const params = useParams();
  const eventId = eventIdProp ?? (params?.id as Id<"events"> | undefined);
  const activeTab = activeTabFromPathname(pathname, eventId);
  return <EventEditor eventId={eventId} activeTab={activeTab} />;
}
