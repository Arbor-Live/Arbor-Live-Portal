"use client";

import { useMemo, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, MagicWandIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import type { TimelineBlockDraft } from "@/components/events/event-timeline-scheduler";
import { localDateTimeInputToMs } from "@/lib/crew-availability";
import {
  addPacificCalendarDays,
  formatTime,
  pacificDateAndTimeToMs,
  pacificDateKey,
  toPacificDateTimeInput,
} from "@/lib/format";
import { actKeyOf, type BuildRunOfShowInput, type RunOfShowAct } from "@/lib/run-of-show";

const DEFAULT_SET_MINUTES = 45;
const DEFAULT_HEADLINER_MINUTES = 60;

type PlayRow = { act: RunOfShowAct; setMinutes: number };

function timeOf(ms: number) {
  return toPacificDateTimeInput(ms).split("T")[1] ?? "";
}

/** Defaults: first set at the event start, doors a few minutes before. */
const DOORS_BEFORE_START_MINUTES = 5;
const DEFAULT_SOUNDCHECK_MINUTES = 15;
const HOUR = 60 * 60_000;

/** Acts by their current set time, then unscheduled acts in lineup order. */
function defaultPlayOrder(acts: RunOfShowAct[], blocks: TimelineBlockDraft[]) {
  const setStart = new Map<string, number>();
  for (const block of blocks) {
    const key = block.blockType === "set" ? actKeyOf(block) : null;
    const start = key ? localDateTimeInputToMs(block.startsAt) : null;
    if (key && start != null) setStart.set(key, start);
  }
  return acts
    .map((act, index) => ({ act, index, start: setStart.get(act.key) }))
    .sort((a, b) => {
      if (a.start != null && b.start != null) return a.start - b.start || a.index - b.index;
      if (a.start != null) return -1;
      if (b.start != null) return 1;
      return a.index - b.index;
    })
    .map(({ act }) => act);
}

/**
 * Lay out a run of show from the lineup. Play order defaults to the current show
 * order (acts' existing set times), then acts without a set in the order they
 * were added; soundchecks default to the reverse so the openers' gear stays on
 * stage.
 */
export function BuildRunOfShowDialog({
  open,
  onOpenChange,
  acts,
  blocks,
  eventStartAt,
  onBuild,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  acts: RunOfShowAct[];
  blocks: TimelineBlockDraft[];
  eventStartAt: number;
  onBuild: (input: BuildRunOfShowInput) => void;
}) {
  const [doorsTime, setDoorsTime] = useState(() =>
    timeOf(eventStartAt - DOORS_BEFORE_START_MINUTES * 60_000),
  );
  const [firstSetTime, setFirstSetTime] = useState(() => timeOf(eventStartAt));
  const [changeoverMinutes, setChangeoverMinutes] = useState(15);
  const [soundcheckMinutes, setSoundcheckMinutes] = useState(DEFAULT_SOUNDCHECK_MINUTES);
  const [soundcheckOrder, setSoundcheckOrder] = useState<"reverse" | "same">("reverse");
  const [rows, setRows] = useState<PlayRow[]>(() =>
    defaultPlayOrder(acts, blocks).map((act, index, all) => ({
      act,
      setMinutes: index === all.length - 1 ? DEFAULT_HEADLINER_MINUTES : DEFAULT_SET_MINUTES,
    })),
  );

  // The first set is on the event's day (a time well before the start means
  // after midnight); doors are the last occurrence of their time before it.
  const firstSetRaw = pacificDateAndTimeToMs(pacificDateKey(eventStartAt), firstSetTime);
  const firstSetAt =
    firstSetRaw != null && firstSetRaw < eventStartAt - 12 * HOUR
      ? addPacificCalendarDays(firstSetRaw, 1)
      : firstSetRaw;
  const doorsRaw =
    firstSetAt != null ? pacificDateAndTimeToMs(pacificDateKey(firstSetAt), doorsTime) : null;
  const doorsAt =
    doorsRaw != null && firstSetAt != null && doorsRaw > firstSetAt
      ? addPacificCalendarDays(doorsRaw, -1)
      : doorsRaw;

  const preview = useMemo(() => {
    if (doorsAt == null || firstSetAt == null || rows.length === 0) return null;
    const checksStart = doorsAt - rows.length * soundcheckMinutes * 60_000;
    const setsEnd =
      firstSetAt +
      rows.reduce((total, row) => total + row.setMinutes, 0) * 60_000 +
      (rows.length - 1) * changeoverMinutes * 60_000;
    return `Soundchecks ${formatTime(checksStart)} – ${formatTime(doorsAt)} · Doors ${formatTime(doorsAt)} · Sets ${formatTime(firstSetAt)} – ${formatTime(setsEnd)}`;
  }, [doorsAt, firstSetAt, rows, soundcheckMinutes, changeoverMinutes]);

  const replacesExisting = blocks.some(
    (block) =>
      block.blockType === "doors" ||
      block.blockType === "changeover" ||
      rows.some(
        ({ act }) =>
          (act.participationId && block.participationId === act.participationId) ||
          (act.needId && block.needId === act.needId),
      ),
  );

  function move(index: number, delta: -1 | 1) {
    setRows((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  const canBuild = doorsAt != null && firstSetAt != null && rows.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MagicWandIcon className="size-4" />
            Build run of show
          </DialogTitle>
          <DialogDescription>
            Lays out soundchecks, doors, sets, and changeovers from the lineup. Adjust any
            time afterwards.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="ros-doors">Doors</Label>
              <Input
                id="ros-doors"
                type="time"
                value={doorsTime}
                onChange={(event) => setDoorsTime(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ros-first-set">First set</Label>
              <Input
                id="ros-first-set"
                type="time"
                value={firstSetTime}
                onChange={(event) => setFirstSetTime(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ros-changeover">Changeover (min)</Label>
              <NumberInput
                id="ros-changeover"
                min={0}
                step={5}
                value={changeoverMinutes}
                onValueChange={setChangeoverMinutes}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ros-soundcheck">Soundcheck (min each)</Label>
              <NumberInput
                id="ros-soundcheck"
                min={5}
                step={5}
                value={soundcheckMinutes}
                onValueChange={setSoundcheckMinutes}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Soundcheck order</Label>
            <SearchableSelect
              value={soundcheckOrder}
              onChange={(value) => setSoundcheckOrder(value === "same" ? "same" : "reverse")}
              options={[
                { value: "reverse", label: "Reverse of play order (recommended)" },
                { value: "same", label: "Same as play order" },
              ]}
              placeholder="Search order..."
              emptyLabel="Soundcheck order"
            />
          </div>

          <div className="space-y-1">
            <Label>Play order</Label>
            {rows.length === 0 ? (
              <p className="border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                Add acts to the lineup first.
              </p>
            ) : (
              <ol className="divide-y border">
                {rows.map((row, index) => (
                  <li key={row.act.key} className="flex items-center gap-2 px-2 py-1.5">
                    <span className="w-5 text-right text-xs text-muted-foreground tabular-nums">
                      {index + 1}
                    </span>
                    <div className="flex">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Move ${row.act.name} earlier`}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUpIcon className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Move ${row.act.name} later`}
                        disabled={index === rows.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDownIcon className="size-3.5" />
                      </Button>
                    </div>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {row.act.name}
                      {row.act.open ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          open slot
                        </span>
                      ) : null}
                    </span>
                    <NumberInput
                      min={5}
                      step={5}
                      aria-label={`${row.act.name} set length in minutes`}
                      className="h-8 w-20"
                      value={row.setMinutes}
                      onValueChange={(setMinutes) =>
                        setRows((prev) =>
                          prev.map((candidate, i) => (i === index ? { ...candidate, setMinutes } : candidate)),
                        )
                      }
                    />
                    <span className="text-xs text-muted-foreground">min</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Leave ${row.act.name} out`}
                      onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                    >
                      <XIcon className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {preview ? <p className="text-sm text-muted-foreground">{preview}</p> : null}
          {replacesExisting ? (
            <p className="text-sm text-status-amber-700 dark:text-status-amber-300">
              Replaces the current doors, changeovers, and these acts&apos; soundcheck and set
              times. Sections and crew stay as they are.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canBuild}
            onClick={() => {
              if (doorsAt == null || firstSetAt == null) return;
              onBuild({
                playOrder: rows,
                doorsAt,
                firstSetAt,
                changeoverMinutes,
                soundcheckMinutes,
                soundcheckOrder,
                eventStartAt,
              });
              onOpenChange(false);
            }}
          >
            Build
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
