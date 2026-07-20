"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal, Stagger, StaggerItem } from "@/components/landing/landing-motion";
import { PublicEventPoster } from "@/components/public/public-event-poster";

export type PublicEventCard = {
  eventId: string;
  title: string;
  startAt: number;
  endAt: number;
  venueName?: string;
  host?: string;
  posterImageUrl?: string;
  caption?: string;
  publicEventUrl: string;
  additionalLinks: Array<{ label: string; url: string }>;
};

function formatEventWhen(startAt: number) {
  return new Date(startAt).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function EventCardSkeleton() {
  return (
    <Card className="h-full gap-0 overflow-hidden border border-border py-0 shadow-sm ring-0">
      <Skeleton className="aspect-[4/5] w-full rounded-none" />
      <CardContent className="space-y-3 p-4">
        <div className="space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-24" />
      </CardContent>
    </Card>
  );
}

function EventCarouselCardSkeleton() {
  return (
    <div className="w-[168px] shrink-0 sm:w-[196px]" aria-hidden>
      <div className="overflow-hidden border border-border bg-card shadow-sm">
        <Skeleton className="aspect-[4/5] w-full rounded-none" />
        <div className="space-y-2 p-3">
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      </div>
    </div>
  );
}

function UpcomingEventsCarouselSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="flex gap-3" role="status" aria-label="Loading upcoming events">
      {Array.from({ length: count }, (_, index) => (
        <EventCarouselCardSkeleton key={index} />
      ))}
      <span className="sr-only">Loading events…</span>
    </div>
  );
}

function EventCard({ event }: { event: PublicEventCard }) {
  return (
    <Card className="h-full gap-0 overflow-hidden border border-border py-0 shadow-sm ring-0">
      <PublicEventPoster
        imageUrl={event.posterImageUrl}
        eventId={event.eventId}
        className="w-full"
      />
      <CardContent className="space-y-3 p-4">
        <div>
          <h3 className="font-semibold text-foreground">{event.title}</h3>
          <p className="text-sm text-foreground/70">
            {formatEventWhen(event.startAt)}
            {event.venueName ? ` · ${event.venueName}` : ""}
          </p>
        </div>
        {event.caption ? <p className="text-sm text-foreground/70">{event.caption}</p> : null}
        <div className="flex flex-wrap gap-2 text-sm">
          <Link
            href={event.publicEventUrl}
            className="font-medium text-emerald-800 underline-offset-4 hover:underline dark:text-primary"
          >
            Event details
          </Link>
          {event.additionalLinks.map((link) => (
            <a
              key={`${event.eventId}-${link.url}`}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-emerald-800 underline-offset-4 hover:underline dark:text-primary"
            >
              {link.label}
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function PublicEventsGrid({
  events,
}: {
  events?: PublicEventCard[];
  loadingLabel?: string;
}) {
  if (events === undefined) {
    return (
      <div
        className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        role="status"
        aria-label="Loading upcoming events"
      >
        {Array.from({ length: 6 }, (_, index) => (
          <EventCardSkeleton key={index} />
        ))}
        <span className="sr-only">Loading events…</span>
      </div>
    );
  }
  if (events.length === 0) {
    return <p className="text-sm text-foreground/70">No upcoming public events right now.</p>;
  }
  return (
    <Stagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {events.map((event) => (
        <StaggerItem key={event.eventId}>
          <Reveal>
            <EventCard event={event} />
          </Reveal>
        </StaggerItem>
      ))}
    </Stagger>
  );
}

export function LandingUpcomingEvents({
  excludeEventId,
  limit = 10,
  initialEvents,
}: {
  excludeEventId?: string;
  limit?: number;
  initialEvents?: PublicEventCard[];
} = {}) {
  const [now] = useState(() => Date.now());
  const events = useQuery(api.publicEvents.listUpcoming, {
    now,
    limit: excludeEventId ? limit + 1 : limit,
  });
  const visibleEvents = (events ?? initialEvents)
    ?.filter((event) => event.eventId !== excludeEventId)
    .slice(0, limit);

  return (
    <section className="border-b bg-muted/35 py-12 sm:py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Reveal className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Upcoming events
            </h2>
            <p className="mt-2 text-sm text-foreground/70">Next events at Arbor Live.</p>
          </div>
          <Link
            href="/events"
            className="text-sm font-medium text-emerald-800 underline-offset-4 hover:underline dark:text-primary"
          >
            View all →
          </Link>
        </Reveal>

        <div className="marketing-carousel-scroll mt-8 -mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          {visibleEvents === undefined ? (
            <UpcomingEventsCarouselSkeleton />
          ) : visibleEvents.length === 0 ? (
            <p className="text-sm text-foreground/70">No upcoming public events right now.</p>
          ) : (
            <div className="flex snap-x snap-mandatory gap-3">
              {visibleEvents.map((event) => (
                <Link
                  key={event.eventId}
                  href={event.publicEventUrl}
                  className="group w-[168px] shrink-0 snap-start sm:w-[196px]"
                >
                  <article className="h-full overflow-hidden border border-border bg-card shadow-sm transition-[border-color,box-shadow] group-hover:border-primary/40 group-hover:shadow-md">
                    <PublicEventPoster
                      imageUrl={event.posterImageUrl}
                      eventId={event.eventId}
                      className="w-full"
                    />
                    <div className="space-y-1 bg-card p-3">
                      <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
                        {event.title}
                      </h3>
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {formatEventWhen(event.startAt)}
                        {event.venueName ? ` · ${event.venueName}` : ""}
                      </p>
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
