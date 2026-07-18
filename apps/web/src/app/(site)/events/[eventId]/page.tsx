import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicMarketingLayout } from "@/components/public/public-marketing-layout";
import { PublicEventPoster } from "@/components/public/public-event-poster";
import { api } from "@/lib/convex-api";
import { fetchPublicQuerySafe } from "@/lib/convex-server";

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
        <section className="relative overflow-hidden border-b bg-zinc-950 pt-24 pb-12 text-zinc-50 sm:pt-28 sm:pb-16">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,color-mix(in_oklch,var(--color-primary)_30%,transparent),transparent)]"
          />
          <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-8 md:grid-cols-2">
              <div className="min-h-0">
                <PublicEventPoster
                  imageUrl={event.posterImageUrl}
                  eventId={event.eventId}
                  className="w-full rounded-xl object-cover"
                />
              </div>
              <div className="flex flex-col gap-6">
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight">{event.title}</h1>
                  <p className="mt-2 text-zinc-300">
                    {new Date(event.startAt).toLocaleString("en-US", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>

                {event.venueName || event.venueAddress ? (
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
                      Venue
                    </h2>
                    <p className="mt-1">{event.venueName}</p>
                    {event.venueAddress ? <p className="text-sm text-zinc-300">{event.venueAddress}</p> : null}
                    {event.googleMapsUrl ? (
                      <a
                        href={event.googleMapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-sm underline-offset-4 hover:underline text-emerald-400"
                      >
                        View on Google Maps
                      </a>
                    ) : null}
                  </div>
                ) : null}

                {event.host ? (
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
                      Host
                    </h2>
                    <p className="mt-1">{event.host}</p>
                  </div>
                ) : null}

                {event.caption ? (
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
                      About
                    </h2>
                    <p className="mt-1 whitespace-pre-wrap text-base text-zinc-200">{event.caption}</p>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-4 text-sm">
                  <Link
                    href="/events"
                    className="underline-offset-4 hover:underline text-emerald-400"
                  >
                    All events
                  </Link>
                  {event.additionalLinks.map((link) => (
                    <a
                      key={link.url}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline-offset-4 hover:underline text-emerald-400"
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
    </PublicMarketingLayout>
  );
}
