"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { fuzzyScoreHaystack } from "@/lib/fuzzy-match";
import { filterControlClassName } from "./filter-controls";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@/components/ui/combobox";

export type SearchableSelectOption = {
  value: string;
  label: string;
  description?: string;
  keywords?: string;
  icon?: string;
  avatarUrl?: string;
};

function optionKey(option: SearchableSelectOption) {
  return option.value === "" ? "__empty__" : option.value;
}

function matchesQuery(option: SearchableSelectOption, query: string) {
  return fuzzyScoreHaystack(query, [option.label, option.description, option.keywords]) > 0;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  emptyLabel,
  onCreate,
  createLabel,
  renderOption,
  renderSelected,
  onQueryChange,
  minQueryLength = 0,
  searchHint,
  searching = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder: string;
  emptyLabel?: string;
  onCreate?: (query: string) => void;
  createLabel?: string;
  renderOption?: (option: SearchableSelectOption) => React.ReactNode;
  renderSelected?: (option: SearchableSelectOption | undefined) => React.ReactNode;
  /** When set, parent owns search (server-backed). Local filter is skipped. */
  onQueryChange?: (query: string) => void;
  minQueryLength?: number;
  searchHint?: string;
  searching?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const serverBacked = Boolean(onQueryChange);

  const selected = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );

  const listOptions = useMemo(() => {
    if (!serverBacked) return options;
    if (query.trim().length < minQueryLength) {
      return selected ? [selected] : [];
    }
    return options;
  }, [minQueryLength, options, query, selected, serverBacked]);

  const normalizedQuery = query.trim().toLowerCase();
  const canCreate =
    Boolean(onCreate) &&
    normalizedQuery.length > 0 &&
    !options.some((option) => option.label.trim().toLowerCase() === normalizedQuery);

  const showSearchHint = serverBacked && query.trim().length < minQueryLength && !searching;
  const emptyMessage = searching
    ? "Searching…"
    : showSearchHint
      ? (searchHint ?? `Type at least ${minQueryLength} characters to search`)
      : "No matches.";

  function updateQuery(next: string) {
    setQuery(next);
    onQueryChange?.(next);
  }

  function closeAndReset() {
    setOpen(false);
    setQuery("");
    onQueryChange?.("");
  }

  return (
    <Combobox
      autoHighlight
      items={listOptions}
      value={selected ?? null}
      onValueChange={(next) => {
        if (next == null) return;
        onChange(next.value);
      }}
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) return;
        setQuery("");
        onQueryChange?.("");
      }}
      inputValue={query}
      onInputValueChange={updateQuery}
      isItemEqualToValue={(a, b) => a.value === b.value}
      itemToStringLabel={(item) => item.label}
      filter={serverBacked ? null : matchesQuery}
    >
      <ComboboxTrigger
        aria-label={emptyLabel ?? placeholder}
        data-testid="searchable-select-trigger"
        className={cn(
          filterControlClassName,
          "flex w-full min-w-0 items-center justify-between gap-2 text-left",
        )}
      >
        <ComboboxValue>
          {(selectedValue: SearchableSelectOption | null) => {
            const option = selectedValue ?? undefined;
            if (renderSelected) return renderSelected(option);
            return (
              <span className="block min-w-0 flex-1 truncate">
                {option?.label ?? emptyLabel ?? "Select option"}
              </span>
            );
          }}
        </ComboboxValue>
      </ComboboxTrigger>
      <ComboboxContent
        data-testid="searchable-select-menu"
        className="min-w-[min(100%,20rem)]"
      >
        <ComboboxInput showTrigger={false} placeholder={placeholder} />
        {searching ? (
          <p className="px-2 py-1 text-xs text-muted-foreground">Searching…</p>
        ) : null}
        <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
        <ComboboxList>
          {(item: SearchableSelectOption) => (
            <ComboboxItem key={optionKey(item)} value={item}>
              {renderOption ? (
                renderOption(item)
              ) : (
                <div className="min-w-0">
                  <p className="truncate">{item.label}</p>
                  {item.description ? (
                    <p className="truncate text-xs text-muted-foreground">{item.description}</p>
                  ) : null}
                </div>
              )}
            </ComboboxItem>
          )}
        </ComboboxList>
        {canCreate ? (
          <button
            type="button"
            className="m-1 mt-0 block w-[calc(100%-0.5rem)] rounded-none border border-input px-2 py-1 text-left text-sm hover:bg-muted"
            onClick={() => {
              const name = query.trim();
              closeAndReset();
              onCreate?.(name);
            }}
          >
            {createLabel ?? "New"}: &quot;{query.trim()}&quot;
          </button>
        ) : null}
      </ComboboxContent>
    </Combobox>
  );
}
