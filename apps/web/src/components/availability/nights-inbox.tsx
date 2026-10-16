"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AwayDialog } from "@/components/availability/away-dialog";
import { NightCard, needsAnswer } from "@/components/availability/night-card";
import { UsualEveningsCard } from "@/components/availability/usual-evenings-card";
import { DEFAULT_AVAILABILITY_WEEKS, EXTENDED_AVAILABILITY_WEEKS } from "@/lib/crew-availability";
import { summarizeUsualEvenings } from "@/lib/crew-nights";

/** My Availability: one card per night with crewed events for you, soonest first. */
export function NightsInbox() {
  const [weeks, setWeeks] = useState(DEFAULT_AVAILABILITY_WEEKS);
  const [now] = useState(() => Date.now());
  const [editingUsual, setEditingUsual] = useState(false);

  const nights = useQuery(api.crewNights.listMine, { now, weeksAhead: weeks });
  const usual = useQuery(api.crewNights.getMyUsualEvenings, {});

  const { attention, answered } = useMemo(() => {
    const rows = nights ?? [];
    return {
      attention: rows.filter(needsAnswer),
      answered: rows.filter((night) => !needsAnswer(night)),
    };
  }, [nights]);

  const usualSet = Boolean(usual?.setAt);

  return (
    <div className="space-y-4" data-testid="crew-availability-inbox">
      {usual && !usualSet ? <UsualEveningsCard variant="prompt" /> : null}

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm" data-testid="crew-availability-summary">
          {nights === undefined
            ? "Loading…"
            : [
                attention.length > 0
                  ? `${attention.length} night${attention.length === 1 ? "" : "s"} to answer`
                  : null,
                `${answered.length} answered`,
              ]
                .filter(Boolean)
                .join(" · ")}
        </p>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <AwayDialog />
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={String(weeks)}
            onValueChange={(value) => value && setWeeks(Number(value))}
            aria-label="How far ahead"
          >
            <ToggleGroupItem value={String(DEFAULT_AVAILABILITY_WEEKS)}>
              Next {DEFAULT_AVAILABILITY_WEEKS} weeks
            </ToggleGroupItem>
            <ToggleGroupItem value={String(EXTENDED_AVAILABILITY_WEEKS)}>
              Next {EXTENDED_AVAILABILITY_WEEKS} weeks
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {usual && usualSet ? (
        <div className="space-y-2">
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span>Usual evenings: {summarizeUsualEvenings(usual.usualEvenings) || "not set"}</span>
            <Button
              type="button"
              variant="link"
              size="xs"
              className="h-auto px-0 text-xs"
              onClick={() => setEditingUsual((current) => !current)}
            >
              {editingUsual ? "Close" : "Change"}
            </Button>
          </p>
          {editingUsual ? <UsualEveningsCard variant="settings" onSaved={() => setEditingUsual(false)} /> : null}
        </div>
      ) : null}

      {nights && nights.length === 0 ? (
        <p className="border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          No crewed events for your teams in this window. Nights show up here when events are added.
        </p>
      ) : null}

      {nights && nights.length > 0 && attention.length === 0 ? (
        <p className="text-sm text-muted-foreground">You&apos;re caught up. Every night has an answer.</p>
      ) : null}

      {attention.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Needs your answer</h2>
          <ul className="space-y-2">
            {attention.map((night) => (
              <NightCard key={night.nightKey} night={night} open />
            ))}
          </ul>
        </section>
      ) : null}

      {answered.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Answered</h2>
          <ul className="space-y-2">
            {answered.map((night) => (
              <NightCard key={night.nightKey} night={night} open={false} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
