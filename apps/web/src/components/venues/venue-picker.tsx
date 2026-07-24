"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/inventory/searchable-select";
import { useSessionViewer } from "@/components/session-shell-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getConvexErrorMessage } from "@/lib/convex-error";
import {
  formatVenueKindLabel,
  VENUE_KINDS,
  venueTypesForKind,
  type VenueKind,
} from "@/lib/validations/venues";

const MIN_QUERY_CHARS = 2;
const DEBOUNCE_MS = 200;

type VenuePickerProps = {
  value: string;
  onChange: (venueId: string) => void;
  allowCreate?: boolean;
  emptyLabel?: string;
  placeholder?: string;
};

type VenueOption = {
  _id: Id<"venues">;
  name: string;
  path: string;
  kind: string;
  venueType: string;
  nicknames: string[];
};

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function toSelectOption(venue: VenueOption): SearchableSelectOption {
  return {
    value: venue._id,
    label: venue.name,
    description: [
      venue.path !== venue.name ? venue.path : null,
      `${formatVenueKindLabel(venue.kind as VenueKind)} · ${venue.venueType}`,
      venue.nicknames.length ? venue.nicknames.join(" · ") : null,
    ]
      .filter(Boolean)
      .join(" · "),
    keywords: [venue.path, ...venue.nicknames].join(" "),
  };
}

export function VenuePicker({
  value,
  onChange,
  allowCreate = false,
  emptyLabel = "No venue",
  placeholder = "Type to search venues…",
}: VenuePickerProps) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, DEBOUNCE_MS);
  const canSearch = debouncedQuery.trim().length >= MIN_QUERY_CHARS;

  const selectedRows = useQuery(
    api.venues.getOptionsByIds,
    value ? { ids: [value as Id<"venues">] } : "skip",
  );
  const searchRows = useQuery(
    api.venues.searchOptions,
    canSearch ? { search: debouncedQuery.trim() } : "skip",
  );
  // Parent options only while the create modal is open (admin-only path).
  const [createOpen, setCreateOpen] = useState(false);
  const parentVenues = useQuery(api.venues.listForPicker, createOpen ? { limit: 300 } : "skip");

  const viewer = useSessionViewer();
  const createQuick = useMutation(api.venues.createQuick);
  const [draftName, setDraftName] = useState("");
  const [nicknamesText, setNicknamesText] = useState("");
  const [kind, setKind] = useState<VenueKind>("building");
  const [venueType, setVenueType] = useState(venueTypesForKind("building")[0]!);
  const [parentId, setParentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCreate = allowCreate && (viewer?.isAdmin ?? false);
  const selected = selectedRows?.[0] ?? null;

  const options = useMemo(() => {
    const byId = new Map<string, SearchableSelectOption>();
    byId.set("", { value: "", label: emptyLabel });
    if (selected) byId.set(selected._id, toSelectOption(selected as VenueOption));
    for (const venue of searchRows ?? []) {
      byId.set(venue._id, toSelectOption(venue as VenueOption));
    }
    return [...byId.values()];
  }, [emptyLabel, searchRows, selected]);

  function openCreate(createQuery: string) {
    setDraftName(createQuery);
    setNicknamesText("");
    setKind("building");
    setVenueType(venueTypesForKind("building")[0]!);
    setParentId("");
    setError(null);
    setCreateOpen(true);
  }

  async function submitCreate() {
    setSaving(true);
    setError(null);
    try {
      const nicknames = nicknamesText
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      const id = await createQuick({
        name: draftName.trim(),
        nicknames: nicknames.length ? nicknames : undefined,
        kind,
        venueType,
        parentId: parentId ? (parentId as Id<"venues">) : undefined,
      });
      onChange(id);
      setCreateOpen(false);
    } catch (err) {
      setError(getConvexErrorMessage(err, "Could not create venue."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SearchableSelect
        value={value}
        onChange={onChange}
        options={options}
        placeholder={placeholder}
        emptyLabel={emptyLabel}
        onQueryChange={setQuery}
        minQueryLength={MIN_QUERY_CHARS}
        searchHint={`Type at least ${MIN_QUERY_CHARS} characters to search`}
        searching={canSearch && searchRows === undefined}
        onCreate={canCreate ? openCreate : undefined}
        createLabel="Create venue"
        renderOption={(option) => (
          <div className="min-w-0">
            <p className="truncate">{option.label}</p>
            {option.description ? (
              <p className="truncate text-xs text-muted-foreground">{option.description}</p>
            ) : null}
          </div>
        )}
      />

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md space-y-3 rounded-md border bg-background p-4 shadow-lg">
            <h3 className="text-base font-semibold">Create venue</h3>
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Nicknames (comma-separated)</Label>
              <Input
                value={nicknamesText}
                onChange={(e) => setNicknamesText(e.target.value)}
                placeholder="Llaga, Yaga"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Kind</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={kind}
                  onChange={(e) => {
                    const next = e.target.value as VenueKind;
                    setKind(next);
                    setVenueType(venueTypesForKind(next)[0]!);
                  }}
                >
                  {VENUE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {formatVenueKindLabel(k)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Type</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={venueType}
                  onChange={(e) => setVenueType(e.target.value)}
                >
                  {venueTypesForKind(kind).map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Parent (optional)</Label>
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="">No parent (top-level)</option>
                {(parentVenues ?? []).map((venue) => (
                  <option key={venue._id} value={venue._id}>
                    {venue.path}
                  </option>
                ))}
              </select>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={saving || !draftName.trim()}
                onClick={() => void submitCreate()}
              >
                {saving ? "Creating…" : "Create & select"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
