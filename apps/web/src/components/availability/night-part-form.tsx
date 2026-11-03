"use client";

import { useMemo, useState } from "react";
import { PlusIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TimeWindow } from "@/lib/crew-availability";
import {
  formatWindow,
  formatWindowList,
  mergeWindows,
  partDraftFromWindows,
  partFreeWindows,
  timeOf,
  type PartBusyDraft,
} from "@/lib/crew-nights";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Night } from "@/components/availability/night-card";

type BusyRow = PartBusyDraft & { key: number; notes: string };
type Section = Night["events"][number]["sections"][number] & { eventTitle: string };

const HOUR = 3_600_000;

/**
 * "Only part" as people think about it: free from–until, minus the times
 * they're busy ("from 2:30, meeting 4–5"). Tapping a section fills the times
 * in; the bar under it shows what will be saved against the night's sections.
 */
export function NightPartForm({
  night,
  savedWindows,
  saving,
  onSave,
}: {
  night: Night;
  savedWindows: TimeWindow[];
  saving: boolean;
  onSave: (windows: TimeWindow[], busyNotes: string[]) => void;
}) {
  // One pill per distinct part: two events with the same "Setup 4–6" share it.
  const sections: Section[] = useMemo(() => {
    const seen = new Set<string>();
    return night.events
      .flatMap((event) => event.sections.map((section) => ({ ...section, eventTitle: event.title })))
      .sort((a, b) => a.startsAt - b.startsAt)
      .filter((section) => {
        const key = `${section.label || section.blockType}|${section.startsAt}|${section.endsAt}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [night.events]);
  const restored = partDraftFromWindows(savedWindows);
  const [from, setFrom] = useState(restored?.from ?? timeOf(night.startsAt));
  const [to, setTo] = useState(restored?.to ?? timeOf(night.endsAt));
  const [busy, setBusy] = useState<BusyRow[]>(
    () => restored?.busy.map((row, key) => ({ ...row, key, notes: "" })) ?? [],
  );
  const [error, setError] = useState<string | null>(null);

  const result = partFreeWindows(night.nightKey, from, to, busy);
  const free = "free" in result ? result.free : [];

  function update(key: number, patch: Partial<BusyRow>) {
    setBusy((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addBusy() {
    setBusy((rows) => [...rows, { key: (rows.at(-1)?.key ?? -1) + 1, start: "", end: "", notes: "" }]);
  }

  /** Sections fully inside the free time. */
  const covered = new Set(
    sections
      .filter((section) => free.some((window) => window.startsAt <= section.startsAt && window.endsAt >= section.endsAt))
      .map((section) => section._id),
  );

  /** Tapping a section adds it to (or takes it out of) the free time; the times follow. */
  function toggleSection(section: Section) {
    // From the whole-night default, the first tap means "just this part".
    const allCovered = sections.every((other) => covered.has(other._id));
    const next = allCovered
      ? [section]
      : covered.has(section._id)
        ? sections.filter((other) => covered.has(other._id) && other._id !== section._id)
        : sections.filter((other) => covered.has(other._id) || other._id === section._id);
    const windows = mergeWindows(next.map(({ startsAt, endsAt }) => ({ startsAt, endsAt })));
    const draft = partDraftFromWindows(windows);
    setError(null);
    if (!draft) {
      setBusy([]);
      return;
    }
    setFrom(draft.from);
    setTo(draft.to);
    setBusy(draft.busy.map((row, key) => ({ ...row, key, notes: "" })));
  }

  function save() {
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError(null);
    onSave(result.free, busy.map((row) => row.notes.trim()).filter(Boolean));
  }

  return (
    <div className="space-y-4 border p-3" data-testid="crew-night-part">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end">
        <div className="space-y-1 sm:w-36">
          <Label htmlFor={`night-from-${night.nightKey}`}>I can do from</Label>
          <TimeField id={`night-from-${night.nightKey}`} value={from} onChange={setFrom} />
        </div>
        <div className="space-y-1 sm:w-36">
          <Label htmlFor={`night-to-${night.nightKey}`}>until</Label>
          <TimeField id={`night-to-${night.nightKey}`} value={to} onChange={setTo} />
        </div>
      </div>

      {sections.length > 1 ? (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Or tap the parts you can do</p>
          <div className="flex flex-wrap gap-2">
            {sections.map((section) => (
              <button
                key={section._id}
                type="button"
                aria-pressed={covered.has(section._id)}
                onClick={() => toggleSection(section)}
                className={cn(
                  "min-h-10 rounded-full border px-3 text-left text-sm transition-colors",
                  covered.has(section._id)
                    ? "border-status-emerald-600 bg-status-emerald-500/15"
                    : "hover:bg-muted",
                )}
              >
                <span className="font-medium">{section.label || section.blockType}</span>{" "}
                <span className="text-muted-foreground tabular-nums">{formatWindow(section)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        {busy.map((row) => (
          <div key={row.key} className="space-y-1.5" data-testid="crew-night-busy">
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <div className="min-w-0 space-y-1 sm:w-36">
                <Label htmlFor={`busy-from-${night.nightKey}-${row.key}`} className="text-xs text-muted-foreground">
                  Busy from
                </Label>
                <TimeField
                  id={`busy-from-${night.nightKey}-${row.key}`}
                  value={row.start}
                  onChange={(start) => update(row.key, { start })}
                />
              </div>
              <div className="min-w-0 space-y-1 sm:w-36">
                <Label htmlFor={`busy-to-${night.nightKey}-${row.key}`} className="text-xs text-muted-foreground">
                  until
                </Label>
                <TimeField
                  id={`busy-to-${night.nightKey}-${row.key}`}
                  value={row.end}
                  onChange={(end) => update(row.key, { end })}
                />
              </div>
            </div>
            {/* Remove sits with "what" so both time fields get half the width on a phone. */}
            <div className="flex items-center gap-2 sm:max-w-sm">
              <Input
                aria-label="What you're busy with"
                placeholder="What is it? (optional, e.g. meeting)"
                className="h-10 min-w-0 flex-1"
                value={row.notes}
                onChange={(event) => update(row.key, { notes: event.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                className="size-10 shrink-0"
                aria-label="Remove busy time"
                onClick={() => setBusy((rows) => rows.filter((other) => other.key !== row.key))}
              >
                <XIcon />
              </Button>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" className="h-10 w-full sm:w-auto" onClick={addBusy}>
          <PlusIcon weight="bold" />
          {busy.length === 0 ? "I'm busy for part of it" : "Another busy time"}
        </Button>
      </div>

      <NightBar night={night} sections={sections} free={free} busy={"busy" in result ? result.busy : []} />

      <p className="text-sm" aria-live="polite">
        {"error" in result ? (
          <span className="text-muted-foreground">{result.error}</span>
        ) : (
          <>
            You&apos;re free <span className="font-medium tabular-nums">{formatWindowList(result.free)}</span>
          </>
        )}
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" className="h-10 w-full sm:w-auto" disabled={saving} onClick={save}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

/** A native time field: the phone's own time wheel, 15-minute steps. */
function TimeField({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  return (
    <Input
      id={id}
      type="time"
      step={900}
      className="h-10 tabular-nums"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** The night as a bar: its sections on top, the time you're free (or busy) below. */
function NightBar({
  night,
  sections,
  free,
  busy,
}: {
  night: Night;
  sections: Section[];
  free: TimeWindow[];
  busy: TimeWindow[];
}) {
  const start = Math.min(night.startsAt, ...free.map((window) => window.startsAt));
  const end = Math.max(night.endsAt, ...free.map((window) => window.endsAt));
  const span = Math.max(end - start, HOUR);
  const place = (window: TimeWindow) => ({
    left: `${((Math.max(window.startsAt, start) - start) / span) * 100}%`,
    width: `${((Math.min(window.endsAt, end) - Math.max(window.startsAt, start)) / span) * 100}%`,
  });
  const firstTick = Math.ceil(start / (2 * HOUR)) * 2 * HOUR;
  const ticks: number[] = [];
  for (let tick = firstTick; tick < end; tick += 2 * HOUR) ticks.push(tick);

  return (
    <div className="space-y-1" aria-hidden data-testid="crew-night-bar">
      <div className="relative h-5">
        {sections.map((section) => (
          <div
            key={section._id}
            className="absolute inset-y-0 truncate border-l border-background bg-muted px-1 text-3xs leading-5 text-muted-foreground"
            style={place(section)}
          >
            {section.label || section.blockType}
          </div>
        ))}
      </div>
      <div className="relative h-4 bg-muted/50">
        {busy.map((window) => (
          <div
            key={`busy-${window.startsAt}`}
            className="absolute inset-y-0 bg-destructive/30"
            style={place(window)}
          />
        ))}
        {free.map((window) => (
          <div key={`free-${window.startsAt}`} className="absolute inset-y-0 bg-status-emerald-500" style={place(window)} />
        ))}
      </div>
      <div className="relative h-3.5 text-3xs text-muted-foreground tabular-nums">
        {ticks.map((tick) => (
          <span key={tick} className="absolute -translate-x-1/2" style={{ left: `${((tick - start) / span) * 100}%` }}>
            {formatTime(tick).replace(":00", "")}
          </span>
        ))}
      </div>
    </div>
  );
}
