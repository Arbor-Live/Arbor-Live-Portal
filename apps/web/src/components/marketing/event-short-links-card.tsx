"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { LinkSimpleIcon, PlusIcon } from "@phosphor-icons/react";
import { EmptyState, RowCell, RowList, RowMenu, RowText, SheetSection } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { StatusPill } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { api, type Id } from "@/lib/convex-api";
import { slugifyShortLinkLabel } from "@/lib/validations/short-links";
import {
  copyShortLink,
  LINK_STATUS_LABELS,
  LINK_STATUS_TONES,
  ShortLinkSheet,
  type ShortLinkRow,
} from "./short-link-sheet";

/**
 * The event's arbor.st links: see what's out there and make a new one already
 * pointed at this event. `card` is the Promo tab's card; `section` sits in a
 * side panel (the design board). Hidden for people without the Marketing
 * vertical (the query returns null for them).
 */
export function EventShortLinksCard({ eventId, eventTitle }: { eventId: Id<"events">; eventTitle: string }) {
  return <EventShortLinks eventId={eventId} eventTitle={eventTitle} frame="card" />;
}

export function EventShortLinks({
  eventId,
  eventTitle,
  frame,
}: {
  eventId: Id<"events">;
  eventTitle: string;
  frame: "card" | "section";
}) {
  const data = useQuery(api.shortLinks.listForEvent, { eventId });
  const [panel, setPanel] = useState<"new" | string | null>(null);

  if (!data) return null;
  const selected = panel && panel !== "new" ? (data.links.find((link) => link._id === panel) ?? null) : null;

  const newButton = (
    <Button type="button" size="sm" variant="outline" onClick={() => setPanel("new")}>
      <PlusIcon />
      New short link
    </Button>
  );

  const list =
    data.links.length === 0 ? (
      <EmptyState>
        {data.publicEventUrl
          ? "No short links yet. A new one points at this event's public page to start."
          : "No short links yet. This event has no public page, so give the link a destination of your own."}
      </EmptyState>
    ) : (
      <RowList joined>
        {data.links.map((link) => (
          <ListRow
            key={link._id}
            data-testid={`event-short-link-${link._id}`}
            onOpen={() => setPanel(link._id)}
            actions={
              <>
                <Button type="button" size="sm" variant="ghost" onClick={() => void copyShortLink(link.slug)}>
                  Copy
                </Button>
                <RowMenu label={`More for /${link.slug}`}>
                  <DropdownMenuItem onSelect={() => setPanel(link._id)}>Open details</DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href={link.destinationUrl} target="_blank" rel="noreferrer">
                      Open destination
                    </a>
                  </DropdownMenuItem>
                </RowMenu>
              </>
            }
          >
            <RowText title={link.label || `/${link.slug}`} detail={`/${link.slug} → ${link.destinationUrl}`} />
            <RowCell className="w-20" muted>
              {link.clickCount} click{link.clickCount === 1 ? "" : "s"}
            </RowCell>
            {frame === "card" ? (
              <StatusPill
                tone={LINK_STATUS_TONES[link.status]}
                className="hidden h-6 w-24 shrink-0 justify-center sm:inline-flex"
              >
                {LINK_STATUS_LABELS[link.status]}
              </StatusPill>
            ) : null}
          </ListRow>
        ))}
      </RowList>
    );

  const sheet = (
    <ShortLinkSheet
      open={panel === "new" || selected !== null}
      link={selected as ShortLinkRow | null}
      defaults={{
        eventId,
        label: eventTitle,
        slug: slugifyShortLinkLabel(eventTitle),
        destinationUrl: data.publicEventUrl ?? "",
      }}
      onOpenChange={(open) => {
        if (!open) setPanel(null);
      }}
    />
  );

  if (frame === "section") {
    return (
      <SheetSection title="Short links" action={newButton}>
        <div data-testid="event-short-links">{list}</div>
        {sheet}
      </SheetSection>
    );
  }

  return (
    <Card data-testid="event-short-links">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <LinkSimpleIcon className="size-4 text-muted-foreground" aria-hidden />
            Short links
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            arbor.st links for this event&apos;s posters, socials and QR codes.
          </p>
        </div>
        {newButton}
      </CardHeader>
      <CardContent>{list}</CardContent>
      {sheet}
    </Card>
  );
}
