"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { CaretDownIcon, MapPinIcon, PlusIcon } from "@phosphor-icons/react";
import {
  DetailSheet,
  DetailSheetHeader,
  EmptyState,
  ListSummary,
  RowCell,
  RowMenu,
  RowText,
} from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { TreeRowLeading } from "@/components/tree-row";
import {
  buildTree,
  collectParentIds,
  countDescendants,
  filterTree,
  flattenVisibleIds,
  type TreeNode,
} from "@/lib/tree";
import { MetaItem, PageHeader } from "@/components/page-header";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useSheetParam } from "@/hooks/use-sheet-param";
import { notify } from "@/lib/notify";
import { api, type Id } from "@/lib/convex-api";
import { useAppDialog } from "@/components/ui/app-dialog";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { EMPTY_LEXICAL_STATE } from "@/components/editor/lexical-theme";
import { Button } from "@/components/ui/button";
import {
  activeFilters,
  FilterBar,
  matchesFilter,
  type FilterDefinition,
  type FilterState,
} from "@/components/filter-bar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VenueEditor } from "./venue-editor";
import {
  emptyVenueForm,
  formatVenueKindLabel,
  VENUE_KINDS,
  type VenueFormValues,
  type VenueKind,
} from "@/lib/validations/venues";

type VenueRow = {
  _id: Id<"venues">;
  name: string;
  nicknames?: string[];
  parentId?: Id<"venues">;
  path: string;
  kind: "building" | "indoor" | "outdoor";
  venueType: string;
  capacity?: number;
  address?: string;
  googleMapsUrl?: string;
  notesJson?: string;
  circuits?: Array<{ label: string; voltage: number; amperage: number }>;
  documentationLinks?: Array<{ title: string; url: string }>;
  files?: Array<{ title: string; r2Key: string; fileName: string; contentType: string }>;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
};

type VenueTreeNode = TreeNode<VenueRow>;

function toFormValues(venue: VenueRow): VenueFormValues {
  return {
    name: venue.name,
    nicknames: venue.nicknames ?? [],
    parentId: venue.parentId ?? "",
    kind: venue.kind,
    venueType: venue.venueType,
    capacity: venue.capacity ?? "",
    address: venue.address ?? "",
    googleMapsUrl: venue.googleMapsUrl ?? "",
    notesJson: venue.notesJson || EMPTY_LEXICAL_STATE,
    circuits: venue.circuits ?? [],
    documentationLinks: venue.documentationLinks?.length
      ? venue.documentationLinks
      : [{ title: "", url: "" }],
    files: venue.files ?? [],
    contactName: venue.contactName ?? "",
    contactEmail: venue.contactEmail ?? "",
    contactPhone: venue.contactPhone ?? "",
  };
}

const CAPACITY_OPTIONS = [
  { value: "none", label: "Not set" },
  { value: "small", label: "Under 50" },
  { value: "medium", label: "50 to 199" },
  { value: "large", label: "200 or more" },
];

const POWER_OPTIONS = [
  { value: "listed", label: "Circuits listed" },
  { value: "none", label: "No circuits listed" },
];

function capacityBucket(capacity: number | undefined) {
  if (!capacity) return "none";
  if (capacity < 50) return "small";
  return capacity < 200 ? "medium" : "large";
}

function venueMatchesQuery(venue: VenueRow, q: string) {
  if (!q) return true;
  const nicknames = (venue.nicknames ?? []).join(" ").toLowerCase();
  return (
    venue.name.toLowerCase().includes(q) ||
    venue.path.toLowerCase().includes(q) ||
    nicknames.includes(q) ||
    venue.venueType.toLowerCase().includes(q)
  );
}

function compareVenueNames(a: VenueRow, b: VenueRow, sortDir: "asc" | "desc") {
  const cmp = a.name.localeCompare(b.name);
  return sortDir === "asc" ? cmp : -cmp;
}

