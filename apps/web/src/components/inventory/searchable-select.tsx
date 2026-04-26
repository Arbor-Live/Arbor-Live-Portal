"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Input } from "@/components/ui/input";

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

  useEffect(() => {
    function onDocumentPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!rootRef.current) return;
      if (rootRef.current.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
      setQuery("");
    }
    document.addEventListener("mousedown", onDocumentPointerDown);
    return () => document.removeEventListener("mousedown", onDocumentPointerDown);
  }, []);

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
  const filtered = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    if (!lowered) return options;
    return options.filter((option) =>
      `${option.label} ${option.description ?? ""} ${option.keywords ?? ""}`.toLowerCase().includes(lowered),
    );
  }, [options, query]);
  const normalizedQuery = query.trim().toLowerCase();
  const canCreate =
    Boolean(onCreate) &&
    normalizedQuery.length > 0 &&
    !options.some((option) => option.label.trim().toLowerCase() === normalizedQuery);

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="h-9 w-full min-w-0 rounded-none border border-input bg-transparent px-3 py-2 text-left text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"
        onClick={() => setOpen((prev) => !prev)}
      >
        {renderSelected ? (
          renderSelected(selected)
        ) : (
          <span className="block truncate">{selected?.label ?? emptyLabel ?? "Select option"}</span>
        )}
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
                onChange={(event) => setQuery(event.target.value)}
                placeholder={placeholder}
              />
              <div className="mt-2 max-h-52 overflow-auto">
                {filtered.length ? (
                  filtered.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className="block w-full rounded-none px-2 py-1 text-left text-sm break-words hover:bg-muted"
                      onClick={() => {
                        onChange(option.value);
                        setOpen(false);
                        setQuery("");
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
                ) : (
                  <p className="px-2 py-1 text-xs text-muted-foreground">No matches.</p>
                )}
                {canCreate ? (
                  <button
                    type="button"
                    className="mt-1 block w-full rounded-none border border-input px-2 py-1 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      onCreate?.(query.trim());
                      setOpen(false);
                      setQuery("");
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
