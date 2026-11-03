"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { AddDateDialog } from "@/components/hashing/date-dialogs";
import { EmptyState, ListSummary, RowGroup, RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { hashDayLabel } from "@/lib/hashing";
import { hashingTabPath } from "@/lib/hashing-tabs";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import type { useQuery as UseQuery } from "convex/react";

type Schedule = NonNullable<ReturnType<typeof UseQuery<typeof api.hashingSchedule.getSchedule>>>;
type Person = Schedule["people"][number];
type DateColumn = Schedule["dates"][number];

const CELL_BUTTON = "h-9 w-full min-w-16 px-1 text-xs";

async function attempt(action: () => Promise<unknown>, fallback: string) {
  try {
    await action();
  } catch (error) {
    notify.error(getConvexErrorMessage(error, fallback));
  }
}

function MatrixCell({ person, date, cell }: { person: Person; date: DateColumn; cell: Person["cells"][number] }) {
  const book = useMutation(api.hashingSchedule.bookPerson);
  const unbook = useMutation(api.hashingSchedule.unbookPerson);
  const [saving, setSaving] = useState(false);
  const full = date.filled >= date.capacity;
  const label = `${person.name}, ${hashDayLabel(date.dateKey)}`;

  async function run(action: () => Promise<unknown>, fallback: string) {
    setSaving(true);
    await attempt(action, fallback);
    setSaving(false);
  }

  if (cell === "booked" || cell === "needs_confirmation") {
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled={saving}
        className={cn(
          CELL_BUTTON,
          cell === "booked"
            ? "bg-status-emerald-500/15 text-status-emerald-700 hover:bg-status-emerald-500/25 dark:text-status-emerald-200"
            : "bg-status-amber-500/15 text-status-amber-800 hover:bg-status-amber-500/25 dark:text-status-amber-200",
        )}
        aria-label={`Unbook ${label}`}
        title={cell === "booked" ? "Click to unbook" : "Hasn't confirmed. Click to unbook"}
        data-testid="hash-cell-booked"
        onClick={() =>
          void run(() => unbook({ hashDateId: date._id, userId: person.userId }), "Couldn't unbook them.")
        }
      >
        {cell === "booked" ? "Booked" : "Confirming"}
      </Button>
    );
  }
  if (cell !== "cant") {
    const blocked = full || person.booked;
    return (
      <Button
        variant={cell === "can" ? "outline" : "ghost"}
        size="sm"
        disabled={saving || blocked}
        className={CELL_BUTTON}
        aria-label={`Book ${label}`}
        title={full ? "This date is full" : person.booked ? "Already booked" : cell === "can" ? "Click to book" : "No answer. Click to book"}
        data-testid={cell === "can" ? "hash-cell-can" : "hash-cell-unanswered"}
        onClick={() =>
          void run(() => book({ hashDateId: date._id, userId: person.userId }), "Couldn't book them.")
        }
      >
        {cell === "can" ? "Can do" : "?"}
      </Button>
    );
  }
  return (
    <span className="block text-center text-muted-foreground" title="Can't">
      –
    </span>
  );
}

