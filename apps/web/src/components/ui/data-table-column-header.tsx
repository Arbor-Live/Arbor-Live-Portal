"use client";

import { ArrowDownIcon, ArrowUpIcon, ArrowsDownUpIcon } from "@phosphor-icons/react";
import type { Column, RowData } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import { cn } from "@/lib/utils";

interface DataTableColumnHeaderProps<TData extends RowData, TValue>
  extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<DataTableFeatures, TData, TValue>;
  title: string;
}

export function DataTableColumnHeader<TData extends RowData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>;
  }

  const sorted = column.getIsSorted();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("-ml-2.5 h-8 gap-1 px-2.5 font-medium", className)}
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      {title}
      {sorted === "asc" ? (
        <ArrowUpIcon className="size-3.5" />
      ) : sorted === "desc" ? (
        <ArrowDownIcon className="size-3.5" />
      ) : (
        <ArrowsDownUpIcon className="size-3.5 opacity-40" />
      )}
    </Button>
  );
}
