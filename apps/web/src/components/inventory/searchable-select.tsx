"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Input } from "@/components/ui/input";

type Option = {
  value: string;
  label: string;
};

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  emptyLabel,
  onCreate,
  createLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder: string;
  emptyLabel?: string;
  onCreate?: (query: string) => void;
  createLabel?: string;
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
    return options.filter((option) => option.label.toLowerCase().includes(lowered));
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
        className="h-9 w-full rounded-md border bg-background px-3 text-left text-sm"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="block truncate">
          {selected?.label ?? emptyLabel ?? "Select option"}
        </span>
      </button>
      {open && menuPosition
        ? createPortal(
            <div
              ref={menuRef}
              className="z-[100] rounded-md border bg-popover p-2 shadow-md"
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
                      className="block w-full rounded px-2 py-1 text-left text-sm break-words hover:bg-muted"
                      onClick={() => {
                        onChange(option.value);
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      {option.label}
                    </button>
                  ))
                ) : (
                  <p className="px-2 py-1 text-xs text-muted-foreground">No matches.</p>
                )}
                {canCreate ? (
                  <button
                    type="button"
                    className="mt-1 block w-full rounded border px-2 py-1 text-left text-sm hover:bg-muted"
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
