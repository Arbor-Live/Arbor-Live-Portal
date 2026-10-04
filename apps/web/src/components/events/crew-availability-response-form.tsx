"use client";

import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { CheckIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getConvexErrorMessage } from "@/lib/convex-error";
import {
  formatTimeWindow,
  freeWindowsAround,
  sectionsClearOfBusy,
  windowsOverlap,
  type CrewAvailabilityResponseStatus,
  type TimeWindow,
} from "@/lib/crew-availability";
import { formatDate, toPacificDateTimeInput } from "@/lib/format";
import { notify } from "@/lib/notify";
import { dayKeyForStart, eventDayKeys, timeWindowToMs } from "@/lib/performance-times";
import { cn } from "@/lib/utils";

type Section = {
  _id: Id<"eventScheduleBlocks">;
  blockType: string;
  label: string;
  startsAt: number;
  endsAt: number;
};

type ExistingResponse = {
  responseStatus: CrewAvailabilityResponseStatus;
  partialWindows?: Array<{
    scheduleBlockId?: Id<"eventScheduleBlocks">;
    startsAt: number;
    endsAt: number;
    notes?: string;
  }>;
  busyWindows?: Array<{ startsAt: number; endsAt: number; notes?: string }>;
  notes?: string;
} | null;

type BusyDraft = { key: number; dayKey: string; start: string; end: string; notes: string };

/** One tap answers; "Some of it" opens the section picker. */
const ANSWERS: Array<{ value: CrewAvailabilityResponseStatus; label: string; saved: string }> = [
  { value: "yes", label: "I can work it all", saved: "You're in for the whole event." },
  { value: "partial", label: "Some of it", saved: "Saved the parts you can work." },
  { value: "only_if_necessary", label: "Backup only", saved: "Saved as backup." },
  { value: "no", label: "Can't make it", saved: "Saved: can't make it." },
];

function timeOf(ms: number) {
  return toPacificDateTimeInput(ms).slice(11, 16);
}

function busyDraftToWindow(draft: BusyDraft): TimeWindow | null {
  if (!draft.start || !draft.end) return null;
  const range = timeWindowToMs(draft.dayKey, draft.start, draft.end);
  return range ? { startsAt: range[0], endsAt: range[1] } : null;
}

