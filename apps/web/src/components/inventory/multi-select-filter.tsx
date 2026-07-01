"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    function onDocumentPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocumentPointerDown);
    return () => document.removeEventListener("mousedown", onDocumentPointerDown);
  }, []);

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
    <div className={cn("relative space-y-1", className)} ref={rootRef}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <button
        type="button"
        className="h-9 w-full rounded-md border bg-background px-3 text-left text-sm"
        onClick={() => setOpen((prev) => !prev)}
      >
        {values.length ? `${values.length} selected` : emptyLabel}
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
      {open ? (
        <div className="absolute z-40 mt-1 w-full min-w-[18rem] rounded-md border bg-popover p-2 shadow-md">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
          />
          <div className="mt-2 max-h-52 space-y-1 overflow-auto">
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
        </div>
      ) : null}
    </div>
  );
}
