"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { ClipboardTextIcon } from "@phosphor-icons/react";
import {
  activeFilters,
  FilterBar,
  matchesFilter,
  type FilterDefinition,
  type FilterState,
} from "@/components/filter-bar";
import { ListRow } from "@/components/list-row";
import { DetailSheet, EmptyState, ListSummary, RowCell, RowGroup, RowMenu, RowText } from "@/components/list-page";
import { MetaItem, PageHeader } from "@/components/page-header";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ARTIST_TYPES, ARTIST_TYPE_LABELS } from "@/lib/artist-types";
import { optimisticDeclineBandApplication } from "@/lib/band-applications-optimistic";
import {
  BAND_APPLICATION_STATUSES,
  BAND_APPLICATION_STATUS_DESCRIPTIONS,
  BAND_APPLICATION_STATUS_LABELS,
  BAND_APPLICATION_STATUS_TONES,
  DEFAULT_BAND_APPLICATION_STATUSES,
  artistTypeOf,
  bandApplicationContext,
  bandApplicationInviteCount,
  bandApplicationLineup,
  bandApplicationListArgs,
} from "@/lib/band-application-status";
import { api } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { formatDate, plural } from "@/lib/format";
import { notify } from "@/lib/notify";
import {
  ArtistApplicationSheetBody,
  type ArtistApplicationRow,
} from "./artist-applications/artist-application-sheet";

/** `?application=<id>` opens that application's panel. */
const APPLICATION_PARAM = "application";

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

const DEFAULT_FILTERS: FilterState = {
  status: { operator: "is", values: DEFAULT_BAND_APPLICATION_STATUSES },
};