export function VenuesManager() {
  const { confirm } = useAppDialog();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>({});
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // `?venue=<id>` opens a venue; `?venue=new` opens an empty one.
  const [panel, setPanel] = useSheetParam("venue");
  const [newParentId, setNewParentId] = useState("");
  /** null = not initialized yet; once set, user/search control expansion. */
  const [expandedIds, setExpandedIds] = useState<Set<string> | null>(null);
  const venues = useQuery(api.venues.list, {});
  const removeVenue = useMutation(api.venues.remove);

  const editingId = panel && panel !== "new" ? (panel as Id<"venues">) : null;
  const editingVenue = editingId ? (venues?.find((row) => row._id === editingId) ?? null) : null;
  const editorInitial = useMemo(() => {
    if (editingVenue) return toFormValues(editingVenue as VenueRow);
    // A space inside a building is a room, not another building.
    return newParentId
      ? { ...emptyVenueForm(), parentId: newParentId, kind: "indoor" as const, venueType: "Common Space" }
      : emptyVenueForm();
  }, [editingVenue, newParentId]);

  const narrowed = Boolean(search.trim()) || Object.keys(activeFilters(filters)).length > 0;

  const filterDefinitions = useMemo<FilterDefinition[]>(
    () => [
      { id: "kind", label: "Kind", options: VENUE_KINDS.map((kind) => ({ value: kind, label: formatVenueKindLabel(kind) })) },
      {
        id: "type",
        label: "Venue type",
        options: [...new Set((venues ?? []).map((venue) => venue.venueType).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b))
          .map((type) => ({ value: type, label: type })),
      },
      { id: "capacity", label: "Capacity", options: CAPACITY_OPTIONS },
      { id: "power", label: "Power", options: POWER_OPTIONS, single: true },
    ],
    [venues],
  );

  const tree = useMemo(() => {
    const q = search.trim().toLowerCase();
    const roots = buildTree((venues ?? []) as VenueRow[], (a, b) => compareVenueNames(a, b, sortDir));
    if (!narrowed) return roots;
    return filterTree(
      roots,
      (venue) =>
        venueMatchesQuery(venue, q) &&
        matchesFilter(filters.kind, venue.kind) &&
        matchesFilter(filters.type, venue.venueType) &&
        matchesFilter(filters.capacity, capacityBucket(venue.capacity)) &&
        matchesFilter(filters.power, venue.circuits?.length ? "listed" : "none"),
    );
  }, [filters, narrowed, venues, search, sortDir]);

  // Default: expand every parent so the tree is obvious on first load.
  const resolvedExpandedIds = useMemo(() => expandedIds ?? collectParentIds(tree), [expandedIds, tree]);

  // While narrowed, open every branch that survived so each match is on screen.
  const displayExpandedIds = useMemo(() => {
    if (!narrowed) return resolvedExpandedIds;
    return new Set([...resolvedExpandedIds, ...collectParentIds(tree)]);
  }, [narrowed, resolvedExpandedIds, tree]);

  const visibleIds = useMemo(() => flattenVisibleIds(tree, displayExpandedIds), [tree, displayExpandedIds]);
  const buildings = (venues ?? []).filter((venue) => !venue.parentId).length;

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev ?? collectParentIds(tree));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openNew(parentId = "") {
    setNewParentId(parentId);
    setPanel("new");
  }

  async function deleteVenue(venue: { _id: Id<"venues">; name: string }) {
    const ok = await confirm({
      title: `Delete ${venue.name}?`,
      description:
        "It leaves the venue list and event pickers. A venue with spaces inside it, or events booked in it, can't be deleted.",
      destructive: true,
      confirmLabel: "Delete venue",
    });
    if (!ok) return false;
    try {
      await removeVenue({ id: venue._id });
      notify.success(`Deleted ${venue.name}.`);
      if (editingId === venue._id) setPanel(null);
      return true;
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Could not delete the venue."));
      return false;
    }
  }

  async function bulkDelete() {
    const ok = await confirm({
      title: `Delete ${selectedIds.length} venue${selectedIds.length === 1 ? "" : "s"}?`,
      description: "Venues with spaces inside or events booked are skipped with an error; the rest are deleted.",
      destructive: true,
      confirmLabel: "Delete venues",
    });
    if (!ok) return;
    const outcomes = await Promise.allSettled(selectedIds.map((id) => removeVenue({ id: id as Id<"venues"> })));
    const failed = outcomes.filter((outcome) => outcome.status === "rejected");
    if (outcomes.length - failed.length) notify.success(`Deleted ${outcomes.length - failed.length} venues.`);
    if (failed.length) {
      notify.error(
        `${failed.length} couldn't be deleted: ${getConvexErrorMessage((failed[0] as PromiseRejectedResult).reason)}`,
      );
    }
    setSelectedIds([]);
  }

  function renderRows(nodes: VenueTreeNode[], depth: number): ReactNode[] {
    const rows: ReactNode[] = [];
    for (const node of nodes) {
      const venue = node.item;
      const hasChildren = node.children.length > 0;
      const isExpanded = hasChildren && displayExpandedIds.has(venue._id);
      const descendantCount = hasChildren ? countDescendants(node) : 0;
      rows.push(
        <ListRow
          key={venue._id}
          data-testid={`venue-row-${venue._id}`}
          onOpen={() => setPanel(venue._id)}
          className={editingId === venue._id ? "bg-muted/40" : undefined}
          leading={
            <TreeRowLeading
              depth={depth}
              name={venue.name}
              hasChildren={hasChildren}
              expanded={isExpanded}
              onToggle={() => toggleExpanded(venue._id)}
            >
              <Checkbox
                aria-label={`Select ${venue.name}`}
                checked={selectedIds.includes(venue._id)}
                onCheckedChange={(checked) =>
                  setSelectedIds((prev) =>
                    checked === true ? [...prev, venue._id] : prev.filter((id) => id !== venue._id),
                  )
                }
              />
            </TreeRowLeading>
          }
          actions={
            <RowMenu label={`More for ${venue.name}`}>
              <DropdownMenuItem onSelect={() => setPanel(venue._id)}>Open details</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openNew(venue._id)}>Add a space inside</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => void deleteVenue(venue)}>
                Delete venue
              </DropdownMenuItem>
            </RowMenu>
          }
        >
          <RowText
            eyebrow={`${formatVenueKindLabel(venue.kind as VenueKind)} · ${venue.venueType}`}
            title={venue.name}
            detail={
              [
                venue.nicknames?.length ? venue.nicknames.join(" · ") : null,
                hasChildren && !isExpanded ? `${descendantCount} ${descendantCount === 1 ? "space" : "spaces"} inside` : null,
                depth === 0 ? venue.address?.split("\n")[0] : null,
              ]
                .filter(Boolean)
                .join(" · ") || undefined
            }
          />
          <RowCell className="w-24" hideBelow="md" muted>
            {venue.capacity ? `${venue.capacity} cap.` : "—"}
          </RowCell>
          <RowCell className="w-28" hideBelow="lg" muted>
            {venue.circuits?.length ? `${venue.circuits.length} circuit${venue.circuits.length === 1 ? "" : "s"}` : "No power info"}
          </RowCell>
        </ListRow>,
      );
      if (hasChildren && isExpanded) rows.push(...renderRows(node.children, depth + 1));
    }
    return rows;
  }

  return (
    <div className="space-y-4 pb-24" data-testid="venues-page">
      <PageHeader
        back={{ href: "/dashboard/events", label: "Events" }}
        title="Venues"
        description="Buildings and the spaces inside them. Events pick a venue from here, and spaces inherit their building's address, contacts and files."
        actions={
          <Button type="button" size="sm" onClick={() => openNew()}>
            <PlusIcon />
            New venue
          </Button>
        }
        meta={
          venues ? (
            <MetaItem icon={MapPinIcon}>
              {buildings} top-level · {venues.length - buildings} spaces inside
            </MetaItem>
          ) : null
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name, path, nickname…"
        searchLabel="Search venues"
        filters={filterDefinitions}
        value={filters}
        onChange={setFilters}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" className="font-normal">
              Sort: {sortDir === "asc" ? "A to Z" : "Z to A"}
              <CaretDownIcon className="size-3" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuRadioGroup value={sortDir} onValueChange={(value) => setSortDir(value as typeof sortDir)}>
              <DropdownMenuRadioItem value="asc">A to Z</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="desc">Z to A</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setExpandedIds(collectParentIds(tree))}>Expand all</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setExpandedIds(new Set())}>Collapse all</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </FilterBar>

      {venues === undefined ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <ListSummary testId="venues-summary" order="Buildings A to Z, with the spaces inside each one nested under it.">
            {venues.length} venue{venues.length === 1 ? "" : "s"}
            {narrowed ? ` · ${visibleIds.length} shown` : ""}
          </ListSummary>

          {selectedIds.length ? (
            <div
              className="flex flex-wrap items-center gap-2 border border-status-blue-500/40 bg-status-blue-500/10 px-3 py-2 text-sm"
              data-testid="venues-bulk-bar"
            >
              <span className="mr-auto font-medium">
                {selectedIds.length} venue{selectedIds.length === 1 ? "" : "s"} selected
              </span>
              <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
                Clear selection
              </Button>
              <Button type="button" size="sm" variant="destructive" onClick={() => void bulkDelete()}>
                Delete selected
              </Button>
            </div>
          ) : null}

          {tree.length === 0 ? (
            <EmptyState
              action={
                narrowed ? null : (
                  <Button type="button" size="sm" variant="outline" onClick={() => openNew()}>
                    Add a building
                  </Button>
                )
              }
            >
              {narrowed
                ? "No venues match this search and these filters."
                : "No venues yet. Add a building (e.g. Tresidder), then nest its spaces under it."}
            </EmptyState>
          ) : (
            <div className="border" data-testid="venues-list">
              <div className="flex items-center gap-2 border-b bg-muted/20 py-2 pr-1 pl-3 text-xs font-medium text-muted-foreground">
                <Checkbox
                  aria-label="Select all venues shown"
                  checked={
                    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id))
                      ? true
                      : selectedIds.length
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={(checked) => setSelectedIds(checked === true ? [...visibleIds] : [])}
                />
                <span className="w-6" />
                <span className="flex-1">Venue</span>
                <span className="hidden w-24 text-right md:block">Capacity</span>
                <span className="hidden w-28 text-right lg:block">Power</span>
                <span className="w-8" />
              </div>
              <ul className="divide-y [&>li]:border-0">{renderRows(tree, 0)}</ul>
            </div>
          )}
        </>
      )}

      <DetailSheet
        open={panel !== null && (panel === "new" || editingVenue !== null)}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
        testId="venue-sheet"
      >
        <DetailSheetHeader
          title={editingVenue ? editingVenue.name : "New venue"}
          description={
            editingVenue
              ? editingVenue.path
              : newParentId
                ? `Inside ${venues?.find((venue) => venue._id === newParentId)?.path ?? "its building"}`
                : "A building, or a standalone outdoor space. Add spaces inside it afterwards."
          }
        />
        <VenueEditor
          key={editingId ?? `new-${newParentId}`}
          editingId={editingId}
          initial={editorInitial}
          venues={(venues ?? []).map((venue) => ({
            _id: venue._id,
            name: venue.name,
            path: venue.path,
            parentId: venue.parentId,
            address: venue.address,
            googleMapsUrl: venue.googleMapsUrl,
            contactName: venue.contactName,
            contactEmail: venue.contactEmail,
            contactPhone: venue.contactPhone,
            documentationLinks: venue.documentationLinks,
            files: venue.files,
          }))}
          onCancel={() => setPanel(null)}
          onSaved={() => {
            notify.success(editingVenue ? `Saved ${editingVenue.name}.` : "Venue created.");
            setPanel(null);
          }}
          footerStart={
            editingVenue ? (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => void deleteVenue(editingVenue)}
                >
                  Delete
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => openNew(editingVenue._id)}>
                  Add a space inside
                </Button>
              </div>
            ) : undefined
          }
        />
      </DetailSheet>
    </div>
  );
}
