import { EventGroupShell } from "@/components/events/event-group-shell";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import type { Id } from "@/lib/convex-api";

export default async function EventGroupLayout({
  params,
  children,
}: {
  params: Promise<{ groupId: string }>;
  children: React.ReactNode;
}) {
  const { groupId } = await params;
  return (
    <ArborOnlyGuard>
      <EventGroupShell groupId={groupId as Id<"eventSeries">}>{children}</EventGroupShell>
    </ArborOnlyGuard>
  );
}
