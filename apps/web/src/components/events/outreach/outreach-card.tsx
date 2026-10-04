"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { CaretDownIcon, CaretRightIcon, PhoneOutgoingIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { useSessionViewer } from "@/components/session-shell-provider";
import { countOutreach, outreachSummary } from "@/lib/artist-outreach";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OutreachChecklist } from "@/components/events/outreach/outreach-checklist";

/**
 * Outreach on the event's Lineup tab, under the bill, for the Operations team
 * and admins (crew don't book acts). Hidden on events with no artist
 * positions, and collapsed to its summary once every slot is filled.
 */
export function OutreachCard({ eventId, canEdit }: { eventId: Id<"events">; canEdit: boolean }) {
  const viewer = useSessionViewer();
  const canBook = Boolean(viewer?.isAdmin || viewer?.verticals.includes("Operations"));
  const outreach = useQuery(api.eventArtistOutreach.listForEvent, canBook ? { eventId } : "skip");
  // Null follows the bill (open while a slot is open); a click overrides it.
  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(null);
  if (!outreach || (outreach.slots.length === 0 && outreach.rows.length === 0)) return null;
  const allFilled = outreach.slots.every((slot) => !slot.open);
  const expanded = expandedOverride ?? !allFilled;
  const pending = outreach.rows.filter((row) => !row.booked);
  const booked = outreach.rows.length - pending.length;
  const summary = [
    allFilled ? "Every slot is filled" : null,
    pending.length || !booked ? outreachSummary(countOutreach(pending)) : null,
    booked ? `${booked} booked` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card data-testid="outreach-card">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <PhoneOutgoingIcon className="size-4 text-muted-foreground" />
            Outreach
          </CardTitle>
          {expanded ? (
            <p className="text-sm text-muted-foreground">
              Acts you&apos;ve asked to play this date and what they said. Any available act can fill any
              open slot; tag one for a slot when it only fits that one.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="outreach-card-summary">
              {summary}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          onClick={() => setExpandedOverride(!expanded)}
        >
          {expanded ? <CaretDownIcon /> : <CaretRightIcon />}
          {expanded ? "Hide" : "Show"}
        </Button>
      </CardHeader>
      {expanded ? (
        <CardContent>
          <OutreachChecklist eventId={eventId} canEdit={canEdit} idPrefix="lineup" />
        </CardContent>
      ) : null}
    </Card>
  );
}
