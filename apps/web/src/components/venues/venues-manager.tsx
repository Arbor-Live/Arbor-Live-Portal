"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { useAppDialog } from "@/components/ui/app-dialog";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { EMPTY_LEXICAL_STATE } from "@/components/editor/lexical-theme";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { VenueEditor } from "./venue-editor";
import {
  emptyVenueForm,
  formatVenueKindLabel,
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

type VenueTreeNode = {
  venue: VenueRow;
  children: VenueTreeNode[];
};

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

function buildVenueTree(venues: VenueRow[], sortDir: "asc" | "desc"): VenueTreeNode[] {
  const byId = new Map<string, VenueTreeNode>();
  for (const venue of venues) {
    byId.set(venue._id, { venue, children: [] });
  }

  const roots: VenueTreeNode[] = [];
  for (const venue of venues) {
    const node = byId.get(venue._id)!;
    const parentId = venue.parentId;
    if (parentId && byId.has(parentId)) {
      byId.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortRecursive = (nodes: VenueTreeNode[]) => {
    nodes.sort((a, b) => compareVenueNames(a.venue, b.venue, sortDir));
    for (const node of nodes) sortRecursive(node.children);
  };
  sortRecursive(roots);
  return roots;
}

/** Keep a node if it matches, or any descendant matches. */
function filterVenueTree(nodes: VenueTreeNode[], q: string): VenueTreeNode[] {
  if (!q) return nodes;
  const filtered: VenueTreeNode[] = [];
  for (const node of nodes) {
    const children = filterVenueTree(node.children, q);
    if (venueMatchesQuery(node.venue, q) || children.length > 0) {
      filtered.push({ venue: node.venue, children });
    }
  }
  return filtered;
}

function collectAncestorIdsToExpand(
  nodes: VenueTreeNode[],
  q: string,
  ancestors: string[] = [],
): Set<string> {
  const expand = new Set<string>();
  if (!q) return expand;
  for (const node of nodes) {
    const childExpand = collectAncestorIdsToExpand(node.children, q, [
      ...ancestors,
      node.venue._id,
    ]);
    for (const id of childExpand) expand.add(id);
    if (venueMatchesQuery(node.venue, q) || childExpand.size > 0) {
      for (const id of ancestors) expand.add(id);
    }
    if (childExpand.size > 0) {
      expand.add(node.venue._id);
    }
  }
  return expand;
}

function flattenVisibleIds(nodes: VenueTreeNode[], expandedIds: Set<string>): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    ids.push(node.venue._id);
    if (node.children.length > 0 && expandedIds.has(node.venue._id)) {
      ids.push(...flattenVisibleIds(node.children, expandedIds));
    }
  }
  return ids;
}

function countDescendants(node: VenueTreeNode): number {
  let n = node.children.length;
  for (const child of node.children) n += countDescendants(child);
  return n;
}

function collectParentIds(nodes: VenueTreeNode[]): Set<string> {
  const ids = new Set<string>();
  const walk = (list: VenueTreeNode[]) => {
    for (const node of list) {
      if (node.children.length > 0) {
        ids.add(node.venue._id);
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return ids;
}

export function VenuesManager() {
  const { alert } = useAppDialog();
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<Id<"venues"> | null>(null);
  /** null = not initialized yet; once set, user/search control expansion. */
  const [expandedIds, setExpandedIds] = useState<Set<string> | null>(null);
  const venues = useQuery(api.venues.list, {});
  const removeVenue = useMutation(api.venues.remove);

  const editorInitial = useMemo(() => {
    if (!editingId) return emptyVenueForm();
    const venue = venues?.find((row) => row._id === editingId);
    return venue ? toFormValues(venue) : emptyVenueForm();
  }, [editingId, venues]);

  const tree = useMemo(() => {
    const q = search.trim().toLowerCase();
    const roots = buildVenueTree((venues ?? []) as VenueRow[], sortDir);
    return filterVenueTree(roots, q);
  }, [venues, search, sortDir]);

  // Default: expand every parent so the tree is obvious on first load.
  const resolvedExpandedIds = useMemo(() => {
    if (expandedIds) return expandedIds;
    return collectParentIds(tree);
  }, [expandedIds, tree]);

  const displayExpandedIds = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return resolvedExpandedIds;
    const next = new Set(resolvedExpandedIds);
    for (const id of collectAncestorIdsToExpand(tree, q)) next.add(id);
    return next;
  }, [resolvedExpandedIds, search, tree]);

  const visibleIds = useMemo(
    () => flattenVisibleIds(tree, displayExpandedIds),
    [tree, displayExpandedIds],
  );

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const base = prev ?? collectParentIds(tree);
      const next = new Set(base);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkDeleteSelected() {
    try {
      await Promise.all(selectedIds.map((id) => removeVenue({ id: id as Id<"venues"> })));
      setSelectedIds([]);
      if (editingId && selectedIds.includes(editingId)) {
        setEditingId(null);
      }
    } catch (error) {
      await alert(getConvexErrorMessage(error, "Could not delete selected venues."));
    }
  }

  function renderRows(nodes: VenueTreeNode[], depth: number): ReactNode[] {
    const rows: ReactNode[] = [];
    for (const node of nodes) {
      const { venue } = node;
      const hasChildren = node.children.length > 0;
      const isExpanded = hasChildren && displayExpandedIds.has(venue._id);
      const descendantCount = hasChildren ? countDescendants(node) : 0;

      rows.push(
        <tr key={venue._id} className="border-t">
          <td className="p-2">
            <input
              type="checkbox"
              checked={selectedIds.includes(venue._id)}
              onChange={(event) =>
                setSelectedIds((prev) =>
                  event.target.checked
                    ? [...prev, venue._id]
                    : prev.filter((id) => id !== venue._id),
                )
              }
            />
          </td>
          <td className="p-2">
            <div
              className="flex items-start gap-1"
              style={{ paddingLeft: `${depth * 1.5}rem` }}
            >
              {hasChildren ? (
                <button
                  type="button"
                  className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={isExpanded ? "Collapse" : "Expand"}
                  aria-expanded={isExpanded}
                  onClick={() => toggleExpanded(venue._id)}
                >
                  {isExpanded ? (
                    <CaretDownIcon className="size-3.5" weight="bold" />
                  ) : (
                    <CaretRightIcon className="size-3.5" weight="bold" />
                  )}
                </button>
              ) : (
                <span
                  className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center text-muted-foreground/50"
                  aria-hidden
                >
                  {depth > 0 ? "·" : null}
                </span>
              )}
              <div
                className={
                  depth > 0
                    ? "min-w-0 border-l-2 border-border/70 pl-2"
                    : "min-w-0"
                }
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className={depth === 0 ? "font-medium" : undefined}>
                    {venue.name}
                  </span>
                  {hasChildren && !isExpanded ? (
                    <span className="text-xs text-muted-foreground">
                      {descendantCount} {descendantCount === 1 ? "space" : "spaces"}
                    </span>
                  ) : null}
                </div>
                {venue.nicknames?.length ? (
                  <div className="text-xs text-muted-foreground">
                    {venue.nicknames.join(" · ")}
                  </div>
                ) : null}
              </div>
            </div>
          </td>
          <td className="p-2">
            {formatVenueKindLabel(venue.kind as VenueKind)} · {venue.venueType}
          </td>
          <td className="p-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditingId(venue._id)}
            >
              Edit
            </Button>
          </td>
        </tr>,
      );

      if (hasChildren && isExpanded) {
        rows.push(...renderRows(node.children, depth + 1));
      }
    }
    return rows;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Venues</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Search name, path, nickname…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={sortDir}
              onChange={(event) => setSortDir(event.target.value as typeof sortDir)}
            >
              <option value="asc">Name Asc</option>
              <option value="desc">Name Desc</option>
            </select>
            <Button
              type="button"
              variant="outline"
              onClick={() => setExpandedIds(collectParentIds(tree))}
            >
              Expand All
            </Button>
            <Button type="button" variant="outline" onClick={() => setExpandedIds(new Set())}>
              Collapse All
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!selectedIds.length}
              onClick={() => void bulkDeleteSelected()}
            >
              Delete Selected ({selectedIds.length})
            </Button>
            <Button type="button" variant="outline" onClick={() => setEditingId(null)}>
              New Venue
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-auto rounded-md border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 text-left">
                    <input
                      type="checkbox"
                      checked={
                        visibleIds.length > 0 &&
                        visibleIds.every((id) => selectedIds.includes(id))
                      }
                      onChange={(event) =>
                        setSelectedIds(event.target.checked ? [...visibleIds] : [])
                      }
                    />
                  </th>
                  <th className="p-2 text-left">Name</th>
                  <th className="p-2 text-left">Kind / Type</th>
                  <th className="p-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tree.length ? (
                  renderRows(tree, 0)
                ) : (
                  <tr>
                    <td className="p-4 text-muted-foreground" colSpan={4}>
                      No venues yet. Create a building (e.g. Tresidder) then nest spaces under it.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <VenueEditor
        key={editingId ?? "new-venue"}
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
        onCancel={() => setEditingId(null)}
        onSaved={(savedId) => {
          if (!savedId) {
            setEditingId(null);
            return;
          }
          setEditingId(savedId);
        }}
      />
    </div>
  );
}
