"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { EMPTY_LEXICAL_STATE } from "@/components/editor/lexical-theme";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { VenueEditor } from "./venue-editor";
import { emptyVenueForm, type VenueFormValues } from "@/lib/validations/venues";

function toFormValues(venue: {
  name: string;
  nicknames?: string[];
  parentId?: Id<"venues">;
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
}): VenueFormValues {
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

export function VenuesManager() {
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<Id<"venues"> | null>(null);
  const [editorInitial, setEditorInitial] = useState<VenueFormValues>(emptyVenueForm());
  const venues = useQuery(api.venues.list, {});
  const removeVenue = useMutation(api.venues.remove);

  const filteredVenues = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = [...(venues ?? [])].filter((venue) => {
      if (!q) return true;
      const nicknames = (venue.nicknames ?? []).join(" ").toLowerCase();
      return (
        venue.name.toLowerCase().includes(q) ||
        venue.path.toLowerCase().includes(q) ||
        nicknames.includes(q) ||
        venue.venueType.toLowerCase().includes(q)
      );
    });
    rows.sort((a, b) =>
      sortDir === "asc" ? a.path.localeCompare(b.path) : b.path.localeCompare(a.path),
    );
    return rows;
  }, [venues, search, sortDir]);

  async function bulkDeleteSelected() {
    try {
      await Promise.all(selectedIds.map((id) => removeVenue({ id: id as Id<"venues"> })));
      setSelectedIds([]);
      if (editingId && selectedIds.includes(editingId)) {
        setEditingId(null);
        setEditorInitial(emptyVenueForm());
      }
    } catch (error) {
      window.alert(getConvexErrorMessage(error, "Could not delete selected venues."));
    }
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
              <option value="asc">Path Asc</option>
              <option value="desc">Path Desc</option>
            </select>
            <Button
              type="button"
              variant="destructive"
              disabled={!selectedIds.length}
              onClick={() => void bulkDeleteSelected()}
            >
              Delete Selected ({selectedIds.length})
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditingId(null);
                setEditorInitial(emptyVenueForm());
              }}
            >
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
                        filteredVenues.length > 0 && selectedIds.length === filteredVenues.length
                      }
                      onChange={(event) =>
                        setSelectedIds(
                          event.target.checked ? filteredVenues.map((venue) => venue._id) : [],
                        )
                      }
                    />
                  </th>
                  <th className="p-2 text-left">Name</th>
                  <th className="p-2 text-left">Path</th>
                  <th className="p-2 text-left">Kind / Type</th>
                  <th className="p-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredVenues.map((venue) => (
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
                      <div>{venue.name}</div>
                      {venue.nicknames?.length ? (
                        <div className="text-xs text-muted-foreground">
                          {venue.nicknames.join(" · ")}
                        </div>
                      ) : null}
                    </td>
                    <td className="p-2">{venue.path}</td>
                    <td className="p-2">
                      {venue.kind} · {venue.venueType}
                    </td>
                    <td className="p-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingId(venue._id);
                          setEditorInitial(toFormValues(venue));
                        }}
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
                {!filteredVenues.length ? (
                  <tr>
                    <td className="p-4 text-muted-foreground" colSpan={5}>
                      No venues yet. Create a building (e.g. Tresidder) then nest spaces under it.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <VenueEditor
        editingId={editingId}
        initial={editorInitial}
        venues={(venues ?? []).map((venue) => ({
          _id: venue._id,
          name: venue.name,
          path: venue.path,
          parentId: venue.parentId,
        }))}
        onCancel={() => {
          setEditingId(null);
          setEditorInitial(emptyVenueForm());
        }}
        onSaved={() => {
          if (!editingId) {
            setEditorInitial(emptyVenueForm());
          }
        }}
      />
    </div>
  );
}
