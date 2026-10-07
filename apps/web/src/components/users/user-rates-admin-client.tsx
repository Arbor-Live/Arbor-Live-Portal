"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { CurrencyDollarIcon, SlidersHorizontalIcon } from "@phosphor-icons/react";
import {
  activeFilters,
  FilterBar,
  matchesFilter,
  type FilterDefinition,
  type FilterState,
} from "@/components/filter-bar";
import { ListRow } from "@/components/list-row";
import { DetailSheet, EmptyState, ListSummary, RowCell, RowFlag, RowList, RowMenu, RowText } from "@/components/list-page";
import { MetaItem, PageHeader, StatusPill } from "@/components/page-header";
import { roleLabel } from "@/components/users/directory/shared";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import {
  CREW_RATE_MODES,
  CREW_RATE_MODE_LABELS,
  CREW_RATE_MODE_TONES,
  crewRateMode,
  crewRateRoles,
  formatHourly,
  hasNoRate,
  summarizeCrewRates,
  type CrewRateMode,
  type CrewRateRow,
  type GlobalCrewRates,
} from "@/lib/crew-rate-modes";
import { plural } from "@/lib/format";
import { notify } from "@/lib/notify";
import { CrewRateSheetBody } from "./crew-rates/crew-rate-sheet";
import { GlobalRatesDialog } from "./crew-rates/global-rates-dialog";

/** `?person=<userId>` opens that person's rate panel. */
const PERSON_PARAM = "person";
const NO_RATE = "zero";

function setPersonParam(value: string | null) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(PERSON_PARAM, value);
  else url.searchParams.delete(PERSON_PARAM);
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

