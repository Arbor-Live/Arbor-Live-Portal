"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
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
import { SearchableSelect, type SearchableSelectOption } from "@/components/inventory/searchable-select";
import type { UserSelectOption } from "@/components/users/user-select";
import {
  PROGRESS_LABELS,
  applicationProgress,
} from "@/components/users/crew-applications/crew-application-progress";
import {
  TraineeAssignForm,
  crewApplicationContext,
  type CrewApplicationRow,
  type TraineeAssignArgs,
} from "@/components/users/crew-applications/crew-application-sheet";
import { api, type Id } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { useNow } from "@/lib/use-now";

const FORM_ID = "event-assign-trainee";

/**
 * Assign a crew applicant to shadow this event, from the event's crew board.
 * Same mutation as Crew applications: it saves right away and sends the intro
 * email and calendar invite.
 */
export function AssignTraineeDialog({
  open,
  onOpenChange,
  eventId,
  staffOptions,
  assignedApplicationIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: Id<"events">;
  staffOptions: UserSelectOption[];
  /** Applicants already shadowing this event; assigning one again moves them. */
  assignedApplicationIds: ReadonlySet<string>;
}) {
  const [applicationId, setApplicationId] = useState("");
  const [pending, setPending] = useState(false);
  const now = useNow(60_000);
  const applications = useQuery(
    api.crewApplications.listAdmin,
    open ? { statuses: ["submitted", "trainee"] } : "skip",
  );
  const assignTrainee = useMutation(api.crewApplications.assignTraineeToEvent);

  const rows = useMemo(() => (applications ?? []) as CrewApplicationRow[], [applications]);
  const options = useMemo<SearchableSelectOption[]>(() => {
    // Applicants staff have met are the ones ready for a training event.
    const ready = (row: CrewApplicationRow) => applicationProgress(row, now) === "met";
    return [...rows]
      .sort((a, b) => Number(ready(b)) - Number(ready(a)))
      .map((row) => ({
        value: row._id,
        label: row.name,
        description: [
          PROGRESS_LABELS[applicationProgress(row, now)],
          crewApplicationContext(row),
          assignedApplicationIds.has(row._id) ? "Already on this event" : null,
        ]
          .filter(Boolean)
          .join(" · "),
        keywords: `${row.email} ${row.phone}`,
      }));
  }, [rows, now, assignedApplicationIds]);
  const applicant = rows.find((row) => row._id === applicationId);

  function close(next: boolean) {
    if (pending) return;
    if (!next) setApplicationId("");
    onOpenChange(next);
  }

  async function submit(getArgs: () => TraineeAssignArgs) {
    if (!applicant) {
      notify.error("Pick an applicant.");
      return;
    }
    let args: TraineeAssignArgs;
    try {
      args = getArgs();
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
      return;
    }
    setPending(true);
    try {
      await assignTrainee({ applicationId: applicant._id, ...args });
      notify.success(`${applicant.name} is shadowing this event`);
      setApplicationId("");
      onOpenChange(false);
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg" data-testid="assign-trainee-dialog">
        <DialogHeader>
          <DialogTitle>Assign a trainee</DialogTitle>
          <DialogDescription>
            They shadow the crew and don&apos;t fill a slot. They get an intro email and a calendar
            invite as soon as you assign them.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="assign-trainee-applicant">Applicant</Label>
            <SearchableSelect
              id="assign-trainee-applicant"
              value={applicationId}
              onChange={setApplicationId}
              options={options}
              placeholder="Search applicants"
              emptyLabel={applications === undefined ? "Loading applicants…" : "Pick an applicant"}
            />
          </div>
          <TraineeAssignForm
            fixedEventId={eventId}
            formId={FORM_ID}
            staffOptions={staffOptions}
            onSubmit={(getArgs) => void submit(getArgs)}
          />
        </div>
        <DialogFooter className="border-t pt-4">
          <Button type="button" variant="outline" disabled={pending} onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} disabled={pending || !applicant}>
            {pending ? "Assigning…" : "Assign trainee"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
