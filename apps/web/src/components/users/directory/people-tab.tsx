"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { CaretRightIcon, DotsThreeIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/account/user-avatar";
import { ListRow } from "@/components/list-row";
import {
  activeFilters,
  FilterBar,
  matchesFilter,
  type FilterDefinition,
  type FilterState,
} from "@/components/filter-bar";
import { USER_DISCIPLINE_OPTIONS, USER_VERTICAL_OPTIONS } from "@/lib/validations/users";
import { fuzzyScoreHaystack } from "@/lib/fuzzy-match";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PersonSheet, usePersonActions } from "@/components/users/directory/person-sheet";
import {
  ALL_ORGS,
  EmptyRows,
  FLAG_CLASS,
  STATUS_CHIP,
  USER_STATUS_OPTIONS,
  isOnboardingIncomplete,
  roleLabel,
  useSheetParam,
  userStatusOption,
  type AdminUser,
  type CrewOnboardingRow,
  type UserStatus,
} from "@/components/users/directory/shared";
import { OrgFilterSelect, useUsersDirectory } from "@/components/users/directory/users-directory-shell";

type AccessFilter = UserStatus | "all";

const ONBOARDING_OPTIONS = [
  { value: "incomplete", label: "Not finished" },
  { value: "complete", label: "Finished or waived" },
];

/** Relevance of a person to the search query; 0 when they do not match. */
function userSearchScore(user: AdminUser, query: string) {
  if (!query) return 1;
  return fuzzyScoreHaystack(query, [
    user.name,
    user.email,
    user.username,
    user.phone,
    user.title,
    user.verticals.join(" "),
    user.disciplines.join(" "),
  ]);
}

/** Everyone with an account in the filtered organization, alphabetical (best match first while searching), with a side panel per person. */
export function PeopleTab() {
  const { orgOptions, filterOrgId, setOrgFilter, openAddPerson } = useUsersDirectory();
  const users = useQuery(
    api.users.listUsersForAdmin,
    orgOptions === undefined ? "skip" : { organizationId: filterOrgId },
  );
  const crewOnboarding = useQuery(api.onboarding.listCrewOnboardingForAdmin, {});
  const actions = usePersonActions();
  const [selectedId, setSelectedId] = useSheetParam("user");
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search.trim().toLowerCase());
  const [access, setAccess] = useState<AccessFilter>("active");
  const [filters, setFilters] = useState<FilterState>({});

  const onboardingByUserId = useMemo(() => {
    const map = new Map<string, CrewOnboardingRow>();
    for (const row of crewOnboarding ?? []) map.set(row.userId, row);
    return map;
  }, [crewOnboarding]);

  const summary = useMemo(() => {
    const counts = { active: 0, inactive: 0, alumni: 0, onboarding: 0 };
    for (const user of users ?? []) {
      counts[user.status] += 1;
      if (user.status === "active" && isOnboardingIncomplete(onboardingByUserId.get(user.id))) {
        counts.onboarding += 1;
      }
    }
    return counts;
  }, [users, onboardingByUserId]);

  const filterDefinitions = useMemo<FilterDefinition[]>(
    () => [
      { id: "onboarding", label: "Onboarding", options: ONBOARDING_OPTIONS, single: true },
      {
        id: "role",
        label: "Role",
        options: [...new Set((users ?? []).map((user) => user.role))]
          .sort((a, b) => a.localeCompare(b))
          .map((role) => ({ value: role, label: roleLabel(role) })),
      },
      { id: "vertical", label: "Vertical", options: USER_VERTICAL_OPTIONS.map((value) => ({ value, label: value })) },
      {
        id: "discipline",
        label: "Discipline",
        options: USER_DISCIPLINE_OPTIONS.map((value) => ({ value, label: value })),
      },
    ],
    [users],
  );

  const rows = useMemo(() => {
    const scored: Array<{ user: AdminUser; score: number }> = [];
    for (const user of users ?? []) {
      if (access !== "all" && user.status !== access) continue;
      const onboarding = isOnboardingIncomplete(onboardingByUserId.get(user.id)) ? "incomplete" : "complete";
      const matches =
        matchesFilter(filters.onboarding, onboarding) &&
        matchesFilter(filters.role, user.role) &&
        matchesFilter(filters.vertical, user.verticals) &&
        matchesFilter(filters.discipline, user.disciplines);
      if (!matches) continue;
      const score = userSearchScore(user, query);
      if (score <= 0) continue;
      scored.push({ user, score });
    }
    // With no query the list stays alphabetical (the backend order). While
    // searching, the best match floats to the top instead of hiding at its
    // alphabetical position.
    if (query) scored.sort((a, b) => b.score - a.score || a.user.name.localeCompare(b.user.name));
    return scored.map((entry) => entry.user);
  }, [users, access, filters, onboardingByUserId, query]);

  // Resolve against the unfiltered list, so changing someone's status keeps
  // their panel open even when the filter no longer shows the row.
  const selectedUser = users?.find((user) => user.id === selectedId) ?? null;

  // A deep link (`?user=`) to someone outside the filtered organization
  // widens the filter once, so the panel still opens. After that the filter
  // is the admin's to change; a person outside it just closes the panel.
  const widenedForDeepLink = useRef(false);
  useEffect(() => {
    if (!users || !selectedId || selectedUser) return;
    if (filterOrgId && !widenedForDeepLink.current) {
      widenedForDeepLink.current = true;
      setOrgFilter(ALL_ORGS);
    } else {
      setSelectedId(null);
    }
  }, [users, selectedId, selectedUser, filterOrgId, setOrgFilter, setSelectedId]);

  const filtersActive = Boolean(query) || access !== "all" || Object.keys(activeFilters(filters)).length > 0;

  return (
    <div className="space-y-3" data-testid="people-tab">
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name, email, team…"
        searchLabel="Search people"
        filters={filterDefinitions}
        value={filters}
        onChange={setFilters}
      >
        <OrgFilterSelect />
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          aria-label="Access"
          value={access}
          onValueChange={(value) => value && setAccess(value as AccessFilter)}
        >
          {USER_STATUS_OPTIONS.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {option.label}
            </ToggleGroupItem>
          ))}
          <ToggleGroupItem value="all">All</ToggleGroupItem>
        </ToggleGroup>
      </FilterBar>

      {users === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : (
        <>
          <p className="text-sm" data-testid="people-summary">
            {users.length} {users.length === 1 ? "person" : "people"} · {summary.active} active ·{" "}
            {summary.inactive} inactive · {summary.alumni} alumni
            {summary.onboarding > 0 ? ` · ${summary.onboarding} with onboarding left` : ""}
            <span className="text-muted-foreground"> · Alphabetical by name</span>
          </p>
          {rows.length === 0 ? (
            <EmptyRows>
              {users.length === 0 ? (
                <>
                  No one in this organization yet.{" "}
                  <button type="button" className="underline underline-offset-2" onClick={openAddPerson}>
                    Add a person
                  </button>{" "}
                  to invite them.
                </>
              ) : filtersActive ? (
                "No one matches these filters. Clear the search or pick another access state."
              ) : (
                "No one matches these filters."
              )}
            </EmptyRows>
          ) : (
            <ul className="space-y-2">
              {rows.map((user) => (
                <PersonRow
                  key={user.id}
                  user={user}
                  onboarding={onboardingByUserId.get(user.id) ?? null}
                  onOpen={() => setSelectedId(user.id)}
                  onPasswordReset={() => void actions.sendPasswordReset(user)}
                  onWaiveOnboarding={() => void actions.waiveOnboarding(user)}
                  onMarkAlumni={() => void actions.setStatus(user, "alumni")}
                />
              ))}
            </ul>
          )}
        </>
      )}

      <PersonSheet
        user={selectedUser}
        onboarding={selectedUser ? (onboardingByUserId.get(selectedUser.id) ?? null) : null}
        orgOptions={orgOptions ?? []}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
    </div>
  );
}

