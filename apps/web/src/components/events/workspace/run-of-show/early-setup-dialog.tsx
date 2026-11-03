"use client";

import { useState } from "react";
import { SunHorizonIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import type { TimelineBlockDraft } from "@/components/events/event-timeline-scheduler";
import { formatTime } from "@/lib/format";
import {
  EARLY_SETUP_LEAD_MINUTES,
  planEarlySetup,
  type EarlySetupUntil,
} from "@/lib/run-of-show";

/**
 * Adds an early setup section: a crew who start before everyone else to stage
 * gear, then either stay on or leave once soundchecks start.
 */
export function EarlySetupDialog({
  open,
  onOpenChange,
  blocks,
  withHeadcount,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blocks: TimelineBlockDraft[];
  /** Ask how many people; off where crew aren't edited alongside. */
  withHeadcount: boolean;
  onAdd: (plan: { start: number; end: number; label: string; headcount: number }) => void;
}) {
  const [leadMinutes, setLeadMinutes] = useState(EARLY_SETUP_LEAD_MINUTES);
  const [until, setUntil] = useState<EarlySetupUntil>("setup");
  const [headcount, setHeadcount] = useState(2);
  const plan = planEarlySetup(blocks, { leadMinutes, until });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SunHorizonIcon className="size-4" />
            Add early setup
          </DialogTitle>
          <DialogDescription>
            A small crew starts before everyone else to stage gear, so setup begins with a
            cart run ready to go.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="early-setup-lead">Start before setup (min)</Label>
              <NumberInput
                id="early-setup-lead"
                min={15}
                step={15}
                value={leadMinutes}
                onValueChange={setLeadMinutes}
              />
            </div>
            {withHeadcount ? (
              <div className="space-y-1">
                <Label htmlFor="early-setup-people">People</Label>
                <NumberInput
                  id="early-setup-people"
                  min={1}
                  step={1}
                  value={headcount}
                  onValueChange={setHeadcount}
                />
              </div>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label>Early crew</Label>
            <SearchableSelect
              value={until}
              onChange={(value) => setUntil(value === "soundcheck" ? "soundcheck" : "setup")}
              options={[
                { value: "setup", label: "Stay on for the rest of the night" },
                { value: "soundcheck", label: "Leave when soundchecks start" },
              ]}
              placeholder="Search..."
              emptyLabel="Early crew"
            />
          </div>

          {"error" in plan ? (
            <p className="text-sm text-status-amber-700 dark:text-status-amber-300">{plan.error}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Early setup {formatTime(plan.start)} – {formatTime(plan.end)}.{" "}
              {until === "setup"
                ? "Staff the same people on setup and the rest of the night too."
                : "They're on early setup only; the setup crew run the rest of the night."}
            </p>
          )}
          {withHeadcount && headcount === 1 ? (
            <p className="text-sm text-muted-foreground">
              Someone alone should know the venue, with gear light enough to move solo.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={"error" in plan}
            onClick={() => {
              if ("error" in plan) return;
              onAdd({ ...plan, headcount: Math.max(1, Math.floor(headcount)) });
              onOpenChange(false);
            }}
          >
            Add early setup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