export function CrewAvailabilityResponseForm({
  eventId,
  eventStartAt,
  eventEndAt,
  scheduleBlocks,
  existingResponse,
  onSaved,
}: {
  eventId: Id<"events">;
  eventStartAt: number;
  eventEndAt: number;
  /** The event's crew sections, in time order. */
  scheduleBlocks: Section[];
  existingResponse: ExistingResponse;
  onSaved?: () => void;
}) {
  const submitResponse = useMutation(api.eventCrewAvailability.submitResponse);
  const span = useMemo<TimeWindow>(
    () => ({
      startsAt: Math.min(eventStartAt, ...scheduleBlocks.map((block) => block.startsAt)),
      endsAt: Math.max(eventEndAt, ...scheduleBlocks.map((block) => block.endsAt)),
    }),
    [eventStartAt, eventEndAt, scheduleBlocks],
  );
  const dayKeys = useMemo(() => eventDayKeys(span.startsAt, span.endsAt), [span]);

  const [status, setStatus] = useState<CrewAvailabilityResponseStatus | null>(
    existingResponse?.responseStatus ?? null,
  );
  const [picked, setPicked] = useState<Set<string>>(() => {
    const ids = existingResponse?.partialWindows
      ?.map((window) => window.scheduleBlockId)
      .filter((id): id is Id<"eventScheduleBlocks"> => Boolean(id));
    return new Set(ids?.length ? ids : scheduleBlocks.map((block) => block._id));
  });
  const [busy, setBusy] = useState<BusyDraft[]>(() =>
    (existingResponse?.busyWindows ?? []).map((window, index) => ({
      key: index,
      dayKey: dayKeyForStart(window.startsAt, dayKeys),
      start: timeOf(window.startsAt),
      end: timeOf(window.endsAt),
      notes: window.notes ?? "",
    })),
  );
  const [notes, setNotes] = useState(existingResponse?.notes ?? "");
  const [showNotes, setShowNotes] = useState(Boolean(existingResponse?.notes));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busyWindows = busy
    .map((draft) => ({ window: busyDraftToWindow(draft), notes: draft.notes.trim() }))
    .filter((entry): entry is { window: TimeWindow; notes: string } => entry.window !== null);

  function updateBusy(key: number, patch: Partial<BusyDraft>) {
    const before = busy.find((draft) => draft.key === key);
    if (!before) return;
    const after = { ...before, ...patch };
    setBusy((prev) => prev.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));
    // A new or moved busy time unchecks the sections it now overlaps.
    const beforeWindow = busyDraftToWindow(before);
    const afterWindow = busyDraftToWindow(after);
    if (!afterWindow) return;
    const clear = new Set(sectionsClearOfBusy(scheduleBlocks, [afterWindow]));
    setPicked((current) => {
      const updated = new Set(current);
      for (const block of scheduleBlocks) {
        const newlyOverlapping =
          !clear.has(block._id) && !(beforeWindow && windowsOverlap(beforeWindow, block));
        if (newlyOverlapping) updated.delete(block._id);
      }
      return updated;
    });
  }

  async function save(nextStatus: CrewAvailabilityResponseStatus) {
    setError(null);
    let partialWindows: Array<{
      scheduleBlockId?: Id<"eventScheduleBlocks">;
      startsAt: number;
      endsAt: number;
    }> | undefined;
    if (nextStatus === "partial") {
      if (busy.some((draft) => (draft.start || draft.end) && !busyDraftToWindow(draft))) {
        setError("Give each busy time a start and an end.");
        return;
      }
      if (scheduleBlocks.length > 0) {
        partialWindows = scheduleBlocks
          .filter((block) => picked.has(block._id))
          .map((block) => ({ scheduleBlockId: block._id, startsAt: block.startsAt, endsAt: block.endsAt }));
        if (partialWindows.length === 0) {
          setError("Tick at least one section, or choose Can't make it.");
          return;
        }
      } else {
        // No sections yet: the free time around the busy times is what they can do.
        partialWindows = freeWindowsAround(span, busyWindows.map((entry) => entry.window));
        if (busyWindows.length === 0 || partialWindows.length === 0) {
          setError("Add the times you're busy, or choose Can't make it.");
          return;
        }
      }
    }

    setSaving(true);
    try {
      await submitResponse({
        eventId,
        responseStatus: nextStatus,
        partialWindows,
        busyWindows:
          nextStatus === "partial" && busyWindows.length > 0
            ? busyWindows.map((entry) => ({ ...entry.window, notes: entry.notes || undefined }))
            : undefined,
        notes: notes.trim() || undefined,
      });
      notify.success(ANSWERS.find((answer) => answer.value === nextStatus)?.saved ?? "Saved.");
      onSaved?.();
    } catch (submitError) {
      setError(getConvexErrorMessage(submitError, "Couldn't save your answer."));
    } finally {
      setSaving(false);
    }
  }

  function choose(value: string) {
    // Tapping the selected answer comes through as "" — treat it as re-confirming
    // that answer (e.g. after the schedule changed) instead of ignoring it.
    const next = (value || status) as CrewAvailabilityResponseStatus | null;
    if (!next) return;
    setStatus(next);
    setError(null);
    // "Some of it" needs details first; everything else saves on tap.
    if (next !== "partial") void save(next);
  }

  const multiDay = dayKeys.length > 1;

  return (
    <div className="space-y-3" data-testid="crew-availability-form">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={status ?? ""}
        onValueChange={choose}
        disabled={saving}
        aria-label="Your availability"
        className="flex-wrap"
      >
        {ANSWERS.map((answer) => (
          <ToggleGroupItem key={answer.value} value={answer.value} aria-label={answer.label}>
            {status === answer.value && existingResponse?.responseStatus === answer.value ? (
              <CheckIcon weight="bold" aria-hidden />
            ) : null}
            {answer.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {status === "partial" ? (
        <div className="space-y-3 border p-3">
          {scheduleBlocks.length > 0 ? (
            <fieldset className="space-y-1.5">
              <legend className="pb-1 text-sm font-medium">Which parts can you work?</legend>
              {scheduleBlocks.map((block) => {
                const id = `avail-${eventId}-${block._id}`;
                const clash = busyWindows.find((entry) => windowsOverlap(entry.window, block));
                return (
                  <div key={block._id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      id={id}
                      checked={picked.has(block._id)}
                      onCheckedChange={(checked) =>
                        setPicked((current) => {
                          const next = new Set(current);
                          if (checked === true) next.add(block._id);
                          else next.delete(block._id);
                          return next;
                        })
                      }
                    />
                    <Label htmlFor={id} className="font-normal">
                      <span className="font-medium">{block.label || block.blockType}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {multiDay ? `${formatDate(block.startsAt)}, ` : ""}
                        {formatTimeWindow(block)}
                      </span>
                    </Label>
                    {clash ? (
                      <span className="text-xs text-status-amber-700">overlaps a busy time</span>
                    ) : null}
                  </div>
                );
              })}
            </fieldset>
          ) : (
            <p className="text-sm text-muted-foreground">
              There&apos;s no crew schedule yet. Add when you&apos;re busy and we&apos;ll plan around it.
            </p>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium">Busy during the event?</p>
            {busy.map((draft) => (
              <div key={draft.key} className="flex flex-wrap items-center gap-2">
                {multiDay ? (
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    size="sm"
                    value={draft.dayKey}
                    onValueChange={(dayKey) => dayKey && updateBusy(draft.key, { dayKey })}
                    aria-label="Day"
                  >
                    {dayKeys.map((dayKey, index) => (
                      <ToggleGroupItem key={dayKey} value={dayKey}>
                        Day {index + 1}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                ) : null}
                <Input
                  type="time"
                  step={900}
                  aria-label="Busy from"
                  className="w-32"
                  value={draft.start}
                  onChange={(e) => updateBusy(draft.key, { start: e.target.value })}
                />
                <span className="text-sm text-muted-foreground">to</span>
                <Input
                  type="time"
                  step={900}
                  aria-label="Busy until"
                  className="w-32"
                  value={draft.end}
                  onChange={(e) => updateBusy(draft.key, { end: e.target.value })}
                />
                <Input
                  placeholder="What (optional)"
                  aria-label="What you're busy with"
                  className="min-w-32 flex-1"
                  value={draft.notes}
                  onChange={(e) => updateBusy(draft.key, { notes: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove busy time"
                  onClick={() => setBusy((prev) => prev.filter((entry) => entry.key !== draft.key))}
                >
                  <XIcon />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setBusy((prev) => [
                  ...prev,
                  {
                    key: (prev.at(-1)?.key ?? -1) + 1,
                    dayKey: dayKeys[0] ?? "",
                    start: "",
                    end: "",
                    notes: "",
                  },
                ])
              }
            >
              <PlusIcon />
              Add a busy time
            </Button>
          </div>

          <div className="space-y-1">
            <Label htmlFor={`avail-notes-${eventId}`} className="text-xs text-muted-foreground">
              Note for the scheduler (optional)
            </Label>
            <Input
              id={`avail-notes-${eventId}`}
              placeholder="e.g. can stay late for strike"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <Button type="button" size="sm" disabled={saving} onClick={() => void save("partial")}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      ) : status ? (
        showNotes ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label="Note for the scheduler"
              placeholder="Note for the scheduler"
              className="min-w-48 flex-1"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void save(status)}>
              Save note
            </Button>
          </div>
        ) : (
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setShowNotes(true)}
          >
            Add a note
          </button>
        )
      ) : null}

      {error ? <p className={cn("text-sm text-destructive")}>{error}</p> : null}
    </div>
  );
}
