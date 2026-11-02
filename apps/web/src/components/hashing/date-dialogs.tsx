"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { XIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePickerField } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserSelect } from "@/components/users/user-select";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { hashDayLabel, hashStartTime, offWeekLabel } from "@/lib/hashing";
import { notify } from "@/lib/notify";

function OffWeekWarning({ dateKey }: { dateKey: string }) {
  const label = dateKey ? offWeekLabel(dateKey) : null;
  if (!label) return null;
  return (
    <Alert data-testid="hash-off-week-warning">
      <AlertDescription>{hashDayLabel(dateKey)} is in {label}, an off week.</AlertDescription>
    </Alert>
  );
}

export function MoveDateDialog({
  row,
  onClose,
}: {
  row: { _id: Id<"hashDates">; dateKey: string; startsAt: number } | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid="hash-move-dialog">
        <DialogHeader>
          <DialogTitle>{row ? `Move ${hashDayLabel(row.dateKey)}` : "Move"}</DialogTitle>
        </DialogHeader>
        {row ? <MoveDateForm key={row._id} row={row} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function MoveDateForm({
  row,
  onClose,
}: {
  row: { _id: Id<"hashDates">; dateKey: string; startsAt: number };
  onClose: () => void;
}) {
  const moveDate = useMutation(api.hashingSchedule.moveDate);
  const [dateKey, setDateKey] = useState(row.dateKey);
  const [startTime, setStartTime] = useState(hashStartTime(row.startsAt));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await moveDate({ hashDateId: row._id, dateKey, startTime });
      notify.success(`Moved to ${hashDayLabel(dateKey)}.`);
      onClose();
    } catch (moveError) {
      setError(getConvexErrorMessage(moveError, "Couldn't move this date."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="hash-move-date">Date</Label>
          <DatePickerField id="hash-move-date" value={dateKey} onChange={setDateKey} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hash-move-time">Start</Label>
          <Input
            id="hash-move-time"
            type="time"
            step={900}
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
        </div>
      </div>
      <OffWeekWarning dateKey={dateKey} />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={saving || !dateKey || !startTime} data-testid="hash-move-save" onClick={() => void submit()}>
          Move date
        </Button>
      </DialogFooter>
    </div>
  );
}

export function AddDateDialog({
  open,
  onClose,
  quarterId,
  bookUserId,
}: {
  open: boolean;
  onClose: () => void;
  quarterId: string;
  /** Someone to book on it from the start ("Can't make any date"). */
  bookUserId?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent data-testid="hash-add-dialog" className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a date</DialogTitle>
        </DialogHeader>
        {open ? <AddDateForm quarterId={quarterId} bookUserId={bookUserId} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function AddDateForm({
  quarterId,
  bookUserId,
  onClose,
}: {
  quarterId: string;
  bookUserId?: string;
  onClose: () => void;
}) {
  const [now] = useState(() => Date.now());
  const setup = useQuery(api.hashingSchedule.getSetup, { now });
  const schedule = useQuery(api.hashingSchedule.getSchedule, { now });
  const addDate = useMutation(api.hashingSchedule.addDate);
  const [dateKey, setDateKey] = useState("");
  const [time, setTime] = useState<string | null>(null);
  const [capacity, setCapacity] = useState<string | null>(null);
  const [bookUserIds, setBookUserIds] = useState<string[]>(bookUserId ? [bookUserId] : []);
  const [areaIds, setAreaIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startTime = time ?? setup?.settings.startTime ?? "";
  const capacityText = capacity ?? String(setup?.settings.spotsPerHash ?? "");
  const nameOf = new Map(schedule?.unbooked.map((person) => [person.userId, person.name]));
  const options = (schedule?.unbooked ?? [])
    .filter((person) => !bookUserIds.includes(person.userId))
    .map((person) => ({ value: person.userId, label: person.name }));

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await addDate({
        quarterId,
        dateKey,
        startTime,
        capacity: Number(capacityText),
        bookUserIds,
        areaIds,
      });
      notify.success(`Added ${hashDayLabel(dateKey)}.`);
      onClose();
    } catch (addError) {
      setError(getConvexErrorMessage(addError, "Couldn't add this date."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="hash-add-date">Date</Label>
          <DatePickerField id="hash-add-date" value={dateKey} onChange={setDateKey} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hash-add-time">Start</Label>
          <Input
            id="hash-add-time"
            type="time"
            step={900}
            value={startTime}
            onChange={(event) => setTime(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hash-add-capacity">People</Label>
          <Input
            id="hash-add-capacity"
            type="number"
            inputMode="numeric"
            min={1}
            value={capacityText}
            onChange={(event) => setCapacity(event.target.value)}
          />
        </div>
      </div>
      <OffWeekWarning dateKey={dateKey} />

      <div className="space-y-1.5">
        <Label>Book now</Label>
        <UserSelect
          value=""
          onChange={(value) => value && setBookUserIds((ids) => [...ids, value])}
          options={options}
          emptyLabel="Add a person"
        />
        {bookUserIds.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {bookUserIds.map((userId) => (
              <li key={userId} className="inline-flex max-w-full items-center gap-1 border px-2 py-0.5 text-xs">
                <span className="truncate">{nameOf.get(userId) ?? "Crew"}</span>
                <button
                  type="button"
                  aria-label={`Remove ${nameOf.get(userId) ?? "person"}`}
                  onClick={() => setBookUserIds((ids) => ids.filter((id) => id !== userId))}
                >
                  <XIcon className="size-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Only these areas</legend>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {setup?.areas.map((area) => (
            <Label key={area.id} className="flex items-center gap-2 font-normal">
              <Checkbox
                checked={areaIds.includes(area.id)}
                onCheckedChange={(checked) =>
                  setAreaIds((ids) => (checked ? [...ids, area.id] : ids.filter((id) => id !== area.id)))
                }
              />
              {area.name}
            </Label>
          ))}
        </div>
      </fieldset>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={saving || !dateKey || !startTime || !capacityText}
          data-testid="hash-add-save"
          onClick={() => void submit()}
        >
          Add date
        </Button>
      </DialogFooter>
    </div>
  );
}
