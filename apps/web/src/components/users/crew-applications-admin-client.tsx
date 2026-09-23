"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { EventSelect } from "@/components/events/event-select";
import { ScheduleBlockWindowFields } from "@/components/events/schedule-block-window-fields";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { formatDateTime } from "@/lib/format";
import {
  localDateTimeInputToMs,
  toLocalDateTimeInput,
} from "@/lib/crew-availability";
import {
  USER_VERTICAL_OPTIONS,
  disciplinesForVerticals,
  type UserDisciplineOption,
  type UserVerticalOption,
} from "@/lib/validations/users";

type StatusFilter = "submitted" | "trainee" | "converted" | "closed" | "all";

type PresenceMode = "entire_event" | "first_8_hours" | "schedule_block";

function earliestBlockStartMs(blocks: Array<{ startsAt: number }>): number | undefined {
  let earliest: number | undefined;
  for (const block of blocks) {
    if (earliest === undefined || block.startsAt < earliest) earliest = block.startsAt;
  }
  return earliest;
}

type ApplicationRow = {
  _id: Id<"crewApplications">;
  status: StatusFilter | "submitted" | "trainee" | "converted" | "closed";
  name: string;
  email: string;
  phone: string;
  heardAboutUs: string;
  vertical: UserVerticalOption;
  discipline?: UserDisciplineOption | "unsure";
  crewAvailabilityDays?: Array<"friday" | "saturday">;
  stanfordPosition: string;
  gradYear?: number;
  submittedAt: number;
};

function TraineeAssignPanel({
  application,
  busy,
  onAssign,
}: {
  application: ApplicationRow;
  busy: boolean;
  onAssign: (
    getArgs: () => {
      eventId: Id<"events">;
      presenceMode: PresenceMode;
      callTime: number;
      scheduleBlockId?: Id<"eventScheduleBlocks">;
      startsAt?: number;
      endsAt?: number;
    },
  ) => Promise<void>;
}) {
  const [eventId, setEventId] = useState("");
  const [presenceMode, setPresenceMode] = useState<PresenceMode>("entire_event");
  const [scheduleBlockId, setScheduleBlockId] = useState("");
  const [startsAtInput, setStartsAtInput] = useState("");
  const [endsAtInput, setEndsAtInput] = useState("");
  // null = not yet manually set. Entire event defaults to the first schedule
  // block (setup), which is before the show stored on event.startAt.
  const [callTimeOverride, setCallTimeOverride] = useState<string | null>(null);

  const eventDetails = useQuery(
    api.events.get,
    eventId ? { id: eventId as Id<"events"> } : "skip",
  );

  const scheduleBlocks = eventDetails?.blocks ?? [];

  const defaultCallTimeMs =
    presenceMode === "entire_event"
      ? (earliestBlockStartMs(scheduleBlocks) ?? eventDetails?.event?.startAt)
      : eventDetails?.event?.startAt;

  const callTimeInput =
    callTimeOverride ??
    (defaultCallTimeMs != null ? toLocalDateTimeInput(new Date(defaultCallTimeMs)) : "");

  return (
    <div className="space-y-3 border-t border-border/50 pt-3">
      <p className="text-sm font-medium">Assign as trainee</p>
      <div className="space-y-2">
        <Label>Event</Label>
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
      </div>

      {eventId ? (
        <div className="space-y-3 rounded-md border p-3">
          <p className="text-sm font-medium">Presence</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["entire_event", "Entire event"],
                ["first_8_hours", "First 8 hours"],
                ["schedule_block", "Specific schedule block"],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={`flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm ${
                  presenceMode === value ? "border-primary bg-primary/5" : ""
                }`}
              >
                <input
                  type="radio"
                  name={`presence-${application._id}`}
                  checked={presenceMode === value}
                  onChange={() => setPresenceMode(value)}
                  className="mt-1"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>

          {presenceMode === "schedule_block" ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Same schedule-block picker as crew availability — link a block or set custom times.
              </p>
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
            </div>
          ) : null}

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Call time</p>
            <DateTimePicker value={callTimeInput} onChange={setCallTimeOverride} />
          </div>
        </div>
      ) : null}

      <Button
        type="button"
        size="sm"
        disabled={busy || !eventId}
        onClick={() =>
          void onAssign(() => {
            if (!eventId) throw new Error("Select an event.");
            const callTime = localDateTimeInputToMs(callTimeInput);
            if (callTime === null) throw new Error("Enter a call time.");

            if (presenceMode === "schedule_block") {
              if (!scheduleBlockId) throw new Error("Select a schedule block.");
              const startsAt = localDateTimeInputToMs(startsAtInput);
              const endsAt = localDateTimeInputToMs(endsAtInput);
              if (startsAt === null || endsAt === null) {
                throw new Error("Enter shift start and end times.");
              }
              return {
                eventId: eventId as Id<"events">,
                presenceMode,
                callTime,
                scheduleBlockId: scheduleBlockId as Id<"eventScheduleBlocks">,
                startsAt,
                endsAt,
              };
            }

            return {
              eventId: eventId as Id<"events">,
              presenceMode,
              callTime,
            };
          })
        }
      >
        Assign as trainee
      </Button>
    </div>
  );
}