export function BandApplicationsAdminClient() {
  const { confirm } = useAppDialog();
  const searchParams = useSearchParams();
  const initialPanel = searchParams.get(APPLICATION_PARAM);
  const [panel, setPanel] = useState<string | null>(initialPanel);
  const [search, setSearch] = useState("");
  // A deep link can point at an approved or declined application, so it
  // starts on every status rather than just the pending ones.
  const [filters, setFilters] = useState<FilterState>(() => (initialPanel ? {} : DEFAULT_FILTERS));
  const [pending, setPending] = useState(false);

  const applied = activeFilters(filters);
  const applications = useQuery(api.bandApplications.listAdmin, bandApplicationListArgs(applied.status));
  const pendingCount = useQuery(api.bandApplications.countPendingSubmitted, {});
  const approve = useMutation(api.bandApplications.approve);
  const decline = useMutation(api.bandApplications.decline).withOptimisticUpdate(
    optimisticDeclineBandApplication,
  );

  const filterDefinitions = useMemo<FilterDefinition[]>(
    () => [
      {
        id: "status",
        label: "Status",
        options: BAND_APPLICATION_STATUSES.map((value) => ({
          value,
          label: BAND_APPLICATION_STATUS_LABELS[value],
        })),
      },
      {
        id: "type",
        label: "Artist type",
        options: ARTIST_TYPES.map((value) => ({ value, label: ARTIST_TYPE_LABELS[value] })),
      },
      {
        id: "lineup",
        label: "Line-up",
        options: [
          { value: "solo", label: "Solo" },
          { value: "group", label: "Group" },
        ],
      },
    ],
    [],
  );

  const allRows = useMemo(() => applications ?? [], [applications]);
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allRows.filter((row) => {
      if (
        query &&
        ![row.bandDisplayName, row.contactName, row.contactEmail].some((value) =>
          value.toLowerCase().includes(query),
        )
      ) {
        return false;
      }
      return (
        matchesFilter(applied.status, row.status) &&
        matchesFilter(applied.type, artistTypeOf(row.organizationType)) &&
        matchesFilter(applied.lineup, row.isSolo ? "solo" : "group")
      );
    });
  }, [allRows, applied.lineup, applied.status, applied.type, search]);

  const groups = useMemo(
    () =>
      BAND_APPLICATION_STATUSES.map((status) => ({
        status,
        rows: rows.filter((row) => row.status === status),
      })).filter((group) => group.rows.length > 0),
    [rows],
  );

  const panelRow = panel ? allRows.find((row) => row._id === panel) : undefined;

  // A `?application=` link to a row that isn't loaded (outside the status
  // filter, or past the list cap): drop the param rather than hold an empty
  // panel open.
  useEffect(() => {
    if (!panel || applications === undefined || panelRow) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- close the panel once the list says the row is gone
    setPanel(null);
    setApplicationParam(null);
  }, [applications, panel, panelRow]);

  const pendingShown = rows.filter((row) => row.status === "submitted").length;
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

  async function approveApplication(row: ArtistApplicationRow) {
    const invites = bandApplicationInviteCount(row);
    const ok = await run(
      () => approve({ applicationId: row._id }),
      `Approved ${row.bandDisplayName}. ${invites === 1 ? "Invite sent" : `${invites} invites sent`}.`,
    );
    if (ok && panel === row._id) openPanel(null);
  }

  async function declineApplication(row: ArtistApplicationRow, declineReason = "") {
    const reason = declineReason.trim();
    const ok = await confirm({
      title: `Decline ${row.bandDisplayName}?`,
      description: reason
        ? `${row.contactName} gets an email saying we can't take them on, with your reason. The application stays under Declined.`
        : `${row.contactName} gets an email saying we can't take them on, without a reason (add one in the application's panel). The application stays under Declined.`,
      destructive: true,
      confirmLabel: "Decline application",
    });
    if (!ok) return;
    if (
      await run(
        () => decline({ applicationId: row._id, declineReason: reason || undefined }),
        `Declined ${row.bandDisplayName}`,
      )
    ) {
      if (panel === row._id) openPanel(null);
    }
  }

  return (
    <div className="space-y-4 pb-24" data-testid="artist-applications-page">
      <PageHeader
        title="Artist applications"
        description="Artists who applied through the public form. Approving creates the artist org, invites the contact and any listed members, and leaves payout onboarding for them to finish. Their public listing stays off until they turn it on."
        meta={
          pendingCount === undefined ? (
            <Skeleton className="h-5 w-24" />
          ) : (
            <MetaItem icon={ClipboardTextIcon}>
              <span data-testid="artist-applications-pending-count">{pendingCount} pending</span>
            </MetaItem>
          )
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search artist, contact, email…"
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
            testId="artist-applications-summary"
            order="Grouped by status, newest first in each group. Open an application to read it and decide."
          >
            {plural(rows.length, "application")} · {pendingShown} pending
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
                : "No artist applications yet. They arrive from the public apply page."}
            </EmptyState>
          ) : (
            <div className="space-y-4" data-testid="artist-applications-list">
              {groups.map((group) => (
                <RowGroup
                  key={group.status}
                  className="border"
                  title={BAND_APPLICATION_STATUS_LABELS[group.status]}
                  count={group.rows.length}
                  tone={group.status === "submitted" ? BAND_APPLICATION_STATUS_TONES.submitted : "neutral"}
                  description={BAND_APPLICATION_STATUS_DESCRIPTIONS[group.status]}
                  testId={`artist-applications-group-${group.status}`}
                >
                  {group.rows.map((row) => (
                    <ListRow
                      key={row._id}
                      data-testid="artist-application-row"
                      onOpen={() => openPanel(row._id)}
                      actions={
                        <RowMenu label={`More for ${row.bandDisplayName}`}>
                          <DropdownMenuItem onSelect={() => openPanel(row._id)}>Open details</DropdownMenuItem>
                          {row.status === "submitted" ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive" onSelect={() => void declineApplication(row)}>
                                Decline
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </RowMenu>
                      }
                    >
                      <RowText
                        eyebrow={bandApplicationContext(row)}
                        title={row.bandDisplayName}
                        detail={`${row.contactName} · ${row.contactEmail}`}
                      />
                      <RowCell className="w-20" hideBelow="md" muted>
                        {bandApplicationLineup(row)}
                      </RowCell>
                      <RowCell className="w-24" hideBelow="sm" muted>
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
        testId="artist-application-sheet"
      >
        {panelRow ? (
          <ArtistApplicationSheetBody
            key={panelRow._id}
            application={panelRow}
            pending={pending}
            onApprove={() => void approveApplication(panelRow)}
            onDecline={(reason) => void declineApplication(panelRow, reason)}
          />
        ) : null}
      </DetailSheet>
    </div>
  );
}
