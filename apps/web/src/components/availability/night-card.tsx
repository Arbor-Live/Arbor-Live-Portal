"use client";

import { useState } from "react";
import { useMutation, type useQuery } from "convex/react";
import { CaretDownIcon, CheckIcon, MapPinIcon, PlusIcon, WarningIcon, XIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TimeInput } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import type { TimeWindow } from "@/lib/crew-availability";
import {
  formatWindow,
  freeAroundBusy,
  mergeWindows,
  nightAnswerClass,
  nightAnswerLabel,
  nightDateLabel,
  nightTimesToWindow,
  timeOf,
  usualChipClass,
  usualChipLabel,
} from "@/lib/crew-nights";
import { cn } from "@/lib/utils";

export type Night = NonNullable<ReturnType<typeof useQuery<typeof api.crewNights.listMine>>>[number];

/** One tap per answer, except "Only part", which opens the details. */
type Choice = "free" | "part" | "early" | "backup" | "no";

const SAVED: Record<Choice, string> = {
  free: "Saved: free all night.",
  part: "Saved the part you can do.",
  early: "Saved: early setup only.",
  backup: "Saved as backup.",
  no: "Saved: not this one.",
};

type BusyDraft = { key: number; start: string; end: string; notes: string };

export function needsAnswer(night: Night) {
  return !night.answer || !night.answer.coversNight;
}

function choiceOf(answer: Night["answer"]): Choice | null {
  if (!answer) return null;
  if (answer.status === "partial") return answer.earlySetupOnly ? "early" : "part";
  return answer.status;
}

function DateColumn({ nightKey }: { nightKey: string }) {
  // "Fri, Oct 16, 2026" → "Fri" over "Oct 16".
  const [weekday, monthDay] = nightDateLabel(nightKey).split(", ");
  return (
    <div className="w-14 shrink-0 text-xs text-muted-foreground tabular-nums">
      <p className="font-medium text-foreground">{weekday}</p>
      <p>{monthDay}</p>
    </div>
  );
}

