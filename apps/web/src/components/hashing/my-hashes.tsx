"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CheckIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { EmptyState, RowFlag } from "@/components/list-page";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { pacificDateKey, plural } from "@/lib/format";
import { hashDayLabel, hashTimeRange } from "@/lib/hashing";
import { hashPath } from "@/lib/hashing-tabs";
import { notify } from "@/lib/notify";
import { NoDatesWorkDialog } from "@/components/hashing/no-dates-work-dialog";
import type { useQuery as UseQuery } from "convex/react";

type Mine = NonNullable<ReturnType<typeof UseQuery<typeof api.hashing.getMine>>>;
type HashRow = Mine["dates"][number];

function statusLine(mine: Mine) {
  if (!mine.isCrew) return "Hashing isn't required for you.";
  const booked = mine.dates.find((row) => row.booking);
  switch (mine.state) {
    case "done":
      return `You're done for ${mine.quarter.label}. You hashed on ${hashDayLabel(pacificDateKey(mine.doneAt!))}.`;
    case "exempt":
      return `You're exempt for ${mine.quarter.label}.`;
    case "booked":
      if (booked?.booking === "needs_confirmation") return "Your hash moved. Can you still make it?";
      return booked ? `You're on ${hashDayLabel(booked.dateKey)}, ${hashTimeRange(booked.startsAt, booked.endsAt)}.` : "You're booked.";
    case "no_dates_work":
      return "You told us none of these dates work. Someone will sort it out with you.";
    case "needs_hash":
      return `You need one hash in ${mine.quarter.label}. Mark every date you can do.`;
  }
}

function DateColumn({ dateKey }: { dateKey: string }) {
  const [weekday, monthDay] = hashDayLabel(dateKey).split(", ");
  return (
    <div className="w-14 shrink-0 text-xs text-muted-foreground tabular-nums">
      <p className="font-medium text-foreground">{weekday}</p>
      <p>{monthDay}</p>
    </div>
  );
}

