"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";

function NoDatesWorkForm({
  quarterId,
  standing,
  onClose,
}: {
  quarterId: string;
  standing?: { reason: string; suggestedTimes: string };
  onClose: () => void;
}) {
  const save = useMutation(api.hashing.saveNoDatesWork);
  const [reason, setReason] = useState(standing?.reason ?? "");
  const [suggestedTimes, setSuggestedTimes] = useState(standing?.suggestedTimes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await save({ quarterId, reason, suggestedTimes });
      notify.success("Saved. Someone will sort it out with you.");
      onClose();
    } catch (saveError) {
      setError(getConvexErrorMessage(saveError, "Couldn't save that."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="hash-none-reason">Why not?</Label>
        <Textarea id="hash-none-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="hash-none-times">When could you do it?</Label>
        <Input
          id="hash-none-times"
          value={suggestedTimes}
          onChange={(event) => setSuggestedTimes(event.target.value)}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={saving || !reason.trim()} data-testid="hash-none-save" onClick={() => void submit()}>
          Save
        </Button>
      </DialogFooter>
    </div>
  );
}

export function NoDatesWorkDialog({
  open,
  onOpenChange,
  quarterId,
  standing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quarterId: string;
  standing?: { reason: string; suggestedTimes: string };
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="hash-none-dialog">
        <DialogHeader>
          <DialogTitle>None of these work</DialogTitle>
        </DialogHeader>
        {open ? <NoDatesWorkForm quarterId={quarterId} standing={standing} onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}