export function CrewApplicationsAdminClient() {
  const [status, setStatus] = useState<StatusFilter>("submitted");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [convertVerticals, setConvertVerticals] = useState<
    Record<string, UserVerticalOption[]>
  >({});
  const [convertDisciplines, setConvertDisciplines] = useState<
    Record<string, UserDisciplineOption[]>
  >({});
  const [convertRateMode, setConvertRateMode] = useState<
    Record<string, "normal" | "lead" | "custom">
  >({});
  const [convertCustomRate, setConvertCustomRate] = useState<Record<string, string>>({});
  const [convertPayroll, setConvertPayroll] = useState<
    Record<string, "stanford" | "external">
  >({});

  const applications = useQuery(
    api.crewApplications.listAdmin,
    status === "all" ? {} : { status },
  );

  const close = useMutation(api.crewApplications.close);
  const remove = useMutation(api.crewApplications.remove);
  const assignTrainee = useMutation(api.crewApplications.assignTraineeToEvent);
  const convertToMember = useMutation(api.crewApplications.convertToMember);

  async function runAction(applicationId: string, action: () => Promise<void>) {
    setError(null);
    setBusyId(applicationId);
    try {
      await action();
    } catch (err) {
      setError(getConvexErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  function toggleVertical(
    applicationId: string,
    vertical: UserVerticalOption,
    verticals: UserVerticalOption[],
    disciplines: UserDisciplineOption[],
  ) {
    const next = verticals.includes(vertical)
      ? verticals.filter((entry) => entry !== vertical)
      : [...verticals, vertical];
    setConvertVerticals((prev) => ({ ...prev, [applicationId]: next }));
    const allowed = new Set(disciplinesForVerticals(next));
    setConvertDisciplines((prev) => ({
      ...prev,
      [applicationId]: disciplines.filter((discipline) => allowed.has(discipline)),
    }));
  }

  function toggleDiscipline(
    applicationId: string,
    discipline: UserDisciplineOption,
    disciplines: UserDisciplineOption[],
  ) {
    setConvertDisciplines((prev) => {
      const next = disciplines.includes(discipline)
        ? disciplines.filter((entry) => entry !== discipline)
        : [...disciplines, discipline];
      return { ...prev, [applicationId]: next };
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["submitted", "Submitted"],
            ["trainee", "Trainee"],
            ["converted", "Converted"],
            ["closed", "Closed"],
            ["all", "All"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={status === value ? "default" : "secondary"}
            onClick={() => setStatus(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription className="whitespace-pre-wrap">{error}</AlertDescription>
        </Alert>
      ) : null}

      {applications === undefined ? (
        <p className="text-sm text-muted-foreground">Loading applications…</p>
      ) : null}

      {applications && applications.length === 0 ? (
        <p className="text-sm text-muted-foreground">No applications in this view.</p>
      ) : null}

      <div className="space-y-4">
        {(applications ?? []).map((app) => {
          const verticals: UserVerticalOption[] = convertVerticals[app._id] ?? [app.vertical];
          const disciplineOptions = disciplinesForVerticals(verticals);
          const storedDisciplines: UserDisciplineOption[] =
            app.discipline &&
            app.discipline !== "unsure" &&
            disciplineOptions.includes(app.discipline)
              ? [app.discipline]
              : [];
          const disciplines: UserDisciplineOption[] =
            convertDisciplines[app._id] ?? storedDisciplines;

          return (
            <article
              key={app._id}
              className="space-y-3 border border-border/60 bg-background/60 p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-heading text-lg font-semibold">{app.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {app.email} · {app.phone}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Submitted {formatDateTime(app.submittedAt)} · {app.status}
                  </p>
                </div>
                {app.status !== "converted" ? (
                  <div className="flex flex-wrap gap-2">
                    {app.status !== "closed" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={busyId === app._id}
                        onClick={() =>
                          void runAction(app._id, async () => {
                            await close({ applicationId: app._id });
                          })
                        }
                      >
                        Turn away
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={busyId === app._id}
                      onClick={() =>
                        void runAction(app._id, async () => {
                          await remove({ applicationId: app._id });
                        })
                      }
                    >
                      Delete
                    </Button>
                  </div>
                ) : null}
              </div>

              <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <div>
                  <dt className="font-medium text-foreground/80">Vertical</dt>
                  <dd>{app.vertical}</dd>
                </div>
                {app.discipline ? (
                  <div>
                    <dt className="font-medium text-foreground/80">Specialty</dt>
                    <dd>{app.discipline === "unsure" ? "I'm not sure" : app.discipline}</dd>
                  </div>
                ) : null}
                {app.crewAvailabilityDays?.length ? (
                  <div>
                    <dt className="font-medium text-foreground/80">Availability preference</dt>
                    <dd>
                      {app.crewAvailabilityDays
                        .map((day) => (day === "friday" ? "Friday" : "Saturday"))
                        .join(", ")}{" "}
                      · 5pm–midnight PT
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className="font-medium text-foreground/80">Stanford position</dt>
                  <dd>
                    {app.stanfordPosition}
                    {app.gradYear ? ` · ${app.gradYear}` : ""}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="font-medium text-foreground/80">Heard about us</dt>
                  <dd>{app.heardAboutUs}</dd>
                </div>
              </dl>

              {app.status === "submitted" || app.status === "trainee" ? (
                <TraineeAssignPanel
                  application={app}
                  busy={busyId === app._id}
                  onAssign={(getArgs) =>
                    runAction(app._id, async () => {
                      await assignTrainee({
                        applicationId: app._id,
                        ...getArgs(),
                      });
                    })
                  }
                />
              ) : null}

              {app.status === "submitted" || app.status === "trainee" ? (
                <div className="space-y-3 border-t border-border/50 pt-3">
                  <p className="text-sm font-medium">Convert to member</p>
                  <div className="space-y-2">
                    <Label>Verticals</Label>
                    <div className="flex flex-wrap gap-2">
                      {USER_VERTICAL_OPTIONS.map((vertical) => {
                        const checked = verticals.includes(vertical);
                        return (
                          <Button
                            key={vertical}
                            type="button"
                            size="sm"
                            variant={checked ? "default" : "secondary"}
                            onClick={() =>
                              toggleVertical(app._id, vertical, verticals, disciplines)
                            }
                          >
                            {vertical}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                  {disciplineOptions.length > 0 ? (
                    <div className="space-y-2">
                      <Label>Disciplines</Label>
                      <div className="flex flex-wrap gap-2">
                        {disciplineOptions.map((discipline) => {
                          const checked = disciplines.includes(discipline);
                          return (
                            <Button
                              key={discipline}
                              type="button"
                              size="sm"
                              variant={checked ? "default" : "secondary"}
                              onClick={() => toggleDiscipline(app._id, discipline, disciplines)}
                            >
                              {discipline}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Rate</Label>
                      <Select
                        value={convertRateMode[app._id] ?? "normal"}
                        onValueChange={(value) =>
                          setConvertRateMode((prev) => ({
                            ...prev,
                            [app._id]: value as "normal" | "lead" | "custom",
                          }))
                        }
                      >
                        <SelectTrigger>
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
                      <Label>Payment method</Label>
                      <Select
                        value={convertPayroll[app._id] ?? "stanford"}
                        onValueChange={(value) =>
                          setConvertPayroll((prev) => ({
                            ...prev,
                            [app._id]: value as "stanford" | "external",
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="stanford">Stanford payroll</SelectItem>
                          <SelectItem value="external">External payroll</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {(convertRateMode[app._id] ?? "normal") === "custom" ? (
                      <div className="space-y-2">
                        <Label htmlFor={`convert-rate-${app._id}`}>Custom hourly rate (USD)</Label>
                        <Input
                          id={`convert-rate-${app._id}`}
                          type="number"
                          min={0}
                          value={convertCustomRate[app._id] ?? "0"}
                          onChange={(event) =>
                            setConvertCustomRate((prev) => ({
                              ...prev,
                              [app._id]: event.target.value,
                            }))
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busyId === app._id}
                    onClick={() =>
                      void runAction(app._id, async () => {
                        const rateMode = convertRateMode[app._id] ?? "normal";
                        await convertToMember({
                          applicationId: app._id,
                          verticals,
                          disciplines,
                          rateMode,
                          customHourlyRateUsd:
                            rateMode === "custom"
                              ? Number(convertCustomRate[app._id] || "0")
                              : undefined,
                          payrollMethod: convertPayroll[app._id] ?? "stanford",
                        });
                      })
                    }
                  >
                    Convert to member
                  </Button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
