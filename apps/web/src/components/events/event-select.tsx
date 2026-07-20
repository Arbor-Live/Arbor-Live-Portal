"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { SearchableSelect, type SearchableSelectOption } from "@/components/inventory/searchable-select";

/**
 * Searchable event picker — wraps `SearchableSelect`.
 * Use this (or SearchableSelect directly with event options) instead of native `<select>`.
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
  const events = useQuery(api.events.list, {});

  const options = useMemo((): SearchableSelectOption[] => {
    return (events ?? [])
      .slice()
      .sort((a, b) => b.startAt - a.startAt)
      .map((event) => ({
        value: event._id as string,
        label: event.title,
        description: [new Date(event.startAt).toLocaleDateString(), event.venueName]
          .filter(Boolean)
          .join(" · "),
        keywords: [event.venueName, event.status, event.eventType].filter(Boolean).join(" "),
      }));
  }, [events]);

  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      emptyLabel={emptyLabel}
    />
  );
}
