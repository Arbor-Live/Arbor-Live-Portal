"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { CaretRightIcon, DotsThreeIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { OrganizationCSVImporter } from "@/components/org-csv-importer";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  ORG_TYPE_LABELS,
  OrganizationSheet,
  useOrganizationActions,
  type DirectoryOrg,
} from "@/components/users/directory/organization-sheet";
import { EmptyRows, FLAG_CLASS, STATUS_CHIP, useSheetParam } from "@/components/users/directory/shared";
import { useUsersDirectory } from "@/components/users/directory/users-directory-shell";

type OrgFilter = "all" | "artists" | "internal" | "archived";

const ORG_FILTERS: Array<{ value: OrgFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "artists", label: "Artists" },
  { value: "internal", label: "Internal" },
  { value: "archived", label: "Archived" },
];

/**
 * Every organization people belong to: Arbor Live itself and the artist orgs,
 * alphabetical. Billing hosts (who we invoice) are a separate list in the Ops
 * Center, because they are clients, not portal organizations.
 */
export function OrganizationsTab() {
  const { orgOptions, openAddPerson } = useUsersDirectory();
  const artistOrgs = useQuery(api.users.listBandOrganizationsAdmin, { includeArchived: true });
  const actions = useOrganizationActions();
  const [selectedId, setSelectedId] = useSheetParam("org");
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search.trim().toLowerCase());
  const [filter, setFilter] = useState<OrgFilter>("all");

  const organizations = useMemo<DirectoryOrg[] | undefined>(() => {
    if (!orgOptions || !artistOrgs) return undefined;
    const byId = new Map<string, DirectoryOrg>();
    for (const org of orgOptions) {
      byId.set(org.id, {
        id: org.id,
        name: org.name,
        displayName: org.name,
        slug: org.slug,
        organizationType: org.organizationType,
        archived: false,
        artist: null,
      });
    }
    // Artist rows carry the profile and onboarding, and include archived orgs.
    for (const artist of artistOrgs) {
      byId.set(artist.organizationId, {
        id: artist.organizationId,
        name: artist.name,
        displayName: artist.displayName || artist.name,
        slug: artist.slug,
        organizationType: artist.organizationType,
        archived: artist.status === "archived",
        artist,
      });
    }
    return [...byId.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [orgOptions, artistOrgs]);

  const summary = useMemo(() => {
    const counts = { total: 0, artists: 0, onboarding: 0, internal: 0, archived: 0 };
    for (const org of organizations ?? []) {
      if (org.archived) {
        counts.archived += 1;
        continue;
      }
      counts.total += 1;
      if (org.artist) counts.artists += 1;
      else counts.internal += 1;
      if (org.artist?.awaitingOnboarding) counts.onboarding += 1;
    }
    return counts;
  }, [organizations]);

  const rows = useMemo(
    () =>
      (organizations ?? []).filter((org) => {
        if (filter === "archived" ? !org.archived : org.archived) return false;
        if (filter === "artists" && !org.artist) return false;
        if (filter === "internal" && org.artist) return false;
        if (!query) return true;
        return [org.name, org.displayName, org.slug].join(" ").toLowerCase().includes(query);
      }),
    [organizations, filter, query],
  );

  const selectedOrg = organizations?.find((org) => org.id === selectedId) ?? null;

  return (
    <div className="space-y-3" data-testid="organizations-tab">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search organizations"
            placeholder="Search organizations…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          aria-label="Organization type"
          value={filter}
          onValueChange={(value) => value && setFilter(value as OrgFilter)}
        >
          {ORG_FILTERS.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {organizations === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : (
        <>
          <div className="space-y-1">
            <p className="text-sm" data-testid="organizations-summary">
              {summary.total} organization{summary.total === 1 ? "" : "s"} · {summary.artists} artist
              {summary.artists === 1 ? "" : "s"}
              {summary.onboarding > 0 ? ` (${summary.onboarding} onboarding)` : ""} · {summary.internal}{" "}
              internal · {summary.archived} archived
              <span className="text-muted-foreground"> · Alphabetical</span>
            </p>
            <p className="text-xs text-muted-foreground">
              The clients we invoice are{" "}
              <Link href="/dashboard/financial-hub/organizations" className="underline underline-offset-2">
                billing hosts
              </Link>{" "}
              in the Ops Center. Artist profiles and riders are edited under{" "}
              <Link href="/dashboard/artists" className="underline underline-offset-2">
                Artists
              </Link>
              .
            </p>
          </div>
          {rows.length === 0 ? (
            <EmptyRows>
              {filter === "archived"
                ? "No archived organizations."
                : "No organizations match. Clear the search, or create one with New organization."}
            </EmptyRows>
          ) : (
            <ul className="space-y-2">
              {rows.map((org) => (
                <OrganizationRow
                  key={org.id}
                  org={org}
                  onOpen={() => setSelectedId(org.id)}
                  onViewAsArtist={() => void actions.viewAsArtist(org)}
                  onArchive={() => void actions.archive(org)}
                  onRestore={() => void actions.restore(org)}
                  onDelete={() => void actions.deletePermanently(org)}
                />
              ))}
            </ul>
          )}
        </>
      )}

      <OrganizationCSVImporter />

      <OrganizationSheet
        org={selectedOrg}
        onAddPerson={openAddPerson}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
    </div>
  );
}

function OrganizationRow({
  org,
  onOpen,
  onViewAsArtist,
  onArchive,
  onRestore,
  onDelete,
}: {
  org: DirectoryOrg;
  onOpen: () => void;
  onViewAsArtist: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const missing = org.artist?.onboardingIncompleteSteps.length ?? 0;
  return (
    <li
      data-testid={`org-row-${org.id}`}
      className={cn(
        "flex items-center gap-2 border pr-1 pl-3 text-sm transition-colors hover:bg-muted/30",
        org.archived && "text-muted-foreground",
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left"
        onClick={onOpen}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-2xs font-medium tracking-wide text-muted-foreground uppercase">
            {ORG_TYPE_LABELS[org.organizationType]}
          </p>
          <p className="truncate font-medium">{org.displayName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {org.displayName !== org.name ? `${org.name} · ` : ""}/{org.slug}
          </p>
        </div>
        {org.artist?.awaitingOnboarding && !org.archived ? (
          <span className={cn(FLAG_CLASS, "hidden shrink-0 sm:inline")}>
            Onboarding · {missing || "?"}
          </span>
        ) : null}
        <span className="hidden w-32 shrink-0 text-right text-xs text-muted-foreground tabular-nums md:block">
          {org.artist ? `${formatUsd(org.artist.performerHourlyRateUsd)} / person / hr` : null}
        </span>
        <span
          className={cn(
            "w-20 shrink-0 rounded-md py-0.5 text-center text-xs font-medium",
            STATUS_CHIP[org.archived ? "neutral" : "emerald"],
          )}
        >
          {org.archived ? "Archived" : "Active"}
        </span>
        <CaretRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`More for ${org.displayName}`}>
            <DotsThreeIcon className="size-4" weight="bold" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onOpen}>Open details</DropdownMenuItem>
          {org.artist && !org.archived ? (
            <DropdownMenuItem onSelect={onViewAsArtist}>View as artist</DropdownMenuItem>
          ) : null}
          {org.artist && org.archived ? (
            <DropdownMenuItem onSelect={onRestore}>Restore</DropdownMenuItem>
          ) : null}
          {org.artist ? (
            <>
              <DropdownMenuSeparator />
              {org.archived ? (
                <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                  Delete permanently
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem variant="destructive" onSelect={onArchive}>
                  Archive
                </DropdownMenuItem>
              )}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
