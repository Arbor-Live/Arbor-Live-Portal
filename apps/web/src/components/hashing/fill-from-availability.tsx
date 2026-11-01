"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { LightningIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { formatDateTime, plural } from "@/lib/format";
import { notify } from "@/lib/notify";

function FillPreview({ onClose }: { onClose: () => void }) {
  const [now] = useState(() => Date.now());
  const preview = useQuery(api.hashingSchedule.previewFill, { now });
  const applyFill = useMutation(api.hashingSchedule.applyFill);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    setSaving(true);
    setError(null);
    try {
      const { booked } = await applyFill({});
      notify.success(`Booked ${plural(booked, "person", "people")}.`);
      onClose();
    } catch (fillError) {
      setError(getConvexErrorMessage(fillError, "Couldn't fill the dates."));
    } finally {
      setSaving(false);
    }
  }

  if (!preview) return <Skeleton className="h-24 w-full" />;
  const nothing = preview.placements.length === 0;

  return (
    <div className="min-w-0 space-y-3">
      {nothing ? (
        <p className="text-sm text-muted-foreground">Nobody who needs a hash has an open date they can do.</p>
      ) : (
        <ul className="max-h-[50dvh] divide-y overflow-y-auto border text-sm" data-testid="hash-fill-preview">
          {preview.placements.map((row) => (
            <li key={`${row.name}-${row.startsAt}`} className="flex items-baseline justify-between gap-3 px-3 py-2">
              <span className="min-w-0 break-words">{row.name}</span>
              <span className="shrink-0 text-muted-foreground tabular-nums">{formatDateTime(row.startsAt)}</span>
            </li>
          ))}
        </ul>
      )}
      {preview.unplaced.length > 0 ? (
        <p className="text-sm break-words text-muted-foreground">Can&apos;t place: {preview.unplaced.join(", ")}</p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={saving || nothing} data-testid="hash-fill-apply" onClick={() => void apply()}>
          Book {plural(preview.placements.length, "person", "people")}
        </Button>
      </DialogFooter>
    </div>
  );
}

export function FillFromAvailabilityButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" data-testid="hash-fill" onClick={() => setOpen(true)}>
        <LightningIcon aria-hidden />
        Fill from availability
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="hash-fill-dialog">
          <DialogHeader>
            <DialogTitle>Fill from availability</DialogTitle>
          </DialogHeader>
          {open ? <FillPreview onClose={() => setOpen(false)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
