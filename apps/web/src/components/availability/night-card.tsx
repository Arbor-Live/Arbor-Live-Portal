"use client";

import { useState } from "react";
import { useMutation, type useQuery } from "convex/react";
import { CaretDownIcon, CheckIcon, MapPinIcon, WarningIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import type { TimeWindow } from "@/lib/crew-availability";
import {
  formatWindow,
  nightAnswerClass,
  nightAnswerLabel,
  nightDateLabel,
  usualChipClass,
  usualChipLabel,
} from "@/lib/crew-nights";
import { cn } from "@/lib/utils";
import { NightPartForm } from "@/components/availability/night-part-form";

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
  return <span className={cn("max-w-full rounded-md border px-2 py-0.5 text-xs", className)}>{children}</span>;
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

  const savedWindows = night.answer?.status === "partial" && !night.answer.earlySetupOnly ? night.answer.windows : [];

  const usualSuggestion: Choice | null =
    night.usual === "usually" ? "free" : night.usual === "rarely" ? "no" : null;

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

  function choose(value: string) {
    // Tapping the selected answer comes through as "": treat it as confirming it again.
    const next = (value || choice) as Choice | null;
    if (!next) return;
    setChoice(next);
    setError(null);
    if (next !== "part") void save(next);
  }

  function savePart(windows: TimeWindow[], busyNotes: string[]) {
    // What they're busy with rides along on the night's note.
    const segments = notes.split(" · ").map((segment) => segment.trim()).filter(Boolean);
    const noteText = [...new Set([...segments, ...busyNotes])].join(" · ");
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
        // 40px tap targets on phones; compact on wider screens.
        className="flex-wrap [&>button]:h-10 [&>button]:px-3 sm:[&>button]:h-7"
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
        <NightPartForm night={night} savedWindows={savedWindows} saving={saving} onSave={savePart} />
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
