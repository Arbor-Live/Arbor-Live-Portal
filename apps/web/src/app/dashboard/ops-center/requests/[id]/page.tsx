import type { Metadata } from "next";
import { EventRequestDetailClient } from "@/components/events/event-request-detail";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import { api, type Id } from "@/lib/convex-api";
import { fetchAuthQuery } from "@/lib/auth-server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const request = await fetchAuthQuery(api.eventRequests.get, {
    id: id as Id<"eventRequests">,
  });
  if (!request) return { title: "Booking request" };
  const name = request.eventName?.trim() || `${request.firstName} ${request.lastName}`.trim();
  return { title: `${request.requestNumber} · ${name}` };
}

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
