"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { CheckIcon } from "@phosphor-icons/react";
import { StatusPill } from "@/components/page-header";
import {
  DetailSheetFooter,
  DetailSheetHeader,
  SheetField,
  SheetFields,
  SheetSection,
} from "@/components/list-page";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EventSelect } from "@/components/events/event-select";
import { ScheduleBlockWindowFields } from "@/components/events/schedule-block-window-fields";
import { UserSelect, type UserSelectOption } from "@/components/users/user-select";
import { api, type Id } from "@/lib/convex-api";
import { formatDate, formatDateTime } from "@/lib/format";
import { isSectionBlockType } from "@/lib/schedule-block-types";
import { localDateTimeInputToMs, toLocalDateTimeInput } from "@/lib/crew-availability";
import { cn } from "@/lib/utils";
import {
  STANFORD_POSITION_LABELS,
  USER_VERTICAL_OPTIONS,
  disciplinesForVerticals,
  type UserDisciplineOption,
  type UserVerticalOption,
} from "@/lib/validations/users";
import {
  OUTREACH_STEPS,
  PROGRESS_LABELS,
  PROGRESS_TONES,
  applicationProgress,
  type CrewApplicationStatus,
  type OutreachStage,
} from "./crew-application-progress";
import { TraineeReadinessDialog, TraineeReadinessNotice } from "./trainee-readiness";

export type CrewApplicationRow = {
  _id: Id<"crewApplications">;
  status: CrewApplicationStatus;
  name: string;
  email: string;
  phone: string;
  heardAboutUs: string;
  experience?: string;
  vertical: UserVerticalOption;
  discipline?: UserDisciplineOption | "unsure";
  crewAvailabilityDays?: Array<"friday" | "saturday">;
  stanfordPosition: string;
  gradYear?: number;
  submittedAt: number;
  assigneeUserId?: string;
  assigneeName?: string;
  outreachStage?: OutreachStage;
  outreachUpdatedAt?: number;
  outreachUpdatedByName?: string;
};

export type TraineeAssignArgs = {
  eventId: Id<"events">;
  presenceMode: PresenceMode;
  callTime: number;
  scheduleBlockId?: Id<"eventScheduleBlocks">;
  startsAt?: number;
  endsAt?: number;
};

export type ConvertArgs = {
  verticals: UserVerticalOption[];
  disciplines: UserDisciplineOption[];
  rateMode: "normal" | "lead" | "custom";
  customHourlyRateUsd?: number;
  payrollMethod: "stanford" | "external";
};

type PresenceMode = "entire_event" | "first_8_hours" | "schedule_block";
type DecideMode = "trainee" | "convert";

const DECIDE_FORM_ID = "crew-application-decide";

function earliestBlockStartMs(blocks: Array<{ startsAt: number }>): number | undefined {
  let earliest: number | undefined;
  for (const block of blocks) {
    if (earliest === undefined || block.startsAt < earliest) earliest = block.startsAt;
  }
  return earliest;
}

function specialtyLabel(discipline: CrewApplicationRow["discipline"]) {
  if (!discipline) return null;
  return discipline === "unsure" ? "Not sure yet" : discipline;
}

export function crewApplicationContext(application: CrewApplicationRow) {
  const specialty = specialtyLabel(application.discipline);
  return specialty ? `${application.vertical} · ${specialty}` : application.vertical;
}

/**
 * The outreach steps as a vertical list, one full-width row each: done steps
 * get a check, the current one is highlighted and says who marked it and when.
 * Clicking a row moves the applicant to that step (back steps too).
 */
