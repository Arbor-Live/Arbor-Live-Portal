"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { useAppDialog } from "@/components/ui/app-dialog";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ListRow } from "@/components/list-row";
import { EmptyState, ListSummary, RowList, RowText } from "@/components/list-page";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StorageLocationEditor } from "./storage-location-editor";

const defaultForm = { name: "", parentId: "" };

export function StorageLocationsManager() {
  const { alert } = useAppDialog();
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<Id<"storageLocations"> | null>(null);
  const [editorInitial, setEditorInitial] = useState(defaultForm);
  const locations = useQuery(api.storageLocations.list, {});
  const removeLocation = useMutation(api.storageLocations.remove);
  const filteredLocations = useMemo(() => {
    const rows = [...(locations ?? [])].filter(
      (location) =>
        location.name.toLowerCase().includes(search.trim().toLowerCase()) ||
        location.path.toLowerCase().includes(search.trim().toLowerCase()),
    );
    rows.sort((a, b) =>
      sortDir === "asc" ? a.path.localeCompare(b.path) : b.path.localeCompare(a.path),
    );
    return rows;
  }, [locations, search, sortDir]);

  async function bulkDeleteSelected() {
    try {
      await Promise.all(selectedIds.map((id) => removeLocation({ id: id as Id<"storageLocations"> })));
      setSelectedIds([]);
    } catch (error) {
      await alert(getConvexErrorMessage(error, "Could not delete selected locations."));
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Storage Locations</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search location/path"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-56"
            />
            <Select
              value={sortDir}
              onValueChange={(value) => setSortDir(value as typeof sortDir)}
            >
              <SelectTrigger aria-label="Sort by path" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">Path Asc</SelectItem>
                <SelectItem value="desc">Path Desc</SelectItem>
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={
                  filteredLocations.length > 0 &&
                  selectedIds.length === filteredLocations.length
                }
                onCheckedChange={(checked) =>
                  setSelectedIds(
                    checked ? filteredLocations.map((location) => location._id) : [],
                  )
                }
                aria-label="Select all locations"
              />
              Select all
            </label>
            <Button
              type="button"
              variant="destructive"
              disabled={!selectedIds.length}
              onClick={() => void bulkDeleteSelected()}
            >
              Delete Selected ({selectedIds.length})
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <ListSummary testId="storage-locations-summary">
            {filteredLocations.length} location{filteredLocations.length === 1 ? "" : "s"}
            {search.trim() ? ` matching “${search.trim()}”` : ""}
          </ListSummary>
          {filteredLocations.length === 0 ? (
            <EmptyState>
              {search.trim()
                ? "No locations match this search."
                : "No storage locations yet."}
            </EmptyState>
          ) : (
            <RowList joined testId="storage-locations-list">
              {filteredLocations.map((location) => (
                <ListRow
                  key={location._id}
                  data-testid={`location-row-${location._id}`}
                  leading={
                    <Checkbox
                      checked={selectedIds.includes(location._id)}
                      onCheckedChange={(checked) =>
                        setSelectedIds((prev) =>
                          checked
                            ? [...prev, location._id]
                            : prev.filter((id) => id !== location._id),
                        )
                      }
                      aria-label={`Select ${location.name}`}
                    />
                  }
                  onOpen={() =>
                    setSelectedIds((prev) =>
                      prev.includes(location._id)
                        ? prev.filter((id) => id !== location._id)
                        : [...prev, location._id],
                    )
                  }
                  actions={
                    <div className="flex items-center gap-1 pr-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingId(location._id);
                          setEditorInitial({
                            name: location.name,
                            parentId: location.parentId ?? "",
                          });
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => void removeLocation({ id: location._id })}
                      >
                        Delete
                      </Button>
                    </div>
                  }
                >
                  <RowText title={location.name} detail={location.path} />
                </ListRow>
              ))}
            </RowList>
          )}
        </CardContent>
      </Card>

      <StorageLocationEditor
        editingId={editingId}
        initial={editorInitial}
        locations={locations ?? []}
        onCancel={() => {
          setEditingId(null);
          setEditorInitial(defaultForm);
        }}
        onSaved={() => {
          if (!editingId) setEditorInitial(defaultForm);
        }}
      />
    </div>
  );
}
