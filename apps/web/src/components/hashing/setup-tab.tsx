"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { PlusIcon, SlidersHorizontalIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { FormSaveBar } from "@/components/forms";
import { AddDateDialog, MoveDateDialog } from "@/components/hashing/date-dialogs";
import { EmptyState, RowCell, RowFlag, RowGroup, RowMenu, RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { plural } from "@/lib/format";
import { hashDayLabel, hashTimeRange, WEEKDAYS } from "@/lib/hashing";
import { hashPath } from "@/lib/hashing-tabs";
import { notify } from "@/lib/notify";
import type { useQuery as UseQuery } from "convex/react";
import type { SaveStatus } from "@/hooks/use-convex-form";

type Setup = NonNullable<ReturnType<typeof UseQuery<typeof api.hashingSchedule.getSetup>>>;
type SetupRow = Setup["dates"][number];
type Settings = Setup["settings"];
type Draft = { weekday: number; startTime: string; durationMinutes: string; spotsPerHash: string; location: string };

function toDraft(settings: Settings): Draft {
  return {
    ...settings,
    durationMinutes: String(settings.durationMinutes),
    spotsPerHash: String(settings.spotsPerHash),
  };
}

function SlotForm({ setup }: { setup: Setup }) {
  const saveSetup = useMutation(api.hashingSchedule.saveSetup);
  const { confirm } = useAppDialog();
  const saved = toDraft(setup.settings);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const current = draft ?? saved;
  const dirty = !setup.saved || (draft !== null && JSON.stringify(draft) !== JSON.stringify(saved));

  function update(patch: Partial<Draft>) {
    setDraft({ ...current, ...patch });
    setStatus("idle");
  }

  async function save() {
    const shifting = current.weekday !== saved.weekday || current.startTime !== saved.startTime;
    const affected = [...setup.dates, ...setup.nextDates].filter(
      (row) => row.filled > 0 && row.origin === "regular" && !row.movedFromDateKey && row.status === "scheduled",
    );
    if (setup.saved && shifting && affected.length > 0) {
      const people = affected.reduce((sum, row) => sum + row.filled, 0);
      const ok = await confirm({
        title: `Move ${plural(affected.length, "booked date")}?`,
        description: `${plural(people, "person", "people")} will be asked to confirm, and answers for those dates are cleared.`,
        confirmLabel: "Move dates",
      });
      if (!ok) return;
    }
    setStatus("saving");
    setError(null);
    try {
      await saveSetup({
        weekday: current.weekday,
        startTime: current.startTime,
        durationMinutes: Number(current.durationMinutes),
        spotsPerHash: Number(current.spotsPerHash),
        location: current.location,
      });
      setDraft(null);
      setStatus("idle");
      notify.success("Setup saved.");
    } catch (saveError) {
      setError(getConvexErrorMessage(saveError, "Couldn't save the setup."));
      setStatus("error");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SlidersHorizontalIcon className="size-4 text-muted-foreground" aria-hidden />
          Weekly slot
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label id="hash-weekday-label">Weekday</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={String(current.weekday)}
            onValueChange={(value) => value && update({ weekday: Number(value) })}
            aria-labelledby="hash-weekday-label"
            className="flex-wrap"
          >
            {WEEKDAYS.map((day, index) => (
              <ToggleGroupItem key={day} value={String(index)} aria-label={day} data-testid={`hash-weekday-${index}`}>
                {day.slice(0, 3)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="grid gap-3 sm:grid-cols-[repeat(3,minmax(0,8rem))_minmax(0,1fr)]">
          <div className="space-y-1.5">
            <Label htmlFor="hash-start">Start</Label>
            <Input
              id="hash-start"
              type="time"
              step={900}
              value={current.startTime}
              onChange={(event) => update({ startTime: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hash-length">Minutes</Label>
            <Input
              id="hash-length"
              type="number"
              inputMode="numeric"
              min={15}
              step={15}
              value={current.durationMinutes}
              onChange={(event) => update({ durationMinutes: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hash-people">People</Label>
            <Input
              id="hash-people"
              type="number"
              inputMode="numeric"
              min={1}
              value={current.spotsPerHash}
              onChange={(event) => update({ spotsPerHash: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hash-location">Where</Label>
            <Input
              id="hash-location"
              value={current.location}
              onChange={(event) => update({ location: event.target.value })}
            />
          </div>
        </div>
      </CardContent>
      <FormSaveBar
        tier="C"
        saveStatus={status}
        saveError={error}
        isDirty={dirty}
        saveLabel={setup.saved ? "Save setup" : "Save and build dates"}
        onSave={() => void save()}
        onDiscard={() => {
          setDraft(null);
          setStatus("idle");
        }}
        onRetry={() => void save()}
      />
    </Card>
  );
}

function DateRows({
  rows,
  onMove,
}: {
  rows: SetupRow[];
  onMove: (row: SetupRow) => void;
}) {
  const router = useRouter();
  const setDateOff = useMutation(api.hashingSchedule.setDateOff);
  const removeDate = useMutation(api.hashingSchedule.removeDate);
  const { confirm } = useAppDialog();

  async function attempt(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      notify.success(success);
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Couldn't change this date."));
    }
  }

  async function toggle(row: SetupRow, on: boolean) {
    const label = hashDayLabel(row.dateKey);
    if (!on && row.filled > 0) {
      const ok = await confirm({
        title: `Turn ${label} off?`,
        description: `${plural(row.filled, "person", "people")} will lose this spot and need a hash again.`,
        destructive: true,
        confirmLabel: "Turn off",
      });
      if (!ok) return;
    }
    await attempt(() => setDateOff({ hashDateId: row._id, off: !on }), on ? `${label} is on.` : `${label} is off.`);
  }

  async function remove(row: SetupRow) {
    const label = hashDayLabel(row.dateKey);
    const ok = await confirm({
      title: `Remove ${label}?`,
      description:
        row.filled > 0
          ? `${plural(row.filled, "person", "people")} will go back to needing a hash.`
          : "It comes off the schedule.",
      destructive: true,
      confirmLabel: "Remove date",
    });
    if (ok) await attempt(() => removeDate({ hashDateId: row._id }), `Removed ${label}.`);
  }

  return rows.map((row) => {
    const notStarted = row.status === "scheduled" || row.status === "off";
    return (
      <ListRow
        key={row._id}
        data-testid="hash-setup-row"
        data-date={row.dateKey}
        href={hashPath(row._id)}
        leading={
          notStarted ? (
            <Switch
              checked={row.status === "scheduled"}
              aria-label={`${hashDayLabel(row.dateKey)} on`}
              data-testid="hash-date-switch"
              onCheckedChange={(on) => void toggle(row, on)}
            />
          ) : undefined
        }
        actions={
          notStarted ? (
            <RowMenu label={`More for ${hashDayLabel(row.dateKey)}`}>
              <DropdownMenuItem data-testid="hash-move" onSelect={() => onMove(row)}>
                Move
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => router.push(hashPath(row._id))}>Open</DropdownMenuItem>
              {row.origin === "added" ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => void remove(row)}>
                    Remove
                  </DropdownMenuItem>
                </>
              ) : null}
            </RowMenu>
          ) : undefined
        }
      >
        <RowText
          title={hashDayLabel(row.dateKey)}
          detail={[hashTimeRange(row.startsAt, row.endsAt), row.weekLabel, row.dayNote].filter(Boolean).join(" · ")}
        />
        {row.status === "in_progress" ? <RowFlag tone="emerald">In progress</RowFlag> : null}
        {row.origin === "added" ? <RowFlag tone="neutral">Added</RowFlag> : null}
        {row.movedFromDateKey ? (
          <RowFlag className="hidden sm:inline">Moved from {hashDayLabel(row.movedFromDateKey)}</RowFlag>
        ) : null}
        {row.movedFromDateKey ? <RowFlag className="sm:hidden">Moved</RowFlag> : null}
        <RowCell className="w-14">
          {row.filled} of {row.capacity}
        </RowCell>
      </ListRow>
    );
  });
}

export function SetupTab() {
  const [now] = useState(() => Date.now());
  const setup = useQuery(api.hashingSchedule.getSetup, { now });
  const buildQuarter = useMutation(api.hashingSchedule.buildQuarter);
  const [moving, setMoving] = useState<SetupRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [building, setBuilding] = useState(false);

  if (setup === undefined) return <Skeleton className="h-64 w-full" />;
  if (!setup.quarter) return <EmptyState>The academic calendar has no quarter ahead.</EmptyState>;

  async function build(quarter: { id: string; label: string }) {
    setBuilding(true);
    try {
      await buildQuarter({ quarterId: quarter.id });
      notify.success(`Built ${quarter.label}.`);
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Couldn't build that quarter."));
    } finally {
      setBuilding(false);
    }
  }

  const { quarter, nextQuarter } = setup;
  return (
    <div className="space-y-4" data-testid="hash-setup">
      <SlotForm setup={setup} />

      {setup.saved ? (
        <RowGroup
          title={quarter.label}
          count={setup.dates.length}
          testId="hash-setup-dates"
          aside={
            <Button size="sm" variant="outline" data-testid="hash-add-date" onClick={() => setAdding(true)}>
              <PlusIcon aria-hidden />
              Add a date
            </Button>
          }
        >
          {setup.dates.length > 0 ? <DateRows rows={setup.dates} onMove={setMoving} /> : null}
        </RowGroup>
      ) : null}
      {setup.saved && setup.dates.length === 0 ? (
        <EmptyState
          action={
            <Button size="sm" variant="outline" disabled={building} onClick={() => void build(quarter)}>
              Build {quarter.label}
            </Button>
          }
        >
          No dates ahead in {quarter.label}.
        </EmptyState>
      ) : null}

      {setup.saved && nextQuarter ? (
        setup.nextDates.length > 0 ? (
          <RowGroup title={nextQuarter.label} count={setup.nextDates.length} testId="hash-setup-next">
            <DateRows rows={setup.nextDates} onMove={setMoving} />
          </RowGroup>
        ) : (
          <EmptyState
            action={
              <Button
                size="sm"
                variant="outline"
                disabled={building}
                data-testid="hash-build-next"
                onClick={() => void build(nextQuarter)}
              >
                Build {nextQuarter.label}
              </Button>
            }
          >
            {nextQuarter.label} has no dates yet.
          </EmptyState>
        )
      ) : null}

      <MoveDateDialog row={moving} onClose={() => setMoving(null)} />
      <AddDateDialog open={adding} onClose={() => setAdding(false)} quarterId={quarter.id} />
    </div>
  );
}

