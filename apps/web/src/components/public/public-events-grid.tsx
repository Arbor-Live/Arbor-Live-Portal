"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Card, CardContent } from "@/components/ui/card";
import { Reveal, Stagger, StaggerItem } from "@/components/landing/landing-motion";

type PublicEventCard = {
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

function EventCard({ event }: { event: PublicEventCard }) {
  return (
    <Card className="h-full overflow-hidden ring-foreground/15">
      {event.posterImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.posterImageUrl} alt="" className="aspect-[4/5] w-full object-cover" />
      ) : (
        <div className="aspect-[4/5] w-full bg-muted" />
      )}
      <CardContent className="space-y-3 p-4">
        <div>
          <h3 className="font-semibold text-foreground">{event.title}</h3>
          <p className="text-sm text-foreground/70">
            {new Date(event.startAt).toLocaleString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
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
  loadingLabel = "Loading events…",
}: {
  events?: PublicEventCard[];
  loadingLabel?: string;
}) {
  if (events === undefined) {
    return <p className="text-sm text-foreground/70">{loadingLabel}</p>;
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

export function LandingUpcomingEvents() {
  const [now] = useState(() => Date.now());
  const events = useQuery(api.publicEvents.listUpcomingTwoWeeks, { now });

  return (
    <section className="border-b bg-muted/35 py-12 sm:py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">Upcoming events</h2>
            <p className="mt-2 text-sm text-foreground/70">The next two weeks at Arbor Live.</p>
          </div>
          <Link
            href="/events"
            className="text-sm font-medium text-emerald-800 underline-offset-4 hover:underline dark:text-primary"
          >
            View all
          </Link>
        </div>
        <div className="mt-8">
          <PublicEventsGrid events={events} />
        </div>
      </div>
    </section>
  );
}