function Matrix({ schedule }: { schedule: Schedule }) {
  const { dates, people } = schedule;
  if (people.length === 0) return <EmptyState>Everyone is sorted for this quarter.</EmptyState>;
  if (dates.length === 0) return <EmptyState>No dates left this quarter. Add one to book these people.</EmptyState>;
  return (
    <div className="overflow-x-auto border" data-testid="hash-matrix">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b">
            <th
              scope="col"
              className="sticky left-0 z-10 min-w-36 bg-background px-3 py-2 text-left text-xs font-medium text-muted-foreground sm:min-w-52"
            >
              Person
            </th>
            {dates.map((date) => (
              <th key={date._id} scope="col" className="min-w-20 px-1.5 py-2 text-center font-medium">
                <span className="block text-xs whitespace-nowrap">{hashDayLabel(date.dateKey)}</span>
                <span
                  className={cn(
                    "block text-xs font-normal text-muted-foreground tabular-nums",
                    date.filled >= date.capacity && "text-status-emerald-700 dark:text-status-emerald-300",
                  )}
                >
                  {date.filled} of {date.capacity}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {people.map((person) => (
            <tr key={person.userId} data-testid="hash-matrix-row" data-user={person.name}>
              <th
                scope="row"
                className="sticky left-0 z-10 max-w-36 bg-background px-3 py-1.5 text-left font-medium break-words sm:max-w-52"
              >
                {person.name}
              </th>
              {dates.map((date, index) => (
                <td key={date._id} className="px-1.5 py-1">
                  <MatrixCell person={person} date={date} cell={person.cells[index] ?? null} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExemptDialog({
  person,
  quarterId,
  onClose,
}: {
  person: { userId: string; name: string } | null;
  quarterId: string;
  onClose: () => void;
}) {
  const exempt = useMutation(api.hashingSchedule.exemptPerson);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!person) return;
    setSaving(true);
    setError(null);
    try {
      await exempt({ userId: person.userId, quarterId, reason });
      notify.success(`${person.name} is exempt this quarter.`);
      setReason("");
      onClose();
    } catch (exemptError) {
      setError(getConvexErrorMessage(exemptError, "Couldn't exempt them."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={person !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid="hash-exempt-dialog">
        <DialogHeader>
          <DialogTitle className="break-words">Exempt {person?.name}?</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="hash-exempt-reason">Reason</Label>
          <Textarea id="hash-exempt-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={saving || !reason.trim()} data-testid="hash-exempt-save" onClick={() => void submit()}>
            Exempt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ScheduleTab() {
  const [now] = useState(() => Date.now());
  const schedule = useQuery(api.hashingSchedule.getSchedule, { now });
  const clearExemption = useMutation(api.hashingSchedule.clearExemption);
  const [addFor, setAddFor] = useState<{ bookUserId?: string } | null>(null);
  const [exempting, setExempting] = useState<{ userId: string; name: string } | null>(null);

  if (schedule === undefined) return <Skeleton className="h-64 w-full" />;
  if (schedule === null) return <EmptyState>The academic calendar has no quarter ahead.</EmptyState>;
  if (!schedule.hasDates) {
    return (
      <EmptyState
        action={
          <Button size="sm" variant="outline" asChild>
            <Link href={hashingTabPath("setup")}>Go to Setup</Link>
          </Button>
        }
      >
        {schedule.quarter.label} has no hash dates yet.
      </EmptyState>
    );
  }

  const { summary } = schedule;
  const quarterId = schedule.quarter.id;
  return (
    <div className="space-y-4" data-testid="hash-schedule">
      <ListSummary
        testId="hash-summary"
        order={schedule.people.length > 0 ? "Hardest to place first." : undefined}
      >
        {[
          `${summary.crew} crew`,
          `${summary.hashed} hashed`,
          `${summary.booked} booked`,
          `${summary.needSpot} need a spot`,
          `${summary.spotsOpen} spots open`,
          `${summary.exempt} exempt`,
        ].join(" · ")}
      </ListSummary>

      {schedule.cantMakeAny.length > 0 ? (
        <RowGroup title="Can't make any date" count={schedule.cantMakeAny.length} tone="amber" testId="hash-cant-group">
            {schedule.cantMakeAny.map((person) => (
              <ListRow
                key={person.userId}
                className="flex-wrap sm:flex-nowrap"
                actions={
                  <div className="flex shrink-0 gap-1 pb-2 sm:pb-0">
                    <Button size="sm" variant="outline" onClick={() => setAddFor({ bookUserId: person.userId })}>
                      Add a date
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid="hash-exempt"
                      onClick={() => setExempting({ userId: person.userId, name: person.name })}
                    >
                      Exempt
                    </Button>
                  </div>
                }
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium break-words">{person.name}</p>
                  <p className="text-xs break-words text-muted-foreground">{person.reason}</p>
                  {person.suggestedTimes ? (
                    <p className="text-xs break-words text-muted-foreground">Suggests: {person.suggestedTimes}</p>
                  ) : null}
                </div>
              </ListRow>
            ))}
        </RowGroup>
      ) : null}

      <Matrix schedule={schedule} />

      {schedule.exempt.length > 0 ? (
        <RowGroup title="Exempt" count={schedule.exempt.length}>
            {schedule.exempt.map((person) => (
              <ListRow
                key={person.userId}
                actions={
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void attempt(
                        () => clearExemption({ userId: person.userId, quarterId }),
                        "Couldn't remove the exemption.",
                      )
                    }
                  >
                    Remove
                  </Button>
                }
              >
                <RowText title={person.name} detail={person.reason} />
              </ListRow>
            ))}
        </RowGroup>
      ) : null}

      <div>
        <Button size="sm" variant="outline" data-testid="hash-add-date" onClick={() => setAddFor({})}>
          Add a date
        </Button>
      </div>

      <AddDateDialog
        open={addFor !== null}
        onClose={() => setAddFor(null)}
        quarterId={quarterId}
        bookUserId={addFor?.bookUserId}
      />
      <ExemptDialog person={exempting} quarterId={quarterId} onClose={() => setExempting(null)} />
    </div>
  );
}

