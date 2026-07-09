import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicMarketingLayout } from "@/components/public/public-marketing-layout";
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
      <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        {event.posterImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.posterImageUrl}
            alt=""
            className="mb-8 w-full rounded-xl object-cover"
          />
        ) : null}
        <h1 className="text-3xl font-semibold tracking-tight">{event.title}</h1>
        <p className="mt-2 text-muted-foreground">
          {new Date(event.startAt).toLocaleString()}
          {event.venueName ? ` · ${event.venueName}` : ""}
        </p>
        {event.caption ? <p className="mt-6 whitespace-pre-wrap text-base">{event.caption}</p> : null}
        <div className="mt-8 flex flex-wrap gap-4 text-sm">
          <Link href="/events" className="text-primary underline-offset-4 hover:underline">
            All events
          </Link>
          {event.additionalLinks.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              {link.label}
            </a>
          ))}
        </div>
      </article>
    </PublicMarketingLayout>
  );
}
