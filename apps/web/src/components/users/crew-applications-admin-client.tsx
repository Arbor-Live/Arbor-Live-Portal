"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { useNow } from "@/lib/use-now";
import {
  activeFilters,
  FilterBar,
  matchesFilter,
  type FilterDefinition,
  type FilterState,
} from "@/components/filter-bar";
import { ListRow } from "@/components/list-row";
import { DetailSheet, EmptyState, ListSummary, RowCell, RowGroup, RowMenu, RowText } from "@/components/list-page";
import { PageHeader } from "@/components/page-header";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { formatDate, plural } from "@/lib/format";
import { notify } from "@/lib/notify";
import { assignableCrewSelectOptions } from "@/lib/user-select-description";
import { USER_DISCIPLINE_OPTIONS, USER_VERTICAL_OPTIONS } from "@/lib/validations/users";
import {
  ACTION_PROGRESS,
  OPEN_PROGRESS,
  PROGRESS_DESCRIPTIONS,
  PROGRESS_LABELS,
  PROGRESS_ORDER,
  applicationProgress,
  statusesForProgressFilter,
  type OutreachStage,
} from "./crew-applications/crew-application-progress";
import {
  CrewApplicationSheetBody,
  crewApplicationContext,
  type CrewApplicationRow,
} from "./crew-applications/crew-application-sheet";

/** `?application=<id>` opens that applicant's panel. */
const APPLICATION_PARAM = "application";
const NO_OWNER = "none";

function setApplicationParam(value: string | null) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(APPLICATION_PARAM, value);
  else url.searchParams.delete(APPLICATION_PARAM);
  window.history.replaceState(null, "", url);
}


async function attempt(action: () => Promise<unknown>, success: string) {
  try {
    await action();
    notify.success(success);
    return true;
  } catch (error) {
    notify.error(getConvexErrorMessage(error));
    return false;
  }
}

const DEFAULT_FILTERS: FilterState = { progress: { operator: "is", values: OPEN_PROGRESS } };

