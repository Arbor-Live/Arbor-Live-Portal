"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CaretDownIcon } from "@phosphor-icons/react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fuzzyScoreHaystack } from "@/lib/fuzzy-match";
import { filterControlClassName } from "./filter-controls";

export type SearchableSelectOption = {
  value: string;
  label: string;
  description?: string;
  keywords?: string;
  icon?: string;
  avatarUrl?: string;
};

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
  /** When set, parent owns search (server-backed). Local fuzzy filter is skipped. */
  onQueryChange?: (query: string) => void;
  minQueryLength?: number;
  searchHint?: string;
  searching?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const serverBacked = Boolean(onQueryChange);

  useEffect(() => {
    function onDocumentPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!rootRef.current) return;
      if (rootRef.current.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
      setQuery("");
      onQueryChange?.("");
    }
    document.addEventListener("mousedown", onDocumentPointerDown);
    return () => document.removeEventListener("mousedown", onDocumentPointerDown);
  }, [onQueryChange]);

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  const selected = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );
  const listOptions = useMemo(() => {
    if (serverBacked) {
      if (query.trim().length < minQueryLength) {
        return selected ? [selected] : [];
      }
      return options;
    }
    const lowered = query.trim();
    if (!lowered) return options;
    return options
      .map((option) => ({
        option,
        score: fuzzyScoreHaystack(lowered, [option.label, option.description, option.keywords]),
      }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score || a.option.label.localeCompare(b.option.label))
      .map((row) => row.option);
  }, [minQueryLength, options, query, selected, serverBacked]);

  const normalizedQuery = query.trim().toLowerCase();
  const canCreate =
    Boolean(onCreate) &&
    normalizedQuery.length > 0 &&
    !options.some((option) => option.label.trim().toLowerCase() === normalizedQuery);

  function updateQuery(next: string) {
    setQuery(next);
    onQueryChange?.(next);
  }

  const showSearchHint = serverBacked && query.trim().length < minQueryLength && !searching;
  const showEmpty = !searching && !showSearchHint && listOptions.length === 0;

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        data-testid="searchable-select-trigger"
        className={cn(filterControlClassName, "flex items-center justify-between text-left")}
        onClick={() => setOpen((prev) => !prev)}
      >
        {renderSelected ? (
          renderSelected(selected)
        ) : (
          <span className="block truncate">{selected?.label ?? emptyLabel ?? "Select option"}</span>
        )}
        <CaretDownIcon className="ml-2 size-4 shrink-0 opacity-50" aria-hidden />
      </button>
      {open && menuPosition
        ? createPortal(
            <div
              ref={menuRef}
              className="z-[100] rounded-none border border-input bg-background p-2 shadow-md"
              style={{
                position: "fixed",
                top: menuPosition.top,
                left: menuPosition.left,
                width: Math.max(menuPosition.width, 320),
              }}
            >
              <Input
                value={query}
                onChange={(event) => updateQuery(event.target.value)}
                placeholder={placeholder}
                autoFocus
              />
              <div className="mt-2 max-h-52 overflow-auto">
                {searching ? (
                  <p className="px-2 py-1 text-xs text-muted-foreground">Searching…</p>
                ) : null}
                {showSearchHint ? (
                  <p className="px-2 py-1 text-xs text-muted-foreground">
                    {searchHint ?? `Type at least ${minQueryLength} characters to search`}
                  </p>
                ) : null}
                {!searching && listOptions.length ? (
                  listOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className="block w-full rounded-none px-2 py-1 text-left text-sm break-words hover:bg-muted"
                      onClick={() => {
                        onChange(option.value);
                        setOpen(false);
                        updateQuery("");
                      }}
                    >
                      {renderOption ? (
                        renderOption(option)
                      ) : (
                        <div className="min-w-0">
                          <p className="truncate">{option.label}</p>
                          {option.description ? (
                            <p className="truncate text-xs text-muted-foreground">{option.description}</p>
                          ) : null}
                        </div>
                      )}
                    </button>
                  ))
                ) : null}
                {showEmpty ? (
                  <p className="px-2 py-1 text-xs text-muted-foreground">No matches.</p>
                ) : null}
                {canCreate ? (
                  <button
                    type="button"
                    className="mt-1 block w-full rounded-none border border-input px-2 py-1 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      onCreate?.(query.trim());
                      setOpen(false);
                      updateQuery("");
                    }}
                  >
                    {createLabel ?? "New"}: &quot;{query.trim()}&quot;
                  </button>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