function OutreachStepper({
  application,
  pending,
  onSetStage,
}: {
  application: CrewApplicationRow;
  pending: boolean;
  onSetStage: (stage: OutreachStage | undefined) => void;
}) {
  const current = application.outreachStage ?? "new";
  const currentIndex = OUTREACH_STEPS.findIndex((step) => step.value === current);
  return (
    <ol role="radiogroup" aria-label="Outreach progress" className="divide-y border" data-testid="crew-application-stage">
      {OUTREACH_STEPS.map((step, index) => {
        const isCurrent = index === currentIndex;
        const isDone = index < currentIndex;
        const marked =
          isCurrent && application.outreachStage && application.outreachUpdatedAt
            ? [application.outreachUpdatedByName, formatDateTime(application.outreachUpdatedAt)]
                .filter(Boolean)
                .join(" · ")
            : null;
        return (
          <li key={step.value}>
            <button
              type="button"
              role="radio"
              aria-checked={isCurrent}
              disabled={pending}
              onClick={() => {
                if (isCurrent) return;
                onSetStage(step.value === "new" ? undefined : step.value);
              }}
              className={cn(
                "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors disabled:opacity-60",
                isCurrent ? "bg-status-blue-500/10" : "hover:bg-muted/30",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border text-2xs font-semibold tabular-nums",
                  isDone && "border-status-emerald-500 bg-status-emerald-500 text-white",
                  isCurrent && "border-status-blue-500 bg-status-blue-500 text-white",
                  !isDone && !isCurrent && "text-muted-foreground",
                )}
              >
                {isDone ? <CheckIcon className="size-3" weight="bold" /> : index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block", isCurrent ? "font-medium" : isDone ? "" : "text-muted-foreground")}>
                  {step.label}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {marked
                    ? `Marked by ${marked}`
                    : isDone && step.value === "new"
                      ? `Applied ${formatDate(application.submittedAt)}`
                      : step.hint}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** Turns the form into mutation args; throws a readable error when something is missing. */
type SubmitHandler<T> = (getArgs: () => T) => void;

function TraineeAssignForm({
  staffOptions,
  onSubmit,
}: {
  staffOptions: UserSelectOption[];
  onSubmit: SubmitHandler<TraineeAssignArgs>;
}) {
  const [eventId, setEventId] = useState("");
  const [presenceMode, setPresenceMode] = useState<PresenceMode>("entire_event");
  const [scheduleBlockId, setScheduleBlockId] = useState("");
  const [startsAtInput, setStartsAtInput] = useState("");
  const [endsAtInput, setEndsAtInput] = useState("");
  // null = not yet manually set. Entire event defaults to the first schedule
  // block (setup), which is before the show stored on event.startAt.
  const [callTimeOverride, setCallTimeOverride] = useState<string | null>(null);

  const [fixOpen, setFixOpen] = useState(false);
  const [submitQueued, setSubmitQueued] = useState(false);

  const eventDetails = useQuery(api.events.get, eventId ? { id: eventId as Id<"events"> } : "skip");
  // Checked as soon as an event is picked, so a missing venue address or lead
  // shows up before the form is filled in, not as an error after Assign.
  const readiness = useQuery(
    api.crewApplications.traineeEventReadiness,
    eventId ? { eventId: eventId as Id<"events"> } : "skip",
  );

  // Crew are scheduled per section; doors, soundchecks, and sets aren't shifts.
  const scheduleBlocks = useMemo(
    () => (eventDetails?.blocks ?? []).filter((block) => isSectionBlockType(block.blockType)),
    [eventDetails?.blocks],
  );

  const defaultCallTimeMs =
    presenceMode === "entire_event"
      ? (earliestBlockStartMs(scheduleBlocks) ?? eventDetails?.event?.startAt)
      : eventDetails?.event?.startAt;

  const callTimeInput =
    callTimeOverride ?? (defaultCallTimeMs != null ? toLocalDateTimeInput(new Date(defaultCallTimeMs)) : "");

  /** Assign when the event is ready; otherwise open the fix dialog. */
  function submitOrFix() {
    if (readiness && readiness.missing.length > 0) {
      setFixOpen(true);
      return;
    }
    onSubmit(buildArgs);
  }

  // Finish a click that came in while the readiness check was loading.
  useEffect(() => {
    if (!submitQueued || readiness === undefined) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- run the queued Assign once readiness arrives
    setSubmitQueued(false);
    submitOrFix();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire only when the check lands
  }, [readiness, submitQueued]);

  function buildArgs(): TraineeAssignArgs {
    if (!eventId) throw new Error("Select an event.");
    const callTime = localDateTimeInputToMs(callTimeInput);
    if (callTime === null) throw new Error("Enter a call time.");

    if (presenceMode === "schedule_block") {
      if (!scheduleBlockId) throw new Error("Select a schedule block.");
      const startsAt = localDateTimeInputToMs(startsAtInput);
      const endsAt = localDateTimeInputToMs(endsAtInput);
      if (startsAt === null || endsAt === null) throw new Error("Enter shift start and end times.");
      return {
        eventId: eventId as Id<"events">,
        presenceMode,
        callTime,
        scheduleBlockId: scheduleBlockId as Id<"eventScheduleBlocks">,
        startsAt,
        endsAt,
      };
    }
    return { eventId: eventId as Id<"events">, presenceMode, callTime };
  }

  return (
    <form
      id={DECIDE_FORM_ID}
      className="space-y-3"
      data-testid="crew-application-trainee-form"
      onSubmit={(event) => {
        event.preventDefault();
        // Still checking the event: hold the click until the check lands, rather
        // than let the mutation fail with the raw list.
        if (eventId && readiness === undefined) {
          setSubmitQueued(true);
          return;
        }
        submitOrFix();
      }}
    >
      <div className="space-y-2">
        <Label>Training event</Label>
        <EventSelect
          value={eventId}
          onChange={(value) => {
            setEventId(value);
            setPresenceMode("entire_event");
            setScheduleBlockId("");
            setStartsAtInput("");
            setEndsAtInput("");
            setCallTimeOverride(null);
          }}
        />
        <p className="text-xs text-muted-foreground">
          They get an intro email and a calendar invite. Trainees don&apos;t get a portal login.
        </p>
      </div>

      {eventId && readiness ? (
        <>
          <TraineeReadinessNotice readiness={readiness} onFix={() => setFixOpen(true)} />
          <TraineeReadinessDialog
            open={fixOpen}
            onOpenChange={setFixOpen}
            eventId={eventId as Id<"events">}
            readiness={readiness}
            staffOptions={staffOptions}
            onAssign={() => {
              setFixOpen(false);
              onSubmit(buildArgs);
            }}
          />
        </>
      ) : null}

      {eventId ? (
        <>
          <div className="space-y-2">
            <Label>Presence</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={presenceMode}
              onValueChange={(value) => value && setPresenceMode(value as PresenceMode)}
              className="flex w-full flex-wrap"
              aria-label="Presence"
            >
              <ToggleGroupItem value="entire_event" className="flex-1">
                Entire event
              </ToggleGroupItem>
              <ToggleGroupItem value="first_8_hours" className="flex-1">
                First 8 hours
              </ToggleGroupItem>
              <ToggleGroupItem value="schedule_block" className="flex-1">
                One section
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {presenceMode === "schedule_block" ? (
            <ScheduleBlockWindowFields
              scheduleBlocks={scheduleBlocks}
              scheduleBlockId={scheduleBlockId}
              startsAtInput={startsAtInput}
              endsAtInput={endsAtInput}
              onChange={(next) => {
                setScheduleBlockId(next.scheduleBlockId ?? "");
                setStartsAtInput(next.startsAtInput);
                setEndsAtInput(next.endsAtInput);
                if (next.startsAtInput && callTimeOverride === null) {
                  setCallTimeOverride(next.startsAtInput);
                }
              }}
            />
          ) : null}

          <div className="space-y-2">
            <Label>Call time</Label>
            <DateTimePicker value={callTimeInput} onChange={setCallTimeOverride} />
          </div>
        </>
      ) : null}
    </form>
  );
}

function ConvertForm({
  application,
  onSubmit,
}: {
  application: CrewApplicationRow;
  onSubmit: SubmitHandler<ConvertArgs>;
}) {
  const [verticals, setVerticals] = useState<UserVerticalOption[]>([application.vertical]);
  const [disciplines, setDisciplines] = useState<UserDisciplineOption[]>(() => {
    const allowed = disciplinesForVerticals([application.vertical]);
    return application.discipline && application.discipline !== "unsure" && allowed.includes(application.discipline)
      ? [application.discipline]
      : [];
  });
  const [rateMode, setRateMode] = useState<ConvertArgs["rateMode"]>("normal");
  const [customRate, setCustomRate] = useState("0");
  const [payrollMethod, setPayrollMethod] = useState<ConvertArgs["payrollMethod"]>("stanford");

  const disciplineOptions = disciplinesForVerticals(verticals);

  function toggleVertical(vertical: UserVerticalOption) {
    const next = verticals.includes(vertical)
      ? verticals.filter((entry) => entry !== vertical)
      : [...verticals, vertical];
    setVerticals(next);
    const allowed = new Set(disciplinesForVerticals(next));
    setDisciplines((prev) => prev.filter((discipline) => allowed.has(discipline)));
  }

  function toggleDiscipline(discipline: UserDisciplineOption) {
    setDisciplines((prev) =>
      prev.includes(discipline) ? prev.filter((entry) => entry !== discipline) : [...prev, discipline],
    );
  }

  return (
    <form
      id={DECIDE_FORM_ID}
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(() => ({
          verticals,
          disciplines,
          rateMode,
          customHourlyRateUsd: rateMode === "custom" ? Number(customRate || "0") : undefined,
          payrollMethod,
        }));
      }}
    >
      <p className="text-xs text-muted-foreground">
        Sends a portal invite to {application.email}. Verticals and specialty start from the application.
      </p>
      <div className="space-y-2">
        <Label>Verticals</Label>
        <div className="flex flex-wrap gap-2">
          {USER_VERTICAL_OPTIONS.map((vertical) => (
            <Button
              key={vertical}
              type="button"
              size="sm"
              variant={verticals.includes(vertical) ? "default" : "secondary"}
              aria-pressed={verticals.includes(vertical)}
              onClick={() => toggleVertical(vertical)}
            >
              {vertical}
            </Button>
          ))}
        </div>
      </div>
      {disciplineOptions.length > 0 ? (
        <div className="space-y-2">
          <Label>Disciplines</Label>
          <div className="flex flex-wrap gap-2">
            {disciplineOptions.map((discipline) => (
              <Button
                key={discipline}
                type="button"
                size="sm"
                variant={disciplines.includes(discipline) ? "default" : "secondary"}
                aria-pressed={disciplines.includes(discipline)}
                onClick={() => toggleDiscipline(discipline)}
              >
                {discipline}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="crew-application-rate">Rate</Label>
          <Select value={rateMode} onValueChange={(value) => setRateMode(value as ConvertArgs["rateMode"])}>
            <SelectTrigger id="crew-application-rate">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="lead">Lead</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="crew-application-payroll">Payment method</Label>
          <Select
            value={payrollMethod}
            onValueChange={(value) => setPayrollMethod(value as ConvertArgs["payrollMethod"])}
          >
            <SelectTrigger id="crew-application-payroll">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stanford">Stanford payroll</SelectItem>
              <SelectItem value="external">External payroll</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {rateMode === "custom" ? (
          <div className="space-y-2">
            <Label htmlFor="crew-application-custom-rate">Custom hourly rate (USD)</Label>
            <Input
              id="crew-application-custom-rate"
              type="number"
              min={0}
              value={customRate}
              onChange={(event) => setCustomRate(event.target.value)}
            />
          </div>
        ) : null}
      </div>
    </form>
  );
}

/** The side panel body. Render it keyed on the application so drafts reset between rows. */
export function CrewApplicationSheetBody({
  application,
  ownerOptions,
  pending,
  onSetOwner,
  onSetStage,
  onAssignTrainee,
  onConvert,
  onTurnAway,
  onDelete,
}: {
  application: CrewApplicationRow;
  ownerOptions: UserSelectOption[];
  pending: boolean;
  onSetOwner: (assigneeUserId: string | undefined) => void;
  onSetStage: (stage: OutreachStage | undefined) => void;
  onAssignTrainee: (getArgs: () => TraineeAssignArgs) => void;
  onConvert: (getArgs: () => ConvertArgs) => void;
  onTurnAway: () => void;
  onDelete: () => void;
}) {
  const progress = applicationProgress(application);
  const canDecide = application.status === "submitted" || application.status === "trainee";
  // A trainee has already been through training once; membership is the usual next step.
  const [mode, setMode] = useState<DecideMode>(application.status === "trainee" ? "convert" : "trainee");

  const options = useMemo(() => {
    // Keep a past owner who left the org selectable, so the picker still names them.
    if (
      application.assigneeUserId &&
      !ownerOptions.some((option) => option.value === application.assigneeUserId)
    ) {
      return [
        { value: application.assigneeUserId, label: application.assigneeName ?? "Former member" },
        ...ownerOptions,
      ];
    }
    return ownerOptions;
  }, [application.assigneeName, application.assigneeUserId, ownerOptions]);

  return (
    <>
      <DetailSheetHeader
        title={application.name}
        pill={<StatusPill tone={PROGRESS_TONES[progress]}>{PROGRESS_LABELS[progress]}</StatusPill>}
        description={
          <>
            <a className="underline-offset-2 hover:underline" href={`mailto:${application.email}`}>
              {application.email}
            </a>
            {" · "}
            <a className="underline-offset-2 hover:underline" href={`tel:${application.phone}`}>
              {application.phone}
            </a>
          </>
        }
      />

      <SheetSection title="Outreach">
        <div className="space-y-2" data-testid="crew-application-owner">
          <p className="text-sm font-medium">Owner</p>
          <UserSelect
            value={application.assigneeUserId ?? ""}
            onChange={(value) => onSetOwner(value || undefined)}
            options={[{ value: "", label: "No owner" }, ...options]}
            emptyLabel="No owner"
            placeholder="Search staff..."
          />
          <p className="text-xs text-muted-foreground">
            The person handling this applicant. Marking them reached out makes you the owner if nobody is.
          </p>
        </div>

        {application.status === "submitted" ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Progress</p>
            <OutreachStepper application={application} pending={pending} onSetStage={onSetStage} />
          </div>
        ) : null}
      </SheetSection>

      <SheetSection title="Application">
        <SheetFields>
          <SheetField label="Submitted">{formatDateTime(application.submittedAt)}</SheetField>
          <SheetField label="Vertical">{application.vertical}</SheetField>
          {application.discipline ? (
            <SheetField label="Specialty">{specialtyLabel(application.discipline)}</SheetField>
          ) : null}
          {application.crewAvailabilityDays?.length ? (
            <SheetField label="Availability">
              {application.crewAvailabilityDays.map((day) => (day === "friday" ? "Friday" : "Saturday")).join(", ")}{" "}
              · 5pm–midnight
            </SheetField>
          ) : null}
          <SheetField label="Stanford">
            {STANFORD_POSITION_LABELS[application.stanfordPosition as keyof typeof STANFORD_POSITION_LABELS] ??
              application.stanfordPosition}
            {application.gradYear ? ` · ${application.gradYear}` : ""}
          </SheetField>
          <SheetField label="Heard about us">{application.heardAboutUs}</SheetField>
          {application.experience ? (
            <SheetField label="Why they're excited">
              <span className="whitespace-pre-wrap">{application.experience}</span>
            </SheetField>
          ) : null}
        </SheetFields>
      </SheetSection>

      {canDecide ? (
        <SheetSection title="Decide">
          <ToggleGroup
            type="single"
            variant="outline"
            value={mode}
            onValueChange={(value) => value && setMode(value as DecideMode)}
            className="flex w-full flex-wrap"
            aria-label="Decision"
          >
            <ToggleGroupItem value="trainee" className="flex-1">
              Assign as trainee
            </ToggleGroupItem>
            <ToggleGroupItem value="convert" className="flex-1">
              Convert to member
            </ToggleGroupItem>
          </ToggleGroup>
          {mode === "trainee" ? (
            <TraineeAssignForm staffOptions={ownerOptions} onSubmit={onAssignTrainee} />
          ) : (
            <ConvertForm application={application} onSubmit={onConvert} />
          )}
        </SheetSection>
      ) : null}

      <DetailSheetFooter
        start={
          application.status === "converted" ? undefined : (
            <div className="flex flex-wrap gap-2">
              {application.status !== "closed" ? (
                <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onTurnAway}>
                  Turn away
                </Button>
              ) : null}
              <Button type="button" variant="ghost" size="sm" className="text-destructive" disabled={pending} onClick={onDelete}>
                Delete
              </Button>
            </div>
          )
        }
      >
        {canDecide ? (
          <Button type="submit" form={DECIDE_FORM_ID} size="sm" disabled={pending}>
            {mode === "trainee" ? "Assign as trainee" : "Convert to member"}
          </Button>
        ) : null}
      </DetailSheetFooter>
    </>
  );
}