function Chip({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={cn("shrink-0 rounded-md border px-2 py-0.5 text-xs", className)}>{children}</span>;
}

function NightSummary({ night }: { night: Night }) {
  const onEvents = night.events.filter((event) => event.myShiftCount > 0);
  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium tabular-nums">{formatWindow(night)}</p>
        {night.usual && !night.answer ? (
          <Chip className={usualChipClass(night.usual)}>{usualChipLabel(night.usual)}</Chip>
        ) : null}
        {night.answer ? (
          <Chip className={nightAnswerClass(night.answer.status)}>You: {nightAnswerLabel(night.answer)}</Chip>
        ) : null}
      </div>
      <ul className="space-y-0.5 text-xs text-muted-foreground">
        {night.events.map((event) => (
          <li key={event._id} className="flex flex-wrap items-center gap-x-2">
            <span className="font-medium text-foreground">{event.title}</span>
            <span className="tabular-nums">{formatWindow({ startsAt: event.crewStartsAt, endsAt: event.crewEndsAt })}</span>
            {event.venueName ? (
              <span className="inline-flex items-center gap-1">
                <MapPinIcon className="size-3.5" aria-hidden />
                {event.venueName}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {onEvents.length > 0 ? (
        <p className="text-xs font-medium text-status-emerald-700 dark:text-status-emerald-300">
          You&apos;re on: {onEvents.map((event) => event.title).join(", ")}
        </p>
      ) : null}
      {night.answer && !night.answer.coversNight ? (
        <p className="flex items-center gap-1.5 text-xs text-status-amber-700">
          <WarningIcon className="size-3.5" weight="fill" aria-hidden />
          The night got longer after you answered. Check you can still do all of it.
        </p>
      ) : null}
    </div>
  );
}

function NightAnswerForm({ night }: { night: Night }) {
  const answerNight = useMutation(api.crewNights.answerNight);
  const savedChoice = choiceOf(night.answer);
  const [choice, setChoice] = useState<Choice | null>(savedChoice);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState(night.answer?.notes ?? "");
  const [showNotes, setShowNotes] = useState(Boolean(night.answer?.notes));

  const sections = night.events.flatMap((event) =>
    event.sections.map((section) => ({ ...section, eventTitle: event.title })),
  );
  const savedWindows = night.answer?.status === "partial" && !night.answer.earlySetupOnly ? night.answer.windows : [];
  const [mode, setMode] = useState<"sections" | "times">(
    sections.length > 0 && savedWindows.length === 0 ? "sections" : "times",
  );
  const [picked, setPicked] = useState<Set<string>>(
    () =>
      new Set(
        sections
          .filter((section) =>
            savedWindows.some((window) => window.startsAt <= section.startsAt && window.endsAt >= section.endsAt),
          )
          .map((section) => section._id),
      ),
  );
  const firstSaved = savedWindows[0];
  const [from, setFrom] = useState(timeOf(firstSaved?.startsAt ?? night.startsAt));
  const [to, setTo] = useState(timeOf(savedWindows.at(-1)?.endsAt ?? night.endsAt));
  const [busy, setBusy] = useState<BusyDraft[]>([]);

  const usualSuggestion: Choice | null =
    night.usual === "usually" ? "free" : night.usual === "rarely" ? "no" : null;
  const multiEvent = night.events.length > 1;

  async function save(next: Choice, windows?: TimeWindow[], noteText = notes) {
    setError(null);
    setSaving(true);
    try {
      await answerNight({
        nightKey: night.nightKey,
        status: next === "free" ? "free" : next === "backup" ? "backup" : next === "no" ? "no" : "partial",
        windows: next === "part" ? windows : undefined,
        earlySetupOnly: next === "early" ? true : undefined,
        notes: noteText.trim() || undefined,
      });
      notify.success(SAVED[next]);
      return true;
    } catch (saveError) {
      setError(getConvexErrorMessage(saveError, "Couldn't save your answer."));
      return false;
    } finally {
      setSaving(false);
    }
  }

  function partWindows(): TimeWindow[] | null {
    if (mode === "sections") {
      const windows = mergeWindows(
        sections.filter((section) => picked.has(section._id)).map(({ startsAt, endsAt }) => ({ startsAt, endsAt })),
      );
      if (windows.length === 0) {
        setError("Tick at least one part, or choose Not this one.");
        return null;
      }
      return windows;
    }
    const range = nightTimesToWindow(night.nightKey, from, to);
    if (!range) {
      setError("Give a start and an end time.");
      return null;
    }
    const busyWindows: TimeWindow[] = [];
    for (const draft of busy) {
      if (!draft.start && !draft.end) continue;
      const window = nightTimesToWindow(night.nightKey, draft.start, draft.end);
      if (!window) {
        setError("Give each busy time a start and an end.");
        return null;
      }
      busyWindows.push(window);
    }
    const free = freeAroundBusy(range, busyWindows);
    if (free.length === 0) {
      setError("That leaves no free time. Choose Not this one instead.");
      return null;
    }
    return free;
  }

  function choose(value: string) {
    // Tapping the selected answer comes through as "": treat it as confirming it again.
    const next = (value || choice) as Choice | null;
    if (!next) return;
    setChoice(next);
    setError(null);
    if (next !== "part") void save(next);
  }

  function savePart() {
    const windows = partWindows();
    if (!windows) return;
    // What they're busy with rides along on the night's note.
    const busyNotes = mode === "times" ? busy.map((draft) => draft.notes.trim()).filter(Boolean) : [];
    const noteText = [notes.trim(), ...busyNotes.filter((note) => !notes.includes(note))]
      .filter(Boolean)
      .join(" · ");
    setNotes(noteText);
    void save("part", windows, noteText);
  }

  const freeLabel = night.usual === "usually" && !night.answer ? "Confirm" : "I'm free";

  return (
    <div className="space-y-3" data-testid="crew-night-form">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={choice ?? ""}
        onValueChange={choose}
        disabled={saving}
        aria-label="Your answer for this night"
        className="flex-wrap"
      >
        <ToggleGroupItem
          value="free"
          aria-label={freeLabel}
          className={cn(!choice && usualSuggestion === "free" && "border-primary bg-primary/10")}
        >
          {savedChoice === "free" && choice === "free" ? <CheckIcon weight="bold" aria-hidden /> : null}
          {freeLabel}
        </ToggleGroupItem>
        <ToggleGroupItem value="part" aria-label="Only part">
          {savedChoice === "part" && choice === "part" ? <CheckIcon weight="bold" aria-hidden /> : null}
          Only part
        </ToggleGroupItem>
        {night.earlySetup.length > 0 ? (
          <ToggleGroupItem value="early" aria-label="Early setup only">
            {savedChoice === "early" && choice === "early" ? <CheckIcon weight="bold" aria-hidden /> : null}
            Early setup only
          </ToggleGroupItem>
        ) : null}
        <ToggleGroupItem value="backup" aria-label="Backup">
          {savedChoice === "backup" && choice === "backup" ? <CheckIcon weight="bold" aria-hidden /> : null}
          Backup
        </ToggleGroupItem>
        <ToggleGroupItem
          value="no"
          aria-label="Not this one"
          className={cn(!choice && usualSuggestion === "no" && "border-primary bg-primary/10")}
        >
          {savedChoice === "no" && choice === "no" ? <CheckIcon weight="bold" aria-hidden /> : null}
          Not this one
        </ToggleGroupItem>
      </ToggleGroup>

      {choice === "early" && night.earlySetup.length > 0 ? (
        <p className="text-xs text-muted-foreground tabular-nums">
          Early setup {night.earlySetup.map(formatWindow).join(", ")}
        </p>
      ) : null}

      {choice === "part" ? (
        <div className="space-y-3 border p-3" data-testid="crew-night-part">
          {sections.length > 0 ? (
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={0}
              value={mode}
              onValueChange={(value) => value && setMode(value as "sections" | "times")}
              aria-label="How to pick the part"
            >
              <ToggleGroupItem value="sections" className="px-3">
                Pick parts
              </ToggleGroupItem>
              <ToggleGroupItem value="times" className="px-3">
                Pick times
              </ToggleGroupItem>
            </ToggleGroup>
          ) : null}

          {mode === "sections" && sections.length > 0 ? (
            <fieldset className="space-y-1.5">
              <legend className="pb-1 text-sm font-medium">Which parts can you do?</legend>
              {sections.map((section) => {
                const id = `night-${night.nightKey}-${section._id}`;
                return (
                  <div key={section._id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      id={id}
                      checked={picked.has(section._id)}
                      onCheckedChange={(checked) =>
                        setPicked((current) => {
                          const next = new Set(current);
                          if (checked === true) next.add(section._id);
                          else next.delete(section._id);
                          return next;
                        })
                      }
                    />
                    <Label htmlFor={id} className="flex flex-wrap gap-x-1.5 font-normal">
                      <span className="font-medium">{section.label || section.blockType}</span>
                      <span className="text-muted-foreground tabular-nums">{formatWindow(section)}</span>
                      {multiEvent ? <span className="text-muted-foreground">· {section.eventTitle}</span> : null}
                    </Label>
                  </div>
                );
              })}
            </fieldset>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor={`night-from-${night.nightKey}`} className="text-sm font-medium">
                  Free from
                </Label>
                <div className="w-32">
                  <TimeInput id={`night-from-${night.nightKey}`} value={from} onChange={setFrom} />
                </div>
                <Label htmlFor={`night-to-${night.nightKey}`} className="text-sm text-muted-foreground">
                  to
                </Label>
                <div className="w-32">
                  <TimeInput id={`night-to-${night.nightKey}`} value={to} onChange={setTo} />
                </div>
              </div>
              {busy.map((draft) => (
                <div key={draft.key} className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">Busy</span>
                  <Input
                    type="time"
                    step={900}
                    aria-label="Busy from"
                    className="w-32"
                    value={draft.start}
                    onChange={(e) =>
                      setBusy((prev) => prev.map((row) => (row.key === draft.key ? { ...row, start: e.target.value } : row)))
                    }
                  />
                  <span className="text-sm text-muted-foreground">to</span>
                  <Input
                    type="time"
                    step={900}
                    aria-label="Busy until"
                    className="w-32"
                    value={draft.end}
                    onChange={(e) =>
                      setBusy((prev) => prev.map((row) => (row.key === draft.key ? { ...row, end: e.target.value } : row)))
                    }
                  />
                  <Input
                    placeholder="What (optional)"
                    aria-label="What you're busy with"
                    className="min-w-32 flex-1"
                    value={draft.notes}
                    onChange={(e) =>
                      setBusy((prev) => prev.map((row) => (row.key === draft.key ? { ...row, notes: e.target.value } : row)))
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove busy time"
                    onClick={() => setBusy((prev) => prev.filter((row) => row.key !== draft.key))}
                  >
                    <XIcon />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-ml-2.5"
                onClick={() =>
                  setBusy((prev) => [...prev, { key: (prev.at(-1)?.key ?? -1) + 1, start: "", end: "", notes: "" }])
                }
              >
                <PlusIcon weight="bold" />
                Add a busy time
              </Button>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor={`night-notes-${night.nightKey}`} className="text-xs text-muted-foreground">
              Note for the scheduler (optional)
            </Label>
            <Input
              id={`night-notes-${night.nightKey}`}
              placeholder="e.g. class until 7"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <Button type="button" size="sm" disabled={saving} onClick={savePart}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      ) : choice && savedChoice === choice ? (
        showNotes ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label="Note for the scheduler"
              placeholder="Note for the scheduler"
              className="min-w-48 flex-1"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => void save(choice, night.answer?.windows)}
            >
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

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

export function NightCard({ night, open }: { night: Night; open: boolean }) {
  const [expanded, setExpanded] = useState(false);

  if (open) {
    return (
      <li className="space-y-3 border p-3" data-testid="crew-night" data-night={night.nightKey}>
        <div className="flex gap-3">
          <DateColumn nightKey={night.nightKey} />
          <NightSummary night={night} />
        </div>
        <div className="sm:pl-17">
          <NightAnswerForm night={night} />
        </div>
      </li>
    );
  }

  return (
    <li className="border" data-testid="crew-night" data-night={night.nightKey}>
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger asChild>
          <button type="button" className="flex w-full items-start gap-3 p-3 text-left hover:bg-muted/30">
            <DateColumn nightKey={night.nightKey} />
            <NightSummary night={night} />
            <CaretDownIcon
              className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
              aria-hidden
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t p-3 sm:pl-20">
            <NightAnswerForm night={night} />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}
