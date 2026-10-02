"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowSquareOutIcon, MicrophoneStageIcon } from "@phosphor-icons/react";
import { SheetField, SheetFields, SheetSection } from "@/components/list-page";
import { api, type Id } from "@/lib/convex-api";
import { formatDateTimeRange, formatTime, pacificDateKey } from "@/lib/format";

function timeRange(startMs: number, endMs: number | null) {
  if (endMs === null) return formatTime(startMs);
  if (pacificDateKey(startMs) !== pacificDateKey(endMs)) return formatDateTimeRange(startMs, endMs);
  return `${formatTime(startMs)} – ${formatTime(endMs)}`;
}

const ROLE_LABELS = { headliner: "Headliner", support: "Support", other: null } as const;

/**
 * What a poster designer needs at a glance: when and where, the doors and show
 * window from the Run of Show, and the bill with set times.
 */
export function PosterBrief({ eventId }: { eventId: Id<"events"> }) {
  const brief = useQuery(api.marketingDesigns.getPosterBrief, { eventId });

  if (brief === undefined) {
    return (
      <SheetSection title="Event details">
        <p className="text-sm text-muted-foreground">Loading event details…</p>
      </SheetSection>
    );
  }
  if (brief === null) return null;

  return (
    <>
      <SheetSection
        title="Event details"
        action={
          <Link
            href={`/dashboard/events/${brief.eventId}`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            Open event
            <ArrowSquareOutIcon className="size-3" aria-hidden />
          </Link>
        }
      >
        <SheetFields>
          <SheetField label="When">{formatDateTimeRange(brief.startAt, brief.endAt)}</SheetField>
          {brief.doorsAt !== null ? <SheetField label="Doors">{formatTime(brief.doorsAt)}</SheetField> : null}
          {brief.showStartsAt !== null ? (
            <SheetField label="Show">{timeRange(brief.showStartsAt, brief.showEndsAt)}</SheetField>
          ) : null}
          <SheetField label="Venue">
            {brief.venueName ?? <span className="text-muted-foreground">No venue yet</span>}
            {brief.venueAddress ? (
              <span className="block text-xs text-muted-foreground">{brief.venueAddress}</span>
            ) : null}
          </SheetField>
          {brief.host ? <SheetField label="Host">{brief.host}</SheetField> : null}
          {brief.eventType ? <SheetField label="Event type">{brief.eventType}</SheetField> : null}
          {brief.expectedTurnout ? (
            <SheetField label="Expected turnout">
              <span className="tabular-nums">{brief.expectedTurnout.toLocaleString()}</span>
            </SheetField>
          ) : null}
        </SheetFields>
      </SheetSection>

      <SheetSection title="Lineup">
        {brief.lineup.length === 0 ? (
          <p className="border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
            No acts on the bill yet.
          </p>
        ) : (
          <ul className="divide-y border text-sm" data-testid="poster-brief-lineup">
            {brief.lineup.map((act) => {
              const role = ROLE_LABELS[act.role];
              return (
                <li key={act.key} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-28 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {act.setStartsAt !== null ? timeRange(act.setStartsAt, act.setEndsAt) : "No set time"}
                  </span>
                  <MicrophoneStageIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={act.kind === "tba" ? "text-muted-foreground italic" : "font-medium"}>
                      {act.kind === "tba" ? `${act.name} (to be announced)` : act.name}
                    </span>
                    {role || act.genres.length ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {[role, act.genres.join(", ")].filter(Boolean).join(" · ")}
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </SheetSection>
    </>
  );
}