export function UserRatesAdminClient() {
  const searchParams = useSearchParams();
  const [panel, setPanel] = useState<string | null>(() => searchParams.get(PERSON_PARAM));
  const [globalsOpen, setGlobalsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>({});

  const users = useQuery(api.users.listWithRates, {});
  const invoiceSettings = useQuery(api.invoiceSettings.get, {});
  const updateInvoiceSettings = useMutation(api.invoiceSettings.update);
  const setCompensationRate = useMutation(api.users.setCompensationRate);

  const globals: GlobalCrewRates = {
    normal: invoiceSettings?.crewNormalRateUsd ?? 0,
    lead: invoiceSettings?.crewLeadRateUsd ?? invoiceSettings?.crewOtRateUsd ?? 0,
  };

  const allRows = useMemo(() => (users ?? []) as CrewRateRow[], [users]);
  const applied = activeFilters(filters);

  const roleOptions = useMemo(() => {
    const roles = new Set(allRows.flatMap((row) => crewRateRoles(row.role)));
    return [...roles]
      .map((value) => ({ value, label: roleLabel(value) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allRows]);

  const filterDefinitions = useMemo<FilterDefinition[]>(
    () => [
      {
        id: "mode",
        label: "Mode",
        options: CREW_RATE_MODES.map((value) => ({ value, label: CREW_RATE_MODE_LABELS[value] })),
      },
      { id: "role", label: "Role", options: roleOptions },
      {
        id: "rate",
        label: "Rate",
        single: true,
        options: [{ value: NO_RATE, label: "$0", description: "No rate set, or a rate of $0" }],
      },
    ],
    [roleOptions],
  );

  // The query returns everyone (bounded server-side), so filter in place.
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allRows.filter((row) => {
      if (query && ![row.name, row.email].some((value) => value.toLowerCase().includes(query))) return false;
      return (
        matchesFilter(applied.mode, crewRateMode(row)) &&
        matchesFilter(applied.role, crewRateRoles(row.role)) &&
        matchesFilter(applied.rate, hasNoRate(row) ? NO_RATE : "set")
      );
    });
  }, [allRows, applied.mode, applied.rate, applied.role, search]);

  const panelRow = panel ? allRows.find((row) => row.id === panel) : undefined;

  // A `?person=` link to someone who isn't in the list: drop the param rather
  // than hold an empty panel open.
  useEffect(() => {
    if (!panel || users === undefined || panelRow) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- close the panel once the list says the row is gone
    setPanel(null);
    setPersonParam(null);
  }, [panel, panelRow, users]);

  const summary = summarizeCrewRates(rows);
  const pinned = {
    normal: allRows.filter((row) => row.rateMode === "normal").length,
    lead: allRows.filter((row) => row.rateMode === "lead").length,
  };
  const filterCount = (search.trim() ? 1 : 0) + Object.keys(applied).length;
  const loading = users === undefined || invoiceSettings === undefined;

  function openPanel(value: string | null) {
    setPanel(value);
    setPersonParam(value);
  }

  async function saveGlobals(next: GlobalCrewRates) {
    const ok = await attempt(
      () =>
        updateInvoiceSettings({
          crewNormalRateUsd: next.normal,
          crewLeadRateUsd: next.lead,
          // Older readers still look at the overtime rate; keep it on Lead.
          crewOtRateUsd: next.lead,
        }),
      "Global crew rates saved",
    );
    if (ok) setGlobalsOpen(false);
    return ok;
  }

  async function saveRate(person: CrewRateRow, args: { rateMode: CrewRateMode; hourlyRateUsd?: number }) {
    const ok = await attempt(
      () => setCompensationRate({ userId: person.id, ...args }),
      `Saved ${person.name}'s rate`,
    );
    if (ok) openPanel(null);
    return ok;
  }

  return (
    <div className="space-y-4 pb-24" data-testid="crew-rates-page">
      <PageHeader
        title="Crew rates"
        description="What each person is paid per hour. Normal and Lead follow the global rates; Custom is a fixed rate for one person. Rates price timecards and invoice crew lines."
        actions={
          <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => setGlobalsOpen(true)}>
            <SlidersHorizontalIcon />
            Edit global rates
          </Button>
        }
        meta={
          loading ? (
            <Skeleton className="h-5 w-48" />
          ) : (
            <>
              <MetaItem icon={CurrencyDollarIcon}>
                <span data-testid="crew-rates-global-normal">Normal {formatHourly(globals.normal)}</span>
              </MetaItem>
              <MetaItem icon={CurrencyDollarIcon}>
                <span data-testid="crew-rates-global-lead">Lead {formatHourly(globals.lead)}</span>
              </MetaItem>
            </>
          )
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name or email…"
        searchLabel="Search people"
        filters={filterDefinitions}
        value={filters}
        onChange={setFilters}
      />

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-5 w-72" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <ListSummary
            testId="crew-rates-summary"
            order="Alphabetical by name. Open a person to change their mode or rate."
          >
            {plural(summary.people, "person", "people")} · {summary.custom} on custom rates · {summary.noRate} with no
            rate
          </ListSummary>

          {rows.length === 0 ? (
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
                    Show everyone
                  </Button>
                ) : null
              }
            >
              {filterCount
                ? "Nobody matches this search and these filters."
                : "No people yet. Invite crew from Users, then set their rates here."}
            </EmptyState>
          ) : (
            <RowList joined testId="crew-rates-list">
              {rows.map((row) => {
                const mode = crewRateMode(row);
                const noRate = hasNoRate(row);
                const roles = crewRateRoles(row.role).map(roleLabel).join(", ");
                return (
                  <ListRow
                    key={row.id}
                    data-testid={`crew-rate-row-${row.id}`}
                    onOpen={() => openPanel(row.id)}
                    actions={
                      <RowMenu label={`More for ${row.name}`}>
                        <DropdownMenuItem onSelect={() => openPanel(row.id)}>Edit rate</DropdownMenuItem>
                      </RowMenu>
                    }
                  >
                    <RowText title={row.name} detail={[roles, row.email].filter(Boolean).join(" · ")} />
                    {noRate ? <RowFlag className="hidden sm:inline">No rate</RowFlag> : null}
                    <StatusPill tone={CREW_RATE_MODE_TONES[mode]} className="hidden h-6 w-20 justify-center sm:inline-flex">
                      {CREW_RATE_MODE_LABELS[mode]}
                    </StatusPill>
                    <RowCell className="w-20 font-medium">
                      {row.hourlyRateUsd === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        formatHourly(row.hourlyRateUsd)
                      )}
                    </RowCell>
                  </ListRow>
                );
              })}
            </RowList>
          )}
        </>
      )}

      <DetailSheet
        open={Boolean(panelRow)}
        onOpenChange={(open) => {
          if (!open) openPanel(null);
        }}
        testId="crew-rate-sheet"
      >
        {panelRow ? (
          <CrewRateSheetBody
            key={panelRow.id}
            person={panelRow}
            globals={globals}
            onSave={(args) => saveRate(panelRow, args)}
            onCancel={() => openPanel(null)}
          />
        ) : null}
      </DetailSheet>

      <GlobalRatesDialog
        open={globalsOpen}
        onOpenChange={setGlobalsOpen}
        rates={globals}
        pinned={pinned}
        onSave={saveGlobals}
      />
    </div>
  );
}