function PersonRow({
  user,
  onboarding,
  onOpen,
  onPasswordReset,
  onWaiveOnboarding,
  onMarkAlumni,
}: {
  user: AdminUser;
  onboarding: CrewOnboardingRow | null;
  onOpen: () => void;
  onPasswordReset: () => void;
  onWaiveOnboarding: () => void;
  onMarkAlumni: () => void;
}) {
  const status = userStatusOption(user.status);
  const teams = [...user.verticals, ...user.disciplines].join(" · ") || user.title;
  const onboardingLeft = isOnboardingIncomplete(onboarding);
  return (
    <ListRow
      data-testid={`user-row-${user.id}`}
      onOpen={onOpen}
      className={user.status !== "active" ? "text-muted-foreground" : undefined}
      actions={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`More for ${user.name}`}>
              <DotsThreeIcon className="size-4" weight="bold" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onOpen}>Open details</DropdownMenuItem>
            <DropdownMenuItem onSelect={onPasswordReset}>Send password reset</DropdownMenuItem>
            {onboardingLeft ? (
              <DropdownMenuItem onSelect={onWaiveOnboarding}>Waive onboarding</DropdownMenuItem>
            ) : null}
            {user.status !== "alumni" ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={onMarkAlumni}>
                  Close access (alumni)
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      <UserAvatar name={user.name} email={user.email} userId={user.id} size="sm" />
      <div className="min-w-0 flex-1">
        {teams ? (
          <p className="truncate text-2xs font-medium tracking-wide text-muted-foreground uppercase">
            {teams}
          </p>
        ) : null}
        <p className="truncate font-medium">{user.name}</p>
        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
      </div>
      {onboardingLeft ? (
        <span className={cn(FLAG_CLASS, "hidden shrink-0 sm:inline")}>
          Onboarding · {onboarding?.incompleteStepCount ?? "?"} left
        </span>
      ) : null}
      <span className="hidden w-20 shrink-0 text-right text-xs text-muted-foreground md:block">
        {roleLabel(user.role)}
      </span>
      <span
        data-testid="user-status"
        className={cn(
          "w-20 shrink-0 rounded-md py-0.5 text-center text-xs font-medium",
          STATUS_CHIP[status.tone],
        )}
      >
        {status.label}
      </span>
      <CaretRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </ListRow>
  );
}
