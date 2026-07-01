"use client";

import type { ReactNode } from "react";
import { CaretDownIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export const filterControlClassName =
  "h-9 w-full min-w-0 rounded-none border border-input bg-transparent px-3 py-2 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";

export function FilterField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

export function FilterNativeSelect({
  label,
  value,
  onChange,
  children,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <FilterField label={label} className={className}>
      <div className="relative">
        <select
          className={cn(filterControlClassName, "appearance-none pr-9")}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {children}
        </select>
        <CaretDownIcon
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 opacity-50"
          aria-hidden
        />
      </div>
    </FilterField>
  );
}
