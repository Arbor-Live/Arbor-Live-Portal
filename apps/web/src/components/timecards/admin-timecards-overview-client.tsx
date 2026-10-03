"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { CalendarBlankIcon, ClockIcon } from "@phosphor-icons/react";
import {
  activeFilters,
  FilterBar,
  matchesFilter,
  type FilterDefinition,
  type FilterState,
} from "@/components/filter-bar";
import { EmptyState, ListSummary, RowCell, RowGroup, RowMenu, RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { MetaItem, PageHeader, StatusPill, type Tone } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/convex-api";
import { formatDate } from "@/lib/format";
import { PERIOD_STATUS } from "@/components/timecards/timecard-period-list";

type TimecardOverviewRow = FunctionReturnType<
  typeof api.timecards.listCrewTimecardOverview
>["rows"][number];

const FILTERS: FilterDefinition[] = [
  {
    id: "worked",
    label: "Worked",
    single: true,
    options: [
      { value: "worked", label: "Worked this period" },
      { value: "none", label: "No days this period" },
    ],
  },
  {
    id: "input",
    label: "Hours to input",
    single: true,
    options: [
      { value: "pending", label: "Some to input" },
      { value: "clear", label: "Nothing to input" },
    ],
  },
];

const PERIODS = ["Current", "Previous", "2 periods ago"];

const GROUPS: {
  id: string;
  label: string;
  description: string;
  tone: Tone;
  test: (row: TimecardOverviewRow) => boolean;
}[] = [
  {
    id: "input",
    label: "Hours to input",
    description: "Worked shifts whose hours still need entering into payroll.",
    tone: "amber",
    test: (row) => row.totalInputHours > 0,
  },
  {
    id: "clear",
    label: "Nothing to input",
    description: "Worked this period and fully entered.",
    tone: "neutral",
    test: (row) => row.totalInputHours <= 0 && row.daysWorked > 0,
  },
  {
    id: "idle",
    label: "No days this period",
    description: "Active crew with no shifts in this pay period.",
    tone: "neutral",
    test: (row) => row.totalInputHours <= 0 && row.daysWorked === 0,
  },
];

const hours = (value: number) => `${value.toFixed(2)} h`;

/** Every active crew member's hours for one pay period, most to input first. */
export function AdminTimecardsOverviewClient() {
  const [now] = useState(() => Date.now());
  const [periodIndex, setPeriodIndex] = useState(0);
  const overview = useQuery(api.timecards.listCrewTimecardOverview, { now, periodIndex });
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>({});
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (overview?.rows ?? [])
      .filter(
        (row) =>
          (!needle || [row.name, row.email].some((field) => field.toLowerCase().includes(needle))) &&
          matchesFilter(filters.worked, row.daysWorked > 0 ? "worked" : "none") &&
          matchesFilter(filters.input, row.totalInputHours > 0 ? "pending" : "clear"),
      )
      .sort(
        (a, b) =>
          b.totalInputHours - a.totalInputHours ||
          b.totalActualHours - a.totalActualHours ||
          a.name.localeCompare(b.name),
      );
  }, [filters, overview, search]);
  const narrowed = Boolean(search.trim()) || Object.keys(activeFilters(filters)).length > 0;
  const totalInput = rows.reduce((sum, row) => sum + row.totalInputHours, 0);
  const totalWorked = rows.reduce((sum, row) => sum + row.totalActualHours, 0);
  const period = overview?.period;

  return (
    <div className="space-y-4 pb-24" data-testid="timecards-page">
      <PageHeader
        title="Crew timecards"
        description="Crew hours from scheduled shifts, one pay period at a time. Open someone to see their day-by-day hours."
        pills={
          period ? (
            <StatusPill tone={PERIOD_STATUS[period.status].tone} className="h-6">
              {PERIOD_STATUS[period.status].label}
            </StatusPill>
          ) : null
        }
        meta={
          period ? (
            <>
              <MetaItem icon={CalendarBlankIcon}>{period.label}</MetaItem>
              <MetaItem icon={ClockIcon}>Due {formatDate(period.dueMs)}</MetaItem>
            </>
          ) : null
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search crew name or email…"
        searchLabel="Search crew"
        filters={FILTERS}
        value={filters}
        onChange={setFilters}
      >
        <div className="flex flex-wrap gap-1" role="group" aria-label="Pay period">
          {PERIODS.map((label, index) => (
            <Button
              key={label}
              type="button"
              size="sm"
              variant={periodIndex === index ? "secondary" : "ghost"}
              aria-pressed={periodIndex === index}
              onClick={() => setPeriodIndex(index)}
            >
              {label}
            </Button>
          ))}
        </div>
      </FilterBar>

      {overview === undefined ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          <ListSummary testId="timecards-summary" order="Most hours to input first.">
            {rows.length} crew member{rows.length === 1 ? "" : "s"} · {hours(totalWorked)} worked ·{" "}
            {hours(totalInput)} to input
          </ListSummary>
          {rows.length === 0 ? (
            <EmptyState>
              {narrowed ? "No crew match this search and these filters." : "No active crew profiles found."}
            </EmptyState>
          ) : (
            <div className="space-y-4">
              {GROUPS.map((group) => {
                const groupRows = rows.filter(group.test);
                if (groupRows.length === 0) return null;
                return (
                  <RowGroup
                    key={group.id}
                    testId={`timecard-group-${group.id}`}
                    className="border"
                    title={group.label}
                    count={groupRows.length}
                    tone={group.tone}
                    description={group.description}
                  >
                    {groupRows.map((row) => {
                      const href = `/dashboard/users/timecards/${row.userId}`;
                      return (
                        <ListRow
                          key={row.userId}
                          data-testid={`timecard-row-${row.userId}`}
                          href={href}
                          actions={
                            <RowMenu label={`More for ${row.name}`}>
                              <DropdownMenuItem asChild>
                                <Link href={href}>Open timecard</Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <a href={`mailto:${row.email}`}>Email {row.name.split(" ")[0]}</a>
                              </DropdownMenuItem>
                            </RowMenu>
                          }
                        >
                          <RowText title={row.name} detail={row.email} />
                          <RowCell className="w-24" align="right" hideBelow="sm" muted>
                            {row.daysWorked} day{row.daysWorked === 1 ? "" : "s"}
                          </RowCell>
                          <RowCell className="w-32" align="right" hideBelow="md" muted>
                            {hours(row.totalActualHours)} worked
                          </RowCell>
                          <RowCell className="w-32" align="right">
                            <span className={row.totalInputHours > 0 ? "font-medium" : "text-muted-foreground"}>
                              {hours(row.totalInputHours)} to input
                            </span>
                          </RowCell>
                        </ListRow>
                      );
                    })}
                  </RowGroup>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
