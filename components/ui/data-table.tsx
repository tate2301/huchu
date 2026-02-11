"use client";

import * as React from "react";
import {
  type ColumnDef,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { DataTableFloatingActions } from "@/components/ui/data-table-floating-actions";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type TableMode,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type QueryChange = {
  mode?: TableMode;
  page?: number;
  pageSize?: number;
};

export type DataTableQueryState = {
  mode: TableMode;
  page: number;
  pageSize: number;
};

type DataTableModeToggle = {
  enabled: boolean;
  defaultMode?: TableMode;
  persistKey?: string;
};

type DataTablePaginationConfig = {
  enabled: boolean;
  server?: boolean;
  total?: number;
  totalPages?: number;
};

type DataTableRowSelectionConfig<TData> = {
  enabled: boolean;
  onSelectionChange?: (rows: TData[]) => void;
  bulkActions?: (context: {
    selectedRows: TData[];
    clearSelection: () => void;
  }) => React.ReactNode;
};

type DataTableFeatures = {
  sorting?: boolean;
  globalFilter?: boolean;
  pagination?: boolean;
};

export type DataTableProps<TData, TValue> = {
  data: TData[];
  columns: ColumnDef<TData, TValue>[];
  className?: string;
  tableClassName?: string;
  tableContainerClassName?: string;
  emptyState?: React.ReactNode;
  noResultsText?: string;
  toolbar?: React.ReactNode;
  stickyHeader?: boolean;
  stickyHeaderOffset?: number;
  maxBodyHeight?: string;
  queryState?: DataTableQueryState;
  onQueryStateChange?: (nextState: QueryChange) => void;
  modeToggle?: DataTableModeToggle;
  pagination?: DataTablePaginationConfig;
  rowSelection?: DataTableRowSelectionConfig<TData>;
  features?: DataTableFeatures;
};

function toPageIndex(page: number) {
  return Math.max(page - 1, 0);
}

function toPage(pageIndex: number) {
  return pageIndex + 1;
}

export function DataTable<TData, TValue>({
  data,
  columns,
  className,
  tableClassName,
  tableContainerClassName,
  emptyState,
  noResultsText = "No records found.",
  toolbar,
  stickyHeader = true,
  stickyHeaderOffset = 0,
  maxBodyHeight,
  queryState,
  onQueryStateChange,
  modeToggle,
  pagination,
  rowSelection,
  features,
}: DataTableProps<TData, TValue>) {
  const sortingEnabled = features?.sorting ?? true;
  const globalFilterEnabled = features?.globalFilter ?? false;
  const paginationEnabled = features?.pagination ?? pagination?.enabled ?? true;

  const [globalFilter, setGlobalFilter] = React.useState("");
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [rowSelectionState, setRowSelectionState] = React.useState<RowSelectionState>({});
  const [internalMode, setInternalMode] = React.useState<TableMode>(
    modeToggle?.defaultMode ?? "paginated",
  );
  const [internalPagination, setInternalPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });

  const mode = queryState?.mode ?? internalMode;
  const page = queryState?.page ?? toPage(internalPagination.pageIndex);
  const pageSize = queryState?.pageSize ?? internalPagination.pageSize;

  React.useEffect(() => {
    if (!modeToggle?.persistKey) return;
    if (typeof window === "undefined") return;

    const savedMode = window.localStorage.getItem(`datatable:${modeToggle.persistKey}:mode`);
    if (savedMode === "all" || savedMode === "paginated") {
      if (!queryState) {
        setInternalMode(savedMode);
      }
      onQueryStateChange?.({ mode: savedMode });
    }
  }, [modeToggle?.persistKey, onQueryStateChange, queryState]);

  const selectedRows = React.useMemo(() => {
    return Object.keys(rowSelectionState)
      .filter((id) => rowSelectionState[id])
      .map((id) => data[Number(id)])
      .filter(Boolean);
  }, [data, rowSelectionState]);

  React.useEffect(() => {
    if (!rowSelection?.enabled) return;
    rowSelection.onSelectionChange?.(selectedRows);
  }, [rowSelection, selectedRows]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting: sortingEnabled ? sorting : [],
      globalFilter: globalFilterEnabled ? globalFilter : undefined,
      rowSelection: rowSelection?.enabled ? rowSelectionState : {},
      pagination: {
        pageIndex: toPageIndex(page),
        pageSize,
      },
    },
    enableSorting: sortingEnabled,
    enableRowSelection: rowSelection?.enabled ?? false,
    manualPagination: pagination?.server ?? false,
    pageCount: pagination?.server ? (pagination.totalPages ?? -1) : undefined,
    onSortingChange: sortingEnabled ? setSorting : undefined,
    onGlobalFilterChange: globalFilterEnabled ? setGlobalFilter : undefined,
    onRowSelectionChange: rowSelection?.enabled ? setRowSelectionState : undefined,
    onPaginationChange: (updater) => {
      const next = typeof updater === "function" ? updater({ pageIndex: toPageIndex(page), pageSize }) : updater;
      onQueryStateChange?.({ page: toPage(next.pageIndex), pageSize: next.pageSize });
      if (!queryState) {
        setInternalPagination(next);
      }
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: sortingEnabled ? getSortedRowModel() : undefined,
    getFilteredRowModel: globalFilterEnabled ? getFilteredRowModel() : undefined,
    getPaginationRowModel: paginationEnabled && !pagination?.server ? getPaginationRowModel() : undefined,
  });

  const showModeToggle = modeToggle?.enabled ?? false;
  const showTopToolbar = showModeToggle || globalFilterEnabled || Boolean(toolbar);

  const setMode = (nextMode: TableMode) => {
    if (!queryState) {
      setInternalMode(nextMode);
    }

    if (modeToggle?.persistKey && typeof window !== "undefined") {
      window.localStorage.setItem(`datatable:${modeToggle.persistKey}:mode`, nextMode);
    }

    onQueryStateChange?.({ mode: nextMode, page: 1 });
  };

  const clearSelection = React.useCallback(() => {
    setRowSelectionState({});
  }, []);

  const renderedRows = table.getRowModel().rows;

  return (
    <div className={cn("space-y-3", className)}>
      {showTopToolbar ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {showModeToggle ? (
              <div className="inline-flex w-fit items-center rounded-md border border-border bg-card p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "paginated" ? "default" : "ghost"}
                  onClick={() => setMode("paginated")}
                >
                  Paginated
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "all" ? "default" : "ghost"}
                  onClick={() => setMode("all")}
                >
                  All
                </Button>
              </div>
            ) : null}

            {globalFilterEnabled ? (
              <Input
                value={globalFilter}
                onChange={(event) => setGlobalFilter(event.target.value)}
                placeholder="Search records"
                className="h-8 w-[240px]"
              />
            ) : null}
          </div>
          {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}
        </div>
      ) : null}

      <div
        className={cn("overflow-auto", tableContainerClassName)}
        style={maxBodyHeight ? { maxHeight: maxBodyHeight } : undefined}
      >
        <Table
          className={tableClassName}
          enablePagination={false}
          stickyHeader={stickyHeader}
          stickyHeaderOffset={stickyHeaderOffset}
        >
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {renderedRows.length > 0 ? (
              renderedRows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() ? "selected" : undefined}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-muted-foreground">
                  {emptyState ?? noResultsText}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {rowSelection?.enabled && selectedRows.length > 0 && rowSelection.bulkActions ? (
        <DataTableFloatingActions>
          {rowSelection.bulkActions({ selectedRows, clearSelection })}
        </DataTableFloatingActions>
      ) : null}
    </div>
  );
}


