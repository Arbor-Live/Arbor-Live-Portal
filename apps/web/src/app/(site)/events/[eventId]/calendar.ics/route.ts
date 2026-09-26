import { api } from "@/lib/convex-api";
import { fetchPublicQuerySafe } from "@/lib/convex-server";
import { buildSingleEventIcs } from "@/lib/event-calendar";

/**
 * One-event ICS for "add this show" on public event pages.
 * Shareable on our domain, same UID as the season feed.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const event = await fetchPublicQuerySafe(
    api.publicEvents.getByEventId,
    { eventId: eventId as import("@/lib/convex-api").Id<"events"> },
    null,
  );
  if (!event) {
    return new Response("Event not found.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const location = [event.venueName, event.venueAddress].filter(Boolean).join(", ");
  const ics = buildSingleEventIcs({
    eventId: event.eventId,
    title: event.title,
    startAt: event.startAt,
    endAt: event.endAt,
    location: location || undefined,
    description: event.caption,
    url: event.publicEventUrl,
  });

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
      "Content-Disposition": 'inline; filename="arbor-live-event.ics"',
    },
  });
}
