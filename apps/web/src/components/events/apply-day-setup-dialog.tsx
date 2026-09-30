"use client";

import { useState } from "react";
import { CopySimpleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { groupDayNoun, type EventGroupKind } from "@/lib/event-series";

export type ApplyDaySetupArgs = {
  scope: "all" | "future";
  schedule: boolean;
  positions: boolean;
  pullList: boolean;
};

/**
 * "Apply this day's setup to…": the group apply model from one day. The day's
 * sections, open crew slots and positions become the group template, then land
 * on all other days or the later ones. Replaces "copy day setup".
 */
export function ApplyDaySetupDialog({
  open,
  onOpenChange,
  kind,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: EventGroupKind;
  /** Resolves true on success; the dialog stays open on failure. */
  onApply: (args: ApplyDaySetupArgs) => Promise<boolean>;
}) {
  const [scope, setScope] = useState<"all" | "future">("all");
  const [schedule, setSchedule] = useState(true);
  const [positions, setPositions] = useState(true);
  const [pullList, setPullList] = useState(true);
  const [busy, setBusy] = useState(false);
  const noun = groupDayNoun(kind);
  const nouns = groupDayNoun(kind, true);
  const nothingSelected = !schedule && !positions && !pullList;

  async function handleApply() {
    setBusy(true);
    try {
      const ok = await onApply({ scope, schedule, positions, pullList });
      if (ok) onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="apply-day-setup-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CopySimpleIcon className="size-4" aria-hidden />
            Apply this {noun}&apos;s setup
          </DialogTitle>
          <DialogDescription>
            This {noun}&apos;s setup becomes the template and replaces the open slots on the other{" "}
            {nouns}. Assigned crew, booked acts and detached or cancelled {nouns} are never changed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label id="apply-day-setup-scope-label">Apply to</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={scope}
              onValueChange={(value) => value && setScope(value as "all" | "future")}
              aria-labelledby="apply-day-setup-scope-label"
              className="flex w-full"
            >
              <ToggleGroupItem value="all" className="flex-1">
                All other {nouns}
              </ToggleGroupItem>
              <ToggleGroupItem value="future" className="flex-1">
                Later {nouns} only
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="apply-day-setup-schedule"
                checked={schedule}
                onCheckedChange={(value) => setSchedule(value === true)}
              />
              <Label htmlFor="apply-day-setup-schedule">Run of Show sections and open crew slots</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="apply-day-setup-positions"
                checked={positions}
                onCheckedChange={(value) => setPositions(value === true)}
              />
              <Label htmlFor="apply-day-setup-positions">Open lineup positions</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="apply-day-setup-pull-list"
                checked={pullList}
                onCheckedChange={(value) => setPullList(value === true)}
              />
              <Label htmlFor="apply-day-setup-pull-list">Pull list (replaces each {noun}&apos;s list)</Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={busy || nothingSelected} onClick={() => void handleApply()}>
            {busy ? "Applying…" : "Apply setup"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
