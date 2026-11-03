"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { PlusIcon } from "@phosphor-icons/react";
import { FilterBar, matchesFilter, type FilterDefinition, type FilterState } from "@/components/filter-bar";
import { EmptyState, ListSummary, RowCell, RowFlag, RowList, RowMenu, RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { PageHeader, StatusPill } from "@/components/page-header";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useSheetParam } from "@/hooks/use-sheet-param";
import { api } from "@/lib/convex-api";
import { formatRelativeTime } from "@/lib/format";
import {
  EQUIPMENT_PRICING_MODE_LABELS,
  EQUIPMENT_PRICING_MODE_OPTIONS,
  INVOICE_GROUP_TYPE_LABELS,
  INVOICE_GROUP_TYPE_OPTIONS,
} from "@/lib/invoice-group-labels";
import { notify } from "@/lib/notify";
import { MergeHostsDialog, NewHostDialog } from "./host-dialogs";
import { attempt, HOST_STATUS, hostStatus, plural, type HostRow } from "./host-model";
import { HostSheet } from "./host-sheet";

const STATUS_OPTIONS = (Object.keys(HOST_STATUS) as Array<keyof typeof HOST_STATUS>).map((value) => ({
  value,
  label: HOST_STATUS[value].label,
}));

const FILTERS: FilterDefinition[] = [
  { id: "type", label: "Type", options: INVOICE_GROUP_TYPE_OPTIONS.map(({ value, label }) => ({ value, label })) },
  { id: "pricing", label: "Equipment pricing", options: EQUIPMENT_PRICING_MODE_OPTIONS },
  { id: "status", label: "Status", options: STATUS_OPTIONS, single: true },
];

/** Archived hosts stay out of the way until someone asks for them. */
const DEFAULT_FILTERS: FilterState = { status: { operator: "is", values: ["active"] } };

/**
 * The clients we invoice. Every host loads at once (the table is small), so
 * search and filters run over rows already in hand.
 */