function AnswerToggle({ row }: { row: HashRow }) {
  const setAvailability = useMutation(api.hashing.setAvailability);
  const [saving, setSaving] = useState(false);

  async function choose(value: string) {
    setSaving(true);
    try {
      await setAvailability({ hashDateId: row._id, answer: value === "can" || value === "cant" ? value : null });
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Couldn't save your answer."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={row.answer ?? ""}
      onValueChange={(value) => void choose(value)}
      disabled={saving}
      aria-label={`Your answer for ${hashDayLabel(row.dateKey)}`}
      className="[&>button]:h-10 [&>button]:px-3 sm:[&>button]:h-7"
    >
      <ToggleGroupItem
        value="can"
        data-testid="hash-answer-can"
        className="data-[state=on]:border-status-emerald-500/40 data-[state=on]:bg-status-emerald-500/15 data-[state=on]:text-status-emerald-700 dark:data-[state=on]:text-status-emerald-200"
      >
        {row.answer === "can" ? <CheckIcon weight="bold" aria-hidden /> : null}
        Can do
      </ToggleGroupItem>
      <ToggleGroupItem value="cant" data-testid="hash-answer-cant">
        {row.answer === "cant" ? <CheckIcon weight="bold" aria-hidden /> : null}
        Can&apos;t
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

function BookedActions({ row }: { row: HashRow }) {
  const confirmBooking = useMutation(api.hashing.confirmBooking);
  const giveUpSpot = useMutation(api.hashing.giveUpSpot);
  const { confirm } = useAppDialog();
  const [saving, setSaving] = useState(false);
  const needsConfirmation = row.booking === "needs_confirmation";

  async function run(action: () => Promise<unknown>, success: string) {
    setSaving(true);
    try {
      await action();
      notify.success(success);
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Couldn't save that."));
    } finally {
      setSaving(false);
    }
  }

  async function giveUp() {
    const label = hashDayLabel(row.dateKey);
    const ok = await confirm({
      title: needsConfirmation ? `Can't make ${label}?` : `Give up your spot on ${label}?`,
      description: "The spot opens up, and you'll need another hash this quarter.",
      destructive: true,
      confirmLabel: needsConfirmation ? "Can't make it" : "Give up spot",
    });
    if (ok) await run(() => giveUpSpot({ hashDateId: row._id }), "Your spot is open again.");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {needsConfirmation ? (
        <Button
          size="sm"
          className="h-10 sm:h-7"
          disabled={saving}
          data-testid="hash-confirm"
          onClick={() => void run(() => confirmBooking({ hashDateId: row._id }), "Confirmed.")}
        >
          Confirm
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        className="h-10 sm:h-7"
        disabled={saving}
        data-testid="hash-give-up"
        onClick={() => void giveUp()}
      >
        {needsConfirmation ? "Can't make it" : "Give up spot"}
      </Button>
    </div>
  );
}

function HashRowCard({ row }: { row: HashRow }) {
  const full = row.filled >= row.capacity;
  return (
    <li className="space-y-3 border p-3" data-testid="hash-row" data-date={row.dateKey}>
      <div className="flex gap-3">
        <DateColumn dateKey={row.dateKey} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium tabular-nums">{hashTimeRange(row.startsAt, row.endsAt)}</p>
            <span className="text-xs text-muted-foreground tabular-nums">
              {row.filled} of {row.capacity}
            </span>
            {row.inProgress ? <RowFlag tone="emerald">In progress</RowFlag> : null}
            {row.booking === "booked" ? <RowFlag tone="emerald">Booked</RowFlag> : null}
            {row.booking === "needs_confirmation" ? <RowFlag>Confirm</RowFlag> : null}
            {!row.booking && full ? <RowFlag tone="neutral">Full</RowFlag> : null}
          </div>
          {row.names.length > 0 ? (
            <p className="text-xs break-words text-muted-foreground">{row.names.join(", ")}</p>
          ) : null}
          {row.eventTitle ? (
            <p className="text-xs font-medium break-words text-status-emerald-700 dark:text-status-emerald-300">
              You&apos;re on {row.eventTitle}
            </p>
          ) : null}
        </div>
      </div>
      {row.booking || row.inProgress || !full || row.answer ? (
        <div className="flex flex-wrap items-center gap-2 sm:pl-17">
          {row.booking ? (
            <>
              <Button size="sm" variant={row.inProgress ? "default" : "outline"} className="h-10 sm:h-7" asChild>
                <Link href={hashPath(row._id)}>{row.inProgress ? "Open hash" : "View"}</Link>
              </Button>
              {row.inProgress ? null : <BookedActions row={row} />}
            </>
          ) : row.inProgress ? (
            <Button size="sm" variant="outline" className="h-10 sm:h-7" asChild>
              <Link href={hashPath(row._id)}>View</Link>
            </Button>
          ) : (
            <AnswerToggle row={row} />
          )}
        </div>
      ) : null}
    </li>
  );
}

export function MyHashes() {
  const [now] = useState(() => Date.now());
  const mine = useQuery(api.hashing.getMine, { now });
  const [noneOpen, setNoneOpen] = useState(false);

  if (mine === undefined) return <Skeleton className="h-48 w-full" />;
  if (mine === null) return <EmptyState>The academic calendar has no quarter ahead.</EmptyState>;

  // Once you're set, the other dates aren't yours to answer.
  const settled = mine.state === "done" || mine.state === "exempt" || mine.state === "booked";
  const rows = settled || !mine.isCrew ? mine.dates.filter((row) => row.booking) : mine.dates;
  const canDecline = mine.isCrew && !settled && mine.dates.length > 0;

  return (
    <div className="space-y-3" data-testid="my-hashes">
      <p className="text-sm" data-testid="hashing-status">
        {statusLine(mine)}
      </p>
      {mine.standing?.kind === "no_dates_work" ? (
        <p className="text-sm break-words text-muted-foreground">{mine.standing.reason}</p>
      ) : null}

      {rows.length > 0 ? (
        <>
          {!settled ? (
            <p className="text-sm text-muted-foreground">{plural(rows.length, "date")} ahead, soonest first.</p>
          ) : null}
          <ul className="space-y-2" data-testid="hash-rows">
            {rows.map((row) => (
              <HashRowCard key={row._id} row={row} />
            ))}
          </ul>
        </>
      ) : !settled && mine.isCrew ? (
        <EmptyState>No hash dates yet. They&apos;ll show up here once they&apos;re set.</EmptyState>
      ) : null}

      {canDecline ? (
        <Button variant="outline" size="sm" data-testid="hash-none-work" onClick={() => setNoneOpen(true)}>
          None of these work
        </Button>
      ) : null}
      <NoDatesWorkDialog
        open={noneOpen}
        onOpenChange={setNoneOpen}
        quarterId={mine.quarter.id}
        standing={mine.standing?.kind === "no_dates_work" ? mine.standing : undefined}
      />
    </div>
  );
}
