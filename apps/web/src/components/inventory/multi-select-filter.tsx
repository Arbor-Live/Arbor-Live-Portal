"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CaretDownIcon } from "@phosphor-icons/react";
import { filterControlClassName } from "./filter-controls";

export type MultiSelectOption = {
  value: string;
  label: string;
  description?: string;
  keywords?: string;
};

export function MultiSelectFilter({
  label,
  placeholder,
  values,
  onChange,
  options,
  emptyLabel = "All",
  className,
}: {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (values: string[]) => void;
  options: MultiSelectOption[];
  emptyLabel?: string;
  className?: string;
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

  const filtered = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    if (!lowered) return options;
    return options.filter((option) =>
      `${option.label} ${option.description ?? ""} ${option.keywords ?? ""}`.toLowerCase().includes(lowered),
    );
  }, [options, query]);

  const selectedLabels = useMemo(() => {
    const map = new Map(options.map((option) => [option.value, option.label]));
    return values.map((value) => map.get(value) ?? value);
  }, [options, values]);

  function toggleValue(value: string) {
    onChange(values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value]);
  }

  return (
    <div className={cn("space-y-1", className)} ref={rootRef}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          filterControlClassName,
          "flex items-center justify-between text-left",
        )}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="truncate">{values.length ? `${values.length} selected` : emptyLabel}</span>
        <CaretDownIcon className="ml-2 size-4 shrink-0 opacity-50" aria-hidden />
      </button>
      {values.length ? (
        <div className="flex flex-wrap gap-1">
          {selectedLabels.map((entry, index) => (
            <button
              key={`${entry}-${index}`}
              type="button"
              className="rounded border px-2 py-0.5 text-xs hover:bg-muted"
              onClick={() => onChange(values.filter((_, currentIndex) => currentIndex !== index))}
            >
              {entry} ×
            </button>
          ))}
          <button
            type="button"
            className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
            onClick={() => onChange([])}
          >
            Clear
          </button>
        </div>
      ) : null}
      {open && menuPosition
        ? createPortal(
            <div
              ref={menuRef}
              className="z-[200] rounded-none border border-input bg-popover p-2 shadow-md"
              style={{
                position: "fixed",
                top: menuPosition.top,
                left: menuPosition.left,
                width: Math.max(menuPosition.width, 280),
                maxHeight: "min(24rem, calc(100vh - 1rem))",
              }}
            >
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={placeholder}
              />
              <div className="mt-2 max-h-60 space-y-1 overflow-y-auto overscroll-contain">
                {filtered.map((option) => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-start gap-2 rounded px-2 py-1 text-sm hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={values.includes(option.value)}
                      onChange={() => toggleValue(option.value)}
                    />
                    <span className="min-w-0">
                      <span className="block break-words">{option.label}</span>
                      {option.description ? (
                        <span className="block text-xs text-muted-foreground">{option.description}</span>
                      ) : null}
                    </span>
                  </label>
                ))}
                {!filtered.length ? (
                  <p className="px-2 py-1 text-xs text-muted-foreground">No matches.</p>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
