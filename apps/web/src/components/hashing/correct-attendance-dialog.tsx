"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { formatDate, plural } from "@/lib/format";
import { attendanceConfirmText } from "@/lib/hashing";
import { notify } from "@/lib/notify";

export type AttendanceTarget = { hashDateId: Id<"hashDates">; startsAt: number; lapsed: boolean };

type Person = { userId: string; name: string; offTimecardOverview: boolean };

/** Who was there, after the fact. Pay and credit follow this list. */
export function CorrectAttendanceDialog({ target, onClose }: { target: AttendanceTarget | null; onClose: () => void }) {
  const attendance = useQuery(api.hashingLive.getAttendance, target ? { hashDateId: target.hashDateId } : "skip");

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid="hash-correct-dialog">
        <DialogHeader>
          <DialogTitle>{target ? `Who was there on ${formatDate(target.startsAt)}?` : null}</DialogTitle>
        </DialogHeader>
        {target && attendance ? (
          <AttendanceForm key={target.hashDateId} target={target} attendance={attendance} onClose={onClose} />
        ) : (
          <Skeleton className="h-40 w-full" />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AttendanceForm({
  target,
  attendance,
  onClose,
}: {
  target: AttendanceTarget;
  attendance: { attendeeIds: string[]; rosterIds: string[]; crew: Person[] };
  onClose: () => void;
}) {
  const correct = useMutation(api.hashingLive.correctAttendance);
  const { confirm } = useAppDialog();
  const [there, setThere] = useState(() => new Set([...attendance.attendeeIds, ...attendance.rosterIds]));
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? attendance.crew.filter((person) => person.name.toLowerCase().includes(query)) : attendance.crew;
  }, [attendance.crew, search]);

  const before = new Set(attendance.attendeeIds);
  const nameOf = (userId: string) => attendance.crew.find((person) => person.userId === userId)?.name ?? "Crew";
  const added = [...there].filter((userId) => !before.has(userId)).map(nameOf);
  const removed = attendance.attendeeIds.filter((userId) => !there.has(userId)).map(nameOf);
  const unchanged = added.length === 0 && removed.length === 0;

  function setPerson(userId: string, isThere: boolean) {
    setThere((current) => {
      const next = new Set(current);
      if (isThere) next.add(userId);
      else next.delete(userId);
      return next;
    });
  }

  async function save() {
    const ok = await confirm({
      title: target.lapsed ? `Mark ${formatDate(target.startsAt)} as done?` : `Correct ${formatDate(target.startsAt)}?`,
      description: attendanceConfirmText({ added, removed }),
      destructive: removed.length > 0,
      confirmLabel: target.lapsed ? "Mark as done" : "Save attendance",
    });
    if (!ok) return;
    setSaving(true);
    try {
      await correct({ hashDateId: target.hashDateId, attendeeUserIds: [...there] });
      notify.success(target.lapsed ? "Hash marked as done." : "Attendance corrected.");
      onClose();
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Couldn't correct this hash."));
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Find someone"
        aria-label="Find someone"
        data-testid="hash-correct-search"
      />
      <ul className="max-h-80 divide-y overflow-y-auto border-y">
        {visible.map((person) => {
          const id = `hash-correct-${person.userId}`;
          return (
            <li key={person.userId} className="flex items-center gap-3 py-1">
              <Checkbox
                id={id}
                className="size-5"
                checked={there.has(person.userId)}
                data-testid="hash-correct-person"
                data-person={person.name}
                onCheckedChange={(checked) => setPerson(person.userId, checked === true)}
              />
              <Label htmlFor={id} className="min-h-10 min-w-0 flex-1 items-center font-normal wrap-anywhere">
                {person.name}
              </Label>
              {person.offTimecardOverview ? (
                <span
                  className="shrink-0 rounded bg-status-amber-500/15 px-1.5 py-0.5 text-3xs font-medium uppercase tracking-wide text-status-amber-800 dark:text-status-amber-300"
                  data-testid="hash-correct-off-overview"
                >
                  Not on timecard overview
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-muted-foreground tabular-nums" data-testid="hash-correct-count">
        {plural(there.size, "person", "people")} there
      </p>
      <DialogFooter>
        <Button
          disabled={saving || unchanged || (target.lapsed && there.size === 0)}
          data-testid="hash-correct-save"
          onClick={() => void save()}
        >
          {target.lapsed ? "Mark as done" : "Save attendance"}
        </Button>
      </DialogFooter>
    </div>
  );
}
