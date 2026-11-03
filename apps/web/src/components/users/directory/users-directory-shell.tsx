"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  BuildingsIcon,
  EnvelopeSimpleIcon,
  PlusIcon,
  UsersThreeIcon,
  type Icon,
} from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import {
  USERS_DIRECTORY_TABS,
  USERS_DIRECTORY_TAB_LABELS,
  activeUsersTabFromPathname,
  getUsersDirectoryTabPath,
  type UsersDirectoryTabId,
} from "@/lib/users-directory-tabs";
import { PageHeader, PageTabs } from "@/components/page-header";
import type { FilterDefinition, FilterState, FilterValue } from "@/components/filter-bar";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { AddPersonDialog } from "@/components/users/directory/add-person-dialog";
import { CreateOrganizationDialog } from "@/components/users/directory/create-organization-dialog";
import { findArborLiveOrgId, type OrgOption } from "@/components/users/directory/shared";

const TAB_ICONS: Record<UsersDirectoryTabId, Icon> = {
  people: UsersThreeIcon,
  invitations: EnvelopeSimpleIcon,
  organizations: BuildingsIcon,
};

type UsersDirectoryContextValue = {
  /** Undefined while loading. */
  orgOptions: OrgOption[] | undefined;
  /** The People / Invitations Organization chip, or `null` for all organizations. */
  orgFilter: FilterValue | null;
  setOrgFilter: (value: FilterValue | null) => void;
  /** The org id the filter points at, or `undefined` for all organizations. */
  filterOrgId: string | undefined;
  openAddPerson: () => void;
};

const UsersDirectoryContext = createContext<UsersDirectoryContextValue | null>(null);

export function useUsersDirectory() {
  const value = useContext(UsersDirectoryContext);
  if (!value) throw new Error("useUsersDirectory must be used inside UsersDirectoryShell.");
  return value;
}

/**
 * The Users page: one header, route-based tabs (People · Invitations ·
 * Organizations), and the state the tabs share — the organization filter and
 * the Add person / New organization dialogs.
 */
export function UsersDirectoryShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const activeTab = activeUsersTabFromPathname(pathname);
  const organizations = useQuery(api.users.listOrganizationsAdmin, {});
  const pendingInvites = useQuery(api.users.listInvitationsAdmin, { status: "pending" });
  const backfillDefaults = useMutation(api.users.backfillUserAdminDefaults);

  // `undefined` until the admin touches the chip, so the default can wait for the org list.
  const [orgFilterChoice, setOrgFilter] = useState<FilterValue | null | undefined>(undefined);
  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [createOrgOpen, setCreateOrgOpen] = useState(false);

  // Default to Arbor Live, the org most people belong to, once the list loads.
  const defaultOrgId = organizations ? findArborLiveOrgId(organizations) : "";
  const orgFilter = useMemo<FilterValue | null>(() => {
    if (orgFilterChoice !== undefined) return orgFilterChoice;
    return defaultOrgId ? { operator: "is", values: [defaultOrgId] } : null;
  }, [orgFilterChoice, defaultOrgId]);
  const filterOrgId = orgFilter?.values[0];

  const context = useMemo<UsersDirectoryContextValue>(
    () => ({
      orgOptions: organizations,
      orgFilter,
      setOrgFilter,
      filterOrgId,
      openAddPerson: () => setAddPersonOpen(true),
    }),
    [organizations, orgFilter, filterOrgId],
  );

  async function onBackfillDefaults() {
    try {
      await backfillDefaults({});
      notify.success("Backfill started for existing users.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  const pendingCount = pendingInvites?.length ?? 0;

  return (
    <UsersDirectoryContext.Provider value={context}>
      <div className="space-y-4 pb-24" data-testid="users-directory">
        <PageHeader
          title="Users"
          description="People with portal access, their pending invitations, and the organizations they belong to."
          actions={
            activeTab === "organizations" ? (
              <Button type="button" size="sm" onClick={() => setCreateOrgOpen(true)}>
                <PlusIcon />
                New organization
              </Button>
            ) : (
              <Button type="button" size="sm" onClick={() => setAddPersonOpen(true)}>
                <PlusIcon />
                Add person
              </Button>
            )
          }
          menu={
            <>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/users/crew-rates">Crew rates</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/timecards">Crew timecards</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/users/crew-applications">Crew applications</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/users/artist-applications">Artist applications</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void onBackfillDefaults()}>
                Backfill existing users to defaults
              </DropdownMenuItem>
            </>
          }
        />
        <PageTabs
          label="Users sections"
          tabs={USERS_DIRECTORY_TABS.map((tab) => ({
            href: getUsersDirectoryTabPath(tab),
            label: USERS_DIRECTORY_TAB_LABELS[tab],
            icon: TAB_ICONS[tab],
            active: tab === activeTab,
            badge:
              tab === "invitations" && pendingCount > 0 ? (
                <span
                  className="bg-muted px-1.5 text-xs text-muted-foreground tabular-nums"
                  title={`${pendingCount} pending invitation${pendingCount === 1 ? "" : "s"}`}
                >
                  {pendingCount}
                </span>
              ) : undefined,
          }))}
        />
        {children}
      </div>
      {addPersonOpen ? (
        <AddPersonDialog
          open={addPersonOpen}
          onOpenChange={setAddPersonOpen}
          orgOptions={organizations ?? []}
          defaultOrgId={filterOrgId ?? (organizations ? findArborLiveOrgId(organizations) : "")}
        />
      ) : null}
      {createOrgOpen ? (
        <CreateOrganizationDialog open={createOrgOpen} onOpenChange={setCreateOrgOpen} />
      ) : null}
    </UsersDirectoryContext.Provider>
  );
}

const ORG_FILTER_ID = "organization";

/**
 * The Organization chip for the People and Invitations filter bars. Its value
 * lives in the shell so both tabs (and Add person's default org) share it;
 * the tab's other chips stay in `filters`. Single-value because the list
 * queries take one organization.
 */
export function useOrgFilter(filters: FilterState, setFilters: (next: FilterState) => void) {
  const { orgOptions, orgFilter, setOrgFilter, filterOrgId } = useUsersDirectory();
  const definition = useMemo<FilterDefinition>(
    () => ({
      id: ORG_FILTER_ID,
      label: "Organization",
      single: true,
      options: (orgOptions ?? []).map((org) => ({ value: org.id, label: org.name })),
    }),
    [orgOptions],
  );
  const value = useMemo<FilterState>(
    () => (orgFilter ? { [ORG_FILTER_ID]: orgFilter, ...filters } : filters),
    [orgFilter, filters],
  );
  const onChange = useCallback(
    (next: FilterState) => {
      const { [ORG_FILTER_ID]: org, ...rest } = next;
      setOrgFilter(org ?? null);
      setFilters(rest);
    },
    [setOrgFilter, setFilters],
  );
  return { definition, value, onChange, organizationId: filterOrgId };
}
