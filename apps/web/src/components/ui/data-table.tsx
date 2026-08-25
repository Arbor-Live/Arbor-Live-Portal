"use client";

import * as React from "react";
import {
  useTable,
  type ColumnDef,
  type ColumnVisibilityState,
  type OnChangeFn,
  type Row,
  type RowData,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { CaretDownIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { dataTableFeatures, type DataTableFeatures } from "@/components/ui/data-table-features";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface DataTableProps<TData extends RowData> {
  columns: ColumnDef<DataTableFeatures, TData>[];
  data: TData[];
  getRowId?: (originalRow: TData, index: number) => string;
  initialSorting?: SortingState;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  enableColumnVisibility?: boolean;
  enableRowSelection?: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  emptyMessage?: string;
  className?: string;
  tableClassName?: string;
  headerClassName?: string;
  /** Extra toolbar controls rendered to the left of the Columns menu. */
  toolbar?: React.ReactNode;
  getRowClassName?: (row: Row<DataTableFeatures, TData>) => string | undefined;
  getRowProps?: (row: {
    id: string;
    original: TData;
  }) => Record<string, unknown>;
  /**
   * When set, replaces default cell rendering for each data row.
   * Use for complex rows (e.g. expandable user admin) that still want sorted order.
   */
  renderRow?: (row: {
    id: string;
    original: TData;
  }) => React.ReactNode;
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  getRowId,
  initialSorting = [],
  sorting: controlledSorting,
  onSortingChange: controlledOnSortingChange,
  enableColumnVisibility = false,
  enableRowSelection = false,
  rowSelection: controlledRowSelection,
  onRowSelectionChange: controlledOnRowSelectionChange,
  emptyMessage = "No results.",
  className,
  tableClassName,
  headerClassName,
  toolbar,
  getRowClassName,
  getRowProps,
  renderRow,
}: DataTableProps<TData>) {
  const [uncontrolledSorting, setUncontrolledSorting] =
    React.useState<SortingState>(initialSorting);
  const [columnVisibility, setColumnVisibility] = React.useState<ColumnVisibilityState>({});
  const [uncontrolledRowSelection, setUncontrolledRowSelection] =
    React.useState<RowSelectionState>({});

  const sorting = controlledSorting ?? uncontrolledSorting;
  const onSortingChange = controlledOnSortingChange ?? setUncontrolledSorting;
  const rowSelection = controlledRowSelection ?? uncontrolledRowSelection;
  const onRowSelectionChange = controlledOnRowSelectionChange ?? setUncontrolledRowSelection;

  const table = useTable({
    features: dataTableFeatures,
    data,
    columns,
    getRowId,
    enableRowSelection,
    onSortingChange,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange,
    state: {
      sorting,
      columnVisibility,
      ...(enableRowSelection || controlledRowSelection !== undefined
        ? { rowSelection }
        : {}),
    },
  });

  const rows = table.getRowModel().rows;
  const showToolbar = Boolean(toolbar) || enableColumnVisibility;

  return (
    <div className={cn("space-y-3", className)}>
      {showToolbar ? (
        <div className="flex flex-wrap items-center gap-2">
          {toolbar}
          {enableColumnVisibility ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="ml-auto gap-1.5">
                  Columns
                  <CaretDownIcon className="size-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {table
                  .getAllColumns()
                  .filter((column) => column.getCanHide())
                  .map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) => column.toggleVisibility(!!value)}
                    >
                      {column.id}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-md border">
        <Table className={cn("text-sm", tableClassName)}>
          <TableHeader className={cn("bg-muted/50", headerClassName)}>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length ? (
              renderRow ? (
                rows.map((row) => <React.Fragment key={row.id}>{renderRow(row)}</React.Fragment>)
              ) : (
                rows.map((row) => {
                  const extraProps = getRowProps?.(row) ?? {};
                  return (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() ? "selected" : undefined}
                      className={cn("align-top", getRowClassName?.(row))}
                      {...(extraProps as React.ComponentProps<typeof TableRow>)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className="whitespace-normal">
                          <table.FlexRender cell={cell} />
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })
              )
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export type { RowSelectionState, SortingState };
