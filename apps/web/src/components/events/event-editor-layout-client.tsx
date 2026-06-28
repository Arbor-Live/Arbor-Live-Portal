"use client";

import { usePathname } from "next/navigation";
import { EventEditor } from "@/components/events/event-editor";
import { activeTabFromPathname } from "@/lib/event-editor-tabs";
import type { Id } from "@/lib/convex-api";

export function EventEditorLayoutClient({ eventId }: { eventId?: Id<"events"> }) {
  const pathname = usePathname();
  const activeTab = activeTabFromPathname(pathname, eventId);
  return <EventEditor eventId={eventId} activeTab={activeTab} />;
}
