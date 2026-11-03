"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { AirplaneTiltIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";

/** "Dates I'm away": every night in the range is saved as "Not this one". */
export function AwayDialog() {
  const markAway = useMutation(api.crewNights.markAway);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    if (!from) {
      setError("Pick the first day you're away.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const count = await markAway({
        fromNightKey: from,
        toNightKey: to || from,
        notes: notes.trim() || undefined,
      });
      notify.success(`Marked ${count} night${count === 1 ? "" : "s"} as away.`);
      setOpen(false);
      setFrom("");
      setTo("");
      setNotes("");
    } catch (saveError) {
      setError(getConvexErrorMessage(saveError, "Couldn't save those dates."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <AirplaneTiltIcon />
          Dates I&apos;m away
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dates you&apos;re away</DialogTitle>
          <DialogDescription>Every night in these dates is saved as Not this one.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="away-from">First day</Label>
            <DatePickerField id="away-from" value={from} onChange={setFrom} placeholder="Pick a date" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="away-to">Last day</Label>
            <DatePickerField id="away-to" value={to} onChange={setTo} placeholder="Same day" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="away-notes">Note (optional)</Label>
            <Input
              id="away-notes"
              placeholder="e.g. home for break"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={saving} onClick={() => void onSave()}>
            {saving ? "Saving…" : "Save dates"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