export function CrewApplicationsAdminClient() {
  const { confirm } = useAppDialog();
  const searchParams = useSearchParams();
  const [panel, setPanel] = useState<string | null>(() => searchParams.get(APPLICATION_PARAM));
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [pending, setPending] = useState(false);
  // Ticks so a trainee moves to Decision needed while the page is open.
  const now = useNow(60_000);

  const applied = activeFilters(filters);
  const statuses = statusesForProgressFilter(applied.progress);
  const applications = useQuery(api.crewApplications.listAdmin, statuses ? { statuses } : {});
  const managers = useQuery(api.invoices.listManagers, {});

  const setAssignee = useMutation(api.crewApplications.setAssignee);
  const setOutreachStage = useMutation(api.crewApplications.setOutreachStage);
  const close = useMutation(api.crewApplications.close);
  const remove = useMutation(api.crewApplications.remove);
  const assignTrainee = useMutation(api.crewApplications.assignTraineeToEvent);
  const convertToMember = useMutation(api.crewApplications.convertToMember);

  const ownerOptions = useMemo(
    () =>
      assignableCrewSelectOptions(
        (managers ?? []).map((row) => ({ ...row, name: row.name?.trim() || row.email || row.id })),
      ),
    [managers],
  );

  const filterDefinitions = useMemo<FilterDefinition[]>(
    () => [
      {
        id: "progress",
        label: "Progress",
        options: PROGRESS_ORDER.map((value) => ({ value, label: PROGRESS_LABELS[value] })),
      },
      {
        id: "owner",
        label: "Owner",
        options: [
          { value: NO_OWNER, label: "No owner" },
          ...ownerOptions.map((option) => ({ value: option.value, label: option.label })),
        ],
      },
      {
        id: "vertical",
        label: "Vertical",
        options: USER_VERTICAL_OPTIONS.map((value) => ({ value, label: value })),
      },
      {
        id: "specialty",
        label: "Specialty",
        options: [
          ...USER_DISCIPLINE_OPTIONS.map((value) => ({ value, label: value })),
          { value: "unsure", label: "Not sure yet" },
        ],
      },
    ],
    [ownerOptions],
  );

  const allRows = useMemo(() => (applications ?? []) as CrewApplicationRow[], [applications]);
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allRows.filter((row) => {
      if (query && ![row.name, row.email, row.phone].some((value) => value.toLowerCase().includes(query))) {
        return false;
      }
      return (
        matchesFilter(applied.progress, applicationProgress(row, now)) &&
        matchesFilter(applied.owner, row.assigneeUserId ?? NO_OWNER) &&
        matchesFilter(applied.vertical, row.vertical) &&
        matchesFilter(applied.specialty, row.discipline ?? [])
      );
    });
  }, [allRows, applied.owner, applied.progress, applied.specialty, applied.vertical, now, search]);

  const groups = useMemo(
    () =>
      PROGRESS_ORDER.map((progress) => ({
        progress,
        rows: rows.filter((row) => applicationProgress(row, now) === progress),
      })).filter((group) => group.rows.length > 0),
    [now, rows],
  );

  const panelRow = panel ? allRows.find((row) => row._id === panel) : undefined;

  // A `?application=` link to a row that isn't loaded (deleted, or outside the
  // progress filter): drop the param rather than hold an empty panel open.
  useEffect(() => {
    if (!panel || applications === undefined || panelRow) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- close the panel once the list says the row is gone
    setPanel(null);
    setApplicationParam(null);
  }, [applications, panel, panelRow]);

  const notContacted = rows.filter((row) => applicationProgress(row, now) === "new").length;
  const decisionsNeeded = rows.filter((row) => applicationProgress(row, now) === "decision_needed").length;
  const noOwner = rows.filter((row) => row.status === "submitted" && !row.assigneeUserId).length;
  const filterCount = (search.trim() ? 1 : 0) + Object.keys(applied).length;

  function openPanel(value: string | null) {
    setPanel(value);
    setApplicationParam(value);
  }

  async function run(action: () => Promise<unknown>, success: string) {
    setPending(true);
    const ok = await attempt(action, success);
    setPending(false);
    return ok;
  }

  /** Builds args from a form; a missing field shows as an error toast instead of throwing. */
  function withArgs<T>(getArgs: () => T, then: (args: T) => Promise<unknown>, success: string) {
    let args: T;
    try {
      args = getArgs();
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
      return;
    }
    void run(() => then(args), success).then((ok) => {
      if (ok) openPanel(null);
    });
  }

  function markStage(row: CrewApplicationRow, stage: OutreachStage | undefined) {
    return run(
      () => setOutreachStage({ applicationId: row._id, stage }),
      `Moved ${row.name} to ${PROGRESS_LABELS[stage ?? "new"]}`,
    );
  }

  async function turnAway(row: CrewApplicationRow) {
    const ok = await confirm({
      title: `Turn away ${row.name}?`,
      description: "They get an email saying we can't take them on right now. The application stays under Turned away.",
      destructive: true,
      confirmLabel: "Turn away",
    });
    if (!ok) return;
    if (await run(() => close({ applicationId: row._id }), `Turned away ${row.name}`)) {
      if (panel === row._id) openPanel(null);
    }
  }

  async function deleteApplication(row: CrewApplicationRow) {
    const ok = await confirm({
      title: `Delete ${row.name}'s application?`,
      description:
        "The application is removed for good and no email is sent. An applicant still on a training shift can't be deleted; remove the shift first.",
      destructive: true,
      confirmLabel: "Delete application",
    });
    if (!ok) return;
    if (await run(() => remove({ applicationId: row._id }), `Deleted ${row.name}'s application`)) {
      if (panel === row._id) openPanel(null);
    }
  }

  return (
    <div className="space-y-4 pb-24" data-testid="crew-applications-page">
      <PageHeader
        title="Crew applications"
        description="People who applied to join crew. Reach out with a Calendly link, meet them, then put them on a training event or invite them as members."
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name, email, phone…"
        searchLabel="Search applications"
        filters={filterDefinitions}
        value={filters}
        onChange={setFilters}
      />

      {applications === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-5 w-72" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <ListSummary
            testId="crew-applications-summary"
            order="Grouped by progress, newest first in each group. Open an applicant to reach out, assign an owner or decide."
          >
            {plural(rows.length, "application")} · {notContacted} not contacted ·{" "}
            {plural(decisionsNeeded, "decision")} needed · {noOwner} without an owner
          </ListSummary>

          {groups.length === 0 ? (
            <EmptyState
              action={
                filterCount ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearch("");
                      setFilters({});
                    }}
                  >
                    Show all applications
                  </Button>
                ) : null
              }
            >
              {filterCount
                ? "No applications match this search and these filters."
                : "No crew applications yet. They arrive from the public crew apply page."}
            </EmptyState>
          ) : (
            <div className="space-y-4" data-testid="crew-applications-list">
              {groups.map((group) => (
                <RowGroup
                  key={group.progress}
                  className="border"
                  title={PROGRESS_LABELS[group.progress]}
                  count={group.rows.length}
                  tone={ACTION_PROGRESS.has(group.progress) ? "amber" : "neutral"}
                  description={PROGRESS_DESCRIPTIONS[group.progress]}
                  testId={`crew-applications-group-${group.progress}`}
                >
                  {group.rows.map((row) => (
                    <ListRow
                      key={row._id}
                      data-testid="crew-application-row"
                      onOpen={() => openPanel(row._id)}
                      actions={
                        <div className="flex items-center gap-1">
                          {applicationProgress(row, now) === "new" ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={pending}
                              onClick={() => void markStage(row, "contacted")}
                            >
                              Mark reached out
                            </Button>
                          ) : null}
                          <RowMenu label={`More for ${row.name}`}>
                            <DropdownMenuItem onSelect={() => openPanel(row._id)}>Open details</DropdownMenuItem>
                            {row.status !== "converted" ? (
                              <>
                                <DropdownMenuSeparator />
                                {row.status !== "closed" ? (
                                  <DropdownMenuItem variant="destructive" onSelect={() => void turnAway(row)}>
                                    Turn away
                                  </DropdownMenuItem>
                                ) : null}
                                <DropdownMenuItem variant="destructive" onSelect={() => void deleteApplication(row)}>
                                  Delete
                                </DropdownMenuItem>
                              </>
                            ) : null}
                          </RowMenu>
                        </div>
                      }
                    >
                      <RowText eyebrow={crewApplicationContext(row)} title={row.name} detail={row.email} />
                      <RowCell className="w-36 truncate" align="left" hideBelow="md" muted>
                        {row.assigneeName ? (
                          row.assigneeName
                        ) : row.status === "submitted" ? (
                          <span className="rounded-md bg-status-amber-500/15 px-2 py-0.5 text-status-amber-700 dark:text-status-amber-300">
                            No owner
                          </span>
                        ) : (
                          "—"
                        )}
                      </RowCell>
                      <RowCell className="w-24" hideBelow="md" muted>
                        {formatDate(row.submittedAt)}
                      </RowCell>
                    </ListRow>
                  ))}
                </RowGroup>
              ))}
            </div>
          )}
        </>
      )}

      <DetailSheet
        open={Boolean(panelRow)}
        onOpenChange={(open) => {
          if (!open) openPanel(null);
        }}
        testId="crew-application-sheet"
      >
        {panelRow ? (
          <CrewApplicationSheetBody
            key={panelRow._id}
            application={panelRow}
            ownerOptions={ownerOptions}
            pending={pending}
            onSetOwner={(assigneeUserId) =>
              void run(
                () => setAssignee({ applicationId: panelRow._id, assigneeUserId }),
                assigneeUserId ? "Owner updated" : "Owner cleared",
              )
            }
            onSetStage={(stage) => void markStage(panelRow, stage)}
            onAssignTrainee={(getArgs) =>
              withArgs(
                getArgs,
                (args) => assignTrainee({ applicationId: panelRow._id, ...args }),
                `${panelRow.name} is on the training event`,
              )
            }
            onConvert={(getArgs) =>
              withArgs(
                getArgs,
                (args) => convertToMember({ applicationId: panelRow._id, ...args }),
                `Invited ${panelRow.name} as a member`,
              )
            }
            onTurnAway={() => void turnAway(panelRow)}
            onDelete={() => void deleteApplication(panelRow)}
          />
        ) : null}
      </DetailSheet>
    </div>
  );
}
