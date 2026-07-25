"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/inventory/searchable-select";
import { formatDate } from "@/lib/format";
import { useDebouncedValue } from "@/lib/use-debounced-value";

const MIN_QUERY_CHARS = 2;
const DEBOUNCE_MS = 200;

type EventOption = {
  _id: Id<"events">;
  title: string;
  startAt: number;
  status: string;
  venueName?: string;
  eventType?: string;
  host?: string;
};

function toSelectOption(event: EventOption): SearchableSelectOption {
  return {
    value: event._id,
    label: event.title,
    description: [formatDate(event.startAt), event.venueName].filter(Boolean).join(" · "),
    keywords: [event.venueName, event.status, event.eventType, event.host]
      .filter(Boolean)
      .join(" "),
  };
}

/**
 * Search-on-demand event picker — the events catalog is too large to preload,
 * so this queries `events.searchOptions` as the user types and hydrates the
 * current selection separately. Mirrors `VenuePicker`.
 */
export function EventSelect({
  value,
  onChange,
  placeholder = "Search events…",
  emptyLabel = "Select an event",
}: {
  value: string;
  onChange: (eventId: string) => void;
  placeholder?: string;
  emptyLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, DEBOUNCE_MS);
  const canSearch = debouncedQuery.trim().length >= MIN_QUERY_CHARS;

  const selectedRows = useQuery(
    api.events.getOptionsByIds,
    value ? { ids: [value as Id<"events">] } : "skip",
  );
  const searchRows = useQuery(
    api.events.searchOptions,
    canSearch ? { search: debouncedQuery.trim() } : "skip",
  );

  const selected = selectedRows?.[0] ?? null;

  const options = useMemo(() => {
    const byId = new Map<string, SearchableSelectOption>();
    byId.set("", { value: "", label: emptyLabel });
    if (selected) byId.set(selected._id, toSelectOption(selected as EventOption));
    for (const event of searchRows ?? []) {
      byId.set(event._id, toSelectOption(event as EventOption));
    }
    return [...byId.values()];
  }, [emptyLabel, searchRows, selected]);

  return (
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
      renderOption={(option) => (
        <div className="min-w-0">
          <p className="truncate">{option.label}</p>
          {option.description ? (
            <p className="truncate text-xs text-muted-foreground">{option.description}</p>
          ) : null}
        </div>
      )}
    />
  );
}
