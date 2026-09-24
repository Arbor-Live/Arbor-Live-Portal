"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { DateTimeRangePicker } from "@/components/ui/date-time-picker";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import { localDateTimeInputToMs, toLocalDateTimeInput } from "@/lib/crew-availability";
import { notify } from "@/lib/notify";
import { getConvexErrorMessage } from "@/lib/convex-error";

type LineupDraft = {
  needId: string;
  setStart: string;
  setEnd: string;
  soundcheckStart: string;
  soundcheckEnd: string;
};

const UNSET = "";

function toDraft(row: {
  needId: string | null | undefined;
  setStartsAt: number | null | undefined;
  setEndsAt: number | null | undefined;
  soundcheckStartsAt: number | null | undefined;
  soundcheckEndsAt: number | null | undefined;
}): LineupDraft {
  return {
    needId: row.needId ?? UNSET,
    setStart: row.setStartsAt != null ? toLocalDateTimeInput(row.setStartsAt) : UNSET,
    setEnd: row.setEndsAt != null ? toLocalDateTimeInput(row.setEndsAt) : UNSET,
    soundcheckStart:
      row.soundcheckStartsAt != null ? toLocalDateTimeInput(row.soundcheckStartsAt) : UNSET,
    soundcheckEnd:
      row.soundcheckEndsAt != null ? toLocalDateTimeInput(row.soundcheckEndsAt) : UNSET,
  };
}

function draftsEqual(a: LineupDraft, b: LineupDraft) {
  return (
    a.needId === b.needId &&
    a.setStart === b.setStart &&
    a.setEnd === b.setEnd &&
    a.soundcheckStart === b.soundcheckStart &&
    a.soundcheckEnd === b.soundcheckEnd
  );
}

/** Optional instant; an empty field means "not set". */
function toMs(value: string) {
  if (!value.trim()) return null;
  return localDateTimeInputToMs(value);
}

export function EventArtistLineupSection({ eventId }: { eventId: Id<"events"> }) {
  return (
    <ArborOnlyGuard>
      <EventArtistLineupPanel eventId={eventId} />
    </ArborOnlyGuard>
  );
}

function EventArtistLineupPanel({ eventId }: { eventId: Id<"events"> }) {
  const data = useQuery(api.eventArtistNeeds.getForEvent, { eventId });
  const updateLineup = useMutation(api.eventBands.updateParticipationLineup);

  const [drafts, setDrafts] = useState<Record<string, LineupDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const seededRef = useRef(false);

  const lineup = useMemo(
    () =>
      [...(data?.lineup ?? [])].sort((a, b) => {
        const aTime = a.setStartsAt ?? Number.MAX_SAFE_INTEGER;
        const bTime = b.setStartsAt ?? Number.MAX_SAFE_INTEGER;
        return aTime - bTime || a.name.localeCompare(b.name);
      }),
    [data?.lineup],
  );

  useEffect(() => {
    if (!data || seededRef.current) return;
    seededRef.current = true;
    const next: Record<string, LineupDraft> = {};
    for (const row of data.lineup) next[row.participationId] = toDraft(row);
    setDrafts(next);
  }, [data]);

  function patchDraft(participationId: string, values: Partial<LineupDraft>) {
    setDrafts((prev) => {
      const current = prev[participationId];
      if (!current) return prev;
      return { ...prev, [participationId]: { ...current, ...values } };
    });
  }

  async function saveRow(participationId: string, server: LineupDraft) {
    const draft = drafts[participationId];
    if (!draft) return;
    setSavingId(participationId);
    try {
      await updateLineup({
        participationId: participationId as Id<"eventBandParticipations">,
        needId: (draft.needId || null) as Id<"eventArtistNeeds"> | null,
        setStartsAt: toMs(draft.setStart),
        setEndsAt: toMs(draft.setEnd),
        soundcheckStartsAt: toMs(draft.soundcheckStart),
        soundcheckEndsAt: toMs(draft.soundcheckEnd),
      });
      notify.success("Lineup updated.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
      // Snap back to the server truth so a rejected edit does not linger.
      setDrafts((prev) => ({ ...prev, [participationId]: server }));
    } finally {
      setSavingId(null);
    }
  }

  const slotOptions = useMemo(
    () => [
      { value: UNSET, label: "No slot" },
      ...(data?.slots ?? []).map((slot) => ({
        value: slot.needId,
        label: slot.label.trim() || defaultSlotLabel(slot.artistType),
        description: slot.genres || undefined,
      })),
    ],
    [data?.slots],
  );

  if (data === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Lineup</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Loading…</CardContent>
      </Card>
    );
  }

  if (lineup.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lineup</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {lineup.map((row) => {
          const server = toDraft(row);
          const draft = drafts[row.participationId] ?? server;
          const dirty = !draftsEqual(draft, server);
          return (
            <div
              key={row.participationId}
              className="space-y-2 rounded-md border p-3"
              data-testid="artist-lineup-row"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">{row.name}</p>
                <span className="text-xs capitalize text-muted-foreground">{row.role}</span>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Set</p>
                  <DateTimeRangePicker
                    startValue={draft.setStart}
                    endValue={draft.setEnd}
                    onChange={(next) =>
                      patchDraft(row.participationId, {
                        setStart: next.start,
                        setEnd: next.end,
                      })
                    }
                    placeholder="When they play"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Soundcheck</p>
                  <DateTimeRangePicker
                    startValue={draft.soundcheckStart}
                    endValue={draft.soundcheckEnd}
                    onChange={(next) =>
                      patchDraft(row.participationId, {
                        soundcheckStart: next.start,
                        soundcheckEnd: next.end,
                      })
                    }
                    placeholder="When to arrive"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Slot</p>
                  <SearchableSelect
                    value={draft.needId}
                    onChange={(value) => patchDraft(row.participationId, { needId: value })}
                    options={slotOptions}
                    placeholder="Slot"
                    emptyLabel="No slot"
                  />
                </div>
              </div>
              {dirty ? (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    disabled={savingId === row.participationId}
                    onClick={() => void saveRow(row.participationId, server)}
                  >
                    {savingId === row.participationId ? "Saving…" : "Save"}
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function defaultSlotLabel(artistType: string) {
  if (artistType === "band") return "Live band";
  if (artistType === "dj") return "DJ";
  return "No preference";
}