export function BillingHostsManager() {
  const { confirm } = useAppDialog();
  const hosts = useQuery(api.invoiceGroups.listForAdmin, { includeInactive: true });
  const archiveGroup = useMutation(api.invoiceGroups.archive);
  const restoreGroup = useMutation(api.invoiceGroups.restore);
  const [openId, setOpenId] = useSheetParam("host");
  const [creating, setCreating] = useState(false);
  const [mergeInto, setMergeInto] = useState<HostRow | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (hosts ?? []).filter(
      (host) =>
        (!query || host.name.toLowerCase().includes(query)) &&
        matchesFilter(filters.type, host.type) &&
        matchesFilter(filters.pricing, host.equipmentPricingMode) &&
        matchesFilter(filters.status, hostStatus(host)),
    );
  }, [filters, hosts, search]);

  const openHost = hosts?.find((host) => host._id === openId) ?? null;

  // A `?host=` link to a host that isn't there: say so and drop the param.
  useEffect(() => {
    if (!openId || hosts === undefined || openHost) return;
    notify.error("That billing host doesn't exist anymore.");
    setOpenId(null);
  }, [hosts, openHost, openId, setOpenId]);

  const active = rows.filter((host) => host.active);
  const withoutContact = active.filter((host) => host.contactCount === 0).length;
  const nonSubsidized = rows.filter((host) => host.equipmentPricingMode === "nonSubsidized").length;
  const archived = rows.length - active.length;

  async function archive(host: HostRow) {
    const ok = await confirm({
      title: `Archive ${host.name}?`,
      description:
        "It drops out of the host picker on invoices and booking requests. Its invoices, events and contacts stay as they are, and you can restore it later.",
      destructive: true,
      confirmLabel: "Archive host",
    });
    if (ok) await attempt(() => archiveGroup({ id: host._id }), `Archived ${host.name}`);
  }

  function restore(host: HostRow) {
    void attempt(() => restoreGroup({ id: host._id }), `Restored ${host.name}`);
  }

  return (
    <div className="space-y-4 pb-24" data-testid="billing-hosts-page">
      <PageHeader
        back={{ href: "/dashboard/ops-center", label: "Ops Center" }}
        title="Billing hosts"
        description="The clients we invoice and host events for. Portal organizations (Arbor Live, artists) are under Users."
        actions={
          <Button type="button" size="sm" onClick={() => setCreating(true)}>
            <PlusIcon />
            New host
          </Button>
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search hosts…"
        searchLabel="Search billing hosts"
        filters={FILTERS}
        value={filters}
        onChange={setFilters}
      />

      {hosts === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-5 w-72" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <ListSummary testId="billing-hosts-summary" order="A to Z. Open a host to edit its contacts and aliases.">
            {[
              plural(rows.length, "host"),
              withoutContact > 0 ? `${withoutContact} without a contact` : null,
              nonSubsidized > 0 ? `${nonSubsidized} non-subsidized` : null,
              archived > 0 ? `${archived} archived` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </ListSummary>

          {rows.length === 0 ? (
            <EmptyState
              action={
                hosts.length > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearch("");
                      setFilters({});
                    }}
                  >
                    Clear search and filters
                  </Button>
                ) : null
              }
            >
              {hosts.length > 0
                ? "No hosts match this search and these filters."
                : "No billing hosts yet. Add the first client with New host."}
            </EmptyState>
          ) : (
            <RowList testId="billing-host-list">
              {rows.map((host) => (
                <HostListRow
                  key={host._id}
                  host={host}
                  onOpen={() => setOpenId(host._id)}
                  onMerge={() => setMergeInto(host)}
                  onArchive={() => void archive(host)}
                  onRestore={() => restore(host)}
                />
              ))}
            </RowList>
          )}
        </>
      )}

      <HostSheet
        host={openHost}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
        onArchive={(host) => void archive(host)}
        onRestore={restore}
        onMerge={setMergeInto}
      />
      <NewHostDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(id) => {
          setCreating(false);
          setOpenId(id);
        }}
      />
      <MergeHostsDialog
        survivor={mergeInto}
        hosts={hosts ?? []}
        onOpenChange={(open) => {
          if (!open) setMergeInto(null);
        }}
      />
    </div>
  );
}

function HostListRow({
  host,
  onOpen,
  onMerge,
  onArchive,
  onRestore,
}: {
  host: HostRow;
  onOpen: () => void;
  onMerge: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const status = HOST_STATUS[hostStatus(host)];
  return (
    <ListRow
      data-testid={`billing-host-row-${host._id}`}
      onOpen={onOpen}
      className={host.active ? undefined : "text-muted-foreground"}
      actions={
        <RowMenu label={`More for ${host.name}`}>
          <DropdownMenuItem onSelect={onOpen}>Open details</DropdownMenuItem>
          {host.active ? <DropdownMenuItem onSelect={onMerge}>Merge hosts into this one</DropdownMenuItem> : null}
          <DropdownMenuSeparator />
          {host.active ? (
            <DropdownMenuItem variant="destructive" onSelect={onArchive}>
              Archive
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={onRestore}>Restore</DropdownMenuItem>
          )}
        </RowMenu>
      }
    >
      <RowText
        eyebrow={INVOICE_GROUP_TYPE_LABELS[host.type]}
        title={host.name}
        detail={[
          plural(host.contactCount, "contact"),
          host.aliasCount > 0 ? plural(host.aliasCount, "alias", "aliases") : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      />
      {host.active && host.contactCount === 0 ? (
        <RowFlag className="hidden sm:inline">No contact</RowFlag>
      ) : null}
      <RowCell className="w-28" hideBelow="md" muted>
        {EQUIPMENT_PRICING_MODE_LABELS[host.equipmentPricingMode]}
      </RowCell>
      <RowCell className="w-28" hideBelow="lg" muted>
        {host.lastUsedAt ? formatRelativeTime(host.lastUsedAt) : "Never billed"}
      </RowCell>
      <StatusPill tone={status.tone} className="hidden h-6 w-24 shrink-0 justify-center sm:inline-flex">
        {status.label}
      </StatusPill>
    </ListRow>
  );
}
