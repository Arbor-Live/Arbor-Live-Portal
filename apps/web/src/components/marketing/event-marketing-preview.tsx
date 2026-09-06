"use client";

import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PublicEventPoster } from "@/components/public/public-event-poster";
import { filterMarketingLinks, type MarketingAdditionalLink } from "@/components/marketing/event-marketing-content-fields";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export type EventMarketingPreviewData = {
  eventId: string;
  title: string;
  startAt?: number;
  venueName?: string;
  posterImageUrl?: string;
  caption?: string;
  additionalLinks: MarketingAdditionalLink[];
  onWebsite?: boolean;
};

function PreviewLabel({ children }: { children: React.ReactNode }) {
  return (
    <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </Label>
  );
}

const PREVIEW_SECTION_CLASS = "w-full min-w-0 space-y-2";

function whenLabel(startAt?: number, venueName?: string) {
  const parts: string[] = [];
  if (startAt != null) parts.push(formatDateTime(startAt, "short"));
  if (venueName?.trim()) parts.push(venueName.trim());
  return parts.join(" · ");
}

export function EventListingCardPreview({
  data,
  className,
}: {
  data: EventMarketingPreviewData;
  className?: string;
}) {
  const title = data.title.trim() || "Your event";
  const caption = data.caption?.trim();
  const links = filterMarketingLinks(data.additionalLinks);
  const meta = whenLabel(data.startAt, data.venueName);

  return (
    <div className={cn(PREVIEW_SECTION_CLASS, className)}>
      <PreviewLabel>Events listing</PreviewLabel>
      <Card className="gap-0 overflow-hidden border border-border/50 bg-background/70 py-0 shadow-sm ring-0">
        <PublicEventPoster
          imageUrl={data.posterImageUrl}
          eventId={data.eventId}
          className="w-full"
        />
        <CardContent className="space-y-2 p-4">
          <div>
            <h3 className="truncate font-semibold text-foreground">{title}</h3>
            {meta ? <p className="text-sm text-muted-foreground">{meta}</p> : null}
          </div>
          {caption ? (
            <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
              {caption}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Add a description</p>
          )}
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="font-medium text-emerald-800 dark:text-primary">Event details</span>
            {links.map((link) => (
              <span
                key={`${link.label}:${link.url}`}
                className="font-medium text-emerald-800 dark:text-primary"
              >
                {link.label}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function EventPagePreview({
  data,
  className,
}: {
  data: EventMarketingPreviewData;
  className?: string;
}) {
  const title = data.title.trim() || "Your event";
  const caption = data.caption?.trim();
  const links = filterMarketingLinks(data.additionalLinks);
  const when = data.startAt != null ? formatDateTime(data.startAt, "long") : null;

  return (
    <div className={cn(PREVIEW_SECTION_CLASS, className)}>
      <PreviewLabel>Event page</PreviewLabel>
      <div className="overflow-hidden border bg-background shadow-sm">
        <div className="space-y-4 bg-muted/40 p-4 dark:bg-zinc-950">
          <PublicEventPoster
            imageUrl={data.posterImageUrl}
            eventId={data.eventId}
            className="w-full rounded-lg object-cover shadow-sm ring-1 ring-border"
          />
          <div className="space-y-3">
            <div>
              <h2 className="truncate text-lg font-semibold tracking-tight">{title}</h2>
              {when ? <p className="mt-1 text-sm text-muted-foreground">{when}</p> : null}
            </div>
            {data.venueName?.trim() ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Venue
                </p>
                <p className="mt-0.5 text-sm">{data.venueName.trim()}</p>
              </div>
            ) : null}
            {caption ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  About
                </p>
                <p className="mt-0.5 line-clamp-5 whitespace-pre-wrap text-sm text-foreground/80">
                  {caption}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No description yet.</p>
            )}
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="text-emerald-800 dark:text-emerald-400">All events</span>
              {links.map((link) => (
                <span
                  key={`${link.label}:${link.url}`}
                  className="text-emerald-800 dark:text-emerald-400"
                >
                  {link.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function EventMarketingPreviewPanel({
  data,
  className,
}: {
  data: EventMarketingPreviewData;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-4", className)}>
      <div className="space-y-1">
        <CardTitle className="text-sm">Live preview</CardTitle>
        <CardDescription>
          {data.onWebsite
            ? "This is how your event appears on the public site."
            : "How this will look once Arbor publishes it to the public event page."}
        </CardDescription>
      </div>
      <div className="flex w-full min-w-0 flex-col gap-6">
        <EventListingCardPreview data={data} />
        <EventPagePreview data={data} />
      </div>
    </div>
  );
}
