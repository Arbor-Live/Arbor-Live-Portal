"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { useAppDialog } from "@/components/ui/app-dialog";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Search location/path"
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
                      checked={filteredLocations.length > 0 && selectedIds.length === filteredLocations.length}
                      onChange={(event) =>
                        setSelectedIds(
                          event.target.checked ? filteredLocations.map((location) => location._id) : [],
                        )
                      }
                    />
                  </th>
                  <th className="p-2 text-left">Name</th>
                  <th className="p-2 text-left">Path</th>
                  <th className="p-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLocations.map((location) => (
                  <tr key={location._id} data-testid={`location-row-${location._id}`} className="border-t">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(location._id)}
                        onChange={(event) =>
                          setSelectedIds((prev) =>
                            event.target.checked
                              ? [...prev, location._id]
                              : prev.filter((id) => id !== location._id),
                          )
                        }
                      />
                    </td>
                    <td className="p-2">{location.name}</td>
                    <td className="p-2">{location.path}</td>
                    <td className="p-2">
                      <div className="flex gap-2">
                        <Button
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
                        <Button size="sm" variant="destructive" onClick={() => void removeLocation({ id: location._id })}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
