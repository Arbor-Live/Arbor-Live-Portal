import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicMarketingLayout } from "@/components/public/public-marketing-layout";
import { PublicEventPoster } from "@/components/public/public-event-poster";
import { PublicStaffDashboardLinks } from "@/components/public/public-staff-dashboard-links";
import { LandingUpcomingEvents } from "@/components/public/public-events-grid";
import { api } from "@/lib/convex-api";
import { fetchPublicQuerySafe } from "@/lib/convex-server";
import { formatDateTime } from "@/lib/format";

type EventDetailPageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function PublicEventDetailPage({ params }: EventDetailPageProps) {
  const { eventId } = await params;
  const event = await fetchPublicQuerySafe(
    api.publicEvents.getByEventId,
    { eventId: eventId as import("@/lib/convex-api").Id<"events"> },
    null,
  );
  if (!event) notFound();

  return (
    <PublicMarketingLayout>
      <article>
        <section className="relative overflow-hidden border-b bg-muted/40 pt-24 pb-12 text-foreground sm:pt-28 sm:pb-16 dark:bg-zinc-950 dark:text-zinc-50">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,color-mix(in_oklch,var(--color-primary)_22%,transparent),transparent)] dark:bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,color-mix(in_oklch,var(--color-primary)_30%,transparent),transparent)]"
          />
          <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-8 md:grid-cols-2">
              <div className="min-h-0">
                <PublicEventPoster
                  imageUrl={event.posterImageUrl}
                  eventId={event.eventId}
                  className="w-full rounded-xl object-cover shadow-sm ring-1 ring-border"
                />
              </div>
              <div className="flex flex-col gap-6">
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight">{event.title}</h1>
                  <p className="mt-2 text-muted-foreground dark:text-zinc-300">
                    {formatDateTime(event.startAt, "long")}
                  </p>
                  <PublicStaffDashboardLinks className="mt-4" eventId={event.eventId} />
                </div>

                {event.venueName || event.venueAddress ? (
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground dark:text-zinc-400">
                      Venue
                    </h2>
                    <p className="mt-1">{event.venueName}</p>
                    {event.venueAddress ? (
                      <p className="text-sm text-muted-foreground dark:text-zinc-300">{event.venueAddress}</p>
                    ) : null}
                    {event.googleMapsUrl ? (
                      <a
                        href={event.googleMapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-sm text-emerald-800 underline-offset-4 hover:underline dark:text-emerald-400"
                      >
                        View on Google Maps
                      </a>
                    ) : null}
                  </div>
                ) : null}

                {event.host ? (
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground dark:text-zinc-400">
                      {event.additionalHosts.length > 0 ? "Hosts" : "Host"}
                    </h2>
                    <p className="mt-1">{event.host}</p>
                  </div>
                ) : null}

                {event.caption ? (
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground dark:text-zinc-400">
                      About
                    </h2>
                    <p className="mt-1 whitespace-pre-wrap text-base text-foreground/80 dark:text-zinc-200">
                      {event.caption}
                    </p>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-4 text-sm">
                  <Link
                    href="/events"
                    className="text-emerald-800 underline-offset-4 hover:underline dark:text-emerald-400"
                  >
                    All events
                  </Link>
                  {event.additionalLinks.map((link) => (
                    <a
                      key={link.url}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-800 underline-offset-4 hover:underline dark:text-emerald-400"
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </article>

      <LandingUpcomingEvents excludeEventId={event.eventId} />
    </PublicMarketingLayout>
  );
}
