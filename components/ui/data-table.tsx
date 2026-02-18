"use client";

import * as React from "react";
import {
  type ColumnDef,
  type PaginationState,
  type Row,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronDown, ChevronRight } from "@/lib/icons";
import { cn } from "@/lib/utils";

type DataTableMode = "all" | "paginated";

type QueryChange = {
  mode?: DataTableMode;
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
};

export type DataTableQueryState = {
  mode: DataTableMode;
  page: number;
  pageSize: number;
  search?: string;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
};

type DataTableModeToggle = {
  enabled: boolean;
  defaultMode?: DataTableMode;
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

type DataTableSearchBehavior = "submit" | "instant";
type DataTableExpansionMode = "single" | "multiple";

type DataTableExpansionToggleContext<TData> = {
  row: TData;
  rowId: string;
  isExpanded: boolean;
};

type DataTableExpansionRenderContext<TData> = {
  row: TData;
  rowId: string;
  isExpanded: boolean;
  isLoading: boolean;
  error?: string;
  collapse: () => void;
};

type DataTableExpansionConfig<TData> = {
  enabled: boolean;
  mode?: DataTableExpansionMode;
  getRowId?: (row: TData, index: number) => string;
  canExpand?: (row: TData) => boolean;
  renderExpandedContent: (
    context: DataTableExpansionRenderContext<TData>,
  ) => React.ReactNode;
  onToggle?: (context: DataTableExpansionToggleContext<TData>) => void;
  expandedRowIds?: string[];
  defaultExpandedRowIds?: string[];
  onExpandedRowIdsChange?: (ids: string[]) => void;
  loadingRowIds?: string[];
  errorByRowId?: Record<string, string | undefined>;
  expandColumn?: {
    header?: React.ReactNode;
    widthClassName?: string;
  };
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
  tabletScrollable?: boolean;
  tabletStickyFirstColumn?: boolean;
  tabletMinTableWidth?: string;
  maxBodyHeight?: string;
  searchPlaceholder?: string;
  searchBehavior?: DataTableSearchBehavior;
  searchDebounceMs?: number;
  deferFilter?: boolean;
  searchSubmitLabel?: string;
  queryState?: DataTableQueryState;
  onQueryStateChange?: (nextState: QueryChange) => void;
  modeToggle?: DataTableModeToggle;
  pagination?: DataTablePaginationConfig;
  rowSelection?: DataTableRowSelectionConfig<TData>;
  features?: DataTableFeatures;
  expansion?: DataTableExpansionConfig<TData>;
};

function toPageIndex(page: number) {
  return Math.max(page - 1, 0);
}

function toPage(pageIndex: number) {
  return pageIndex + 1;
}

function defaultResolveExpansionRowId<TData>(row: TData, index: number) {
  if (typeof row === "object" && row !== null && "id" in row) {
    const value = (row as { id?: unknown }).id;
    if (typeof value === "string" || typeof value === "number") {
      return String(value);
    }
  }
  return String(index);
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
  tabletScrollable = true,
  tabletStickyFirstColumn = false,
  tabletMinTableWidth = "100%",
  maxBodyHeight,
  searchPlaceholder = "Search records",
  searchBehavior = "submit",
  searchDebounceMs = 300,
  deferFilter = true,
  searchSubmitLabel = "Search",
  queryState,
  onQueryStateChange,
  pagination,
  rowSelection,
  features,
  expansion,
}: DataTableProps<TData, TValue>) {
  const sortingEnabled = features?.sorting ?? true;
  const globalFilterEnabled = features?.globalFilter ?? true;
  const paginationEnabled = features?.pagination ?? pagination?.enabled ?? true;
  const serverPagination = pagination?.server ?? Boolean(onQueryStateChange);

  const [globalFilter, setGlobalFilter] = React.useState(queryState?.search ?? "");
  const [searchDraft, setSearchDraft] = React.useState(queryState?.search ?? "");
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [rowSelectionState, setRowSelectionState] = React.useState<RowSelectionState>({});
  const [internalPagination, setInternalPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });
  const [expandedRowIdsState, setExpandedRowIdsState] = React.useState<string[]>(
    expansion?.defaultExpandedRowIds ?? [],
  );

  const page = queryState?.page ?? toPage(internalPagination.pageIndex);
  const pageSize = queryState?.pageSize ?? internalPagination.pageSize;
  const expansionEnabled = expansion?.enabled ?? false;
  const expansionMode = expansion?.mode ?? "multiple";
  const resolvedExpandedRowIds = expansion?.expandedRowIds ?? expandedRowIdsState;
  const expandedRowIdsSet = React.useMemo(
    () => new Set(resolvedExpandedRowIds),
    [resolvedExpandedRowIds],
  );
  const loadingRowIdsSet = React.useMemo(
    () => new Set(expansion?.loadingRowIds ?? []),
    [expansion?.loadingRowIds],
  );
  const expandColumnWidthClassName = expansion?.expandColumn?.widthClassName ?? "w-10";
  const deferredGlobalFilter = React.useDeferredValue(globalFilter);
  const effectiveGlobalFilter =
    globalFilterEnabled && deferFilter ? deferredGlobalFilter : globalFilter;

  React.useEffect(() => {
    if (queryState?.search !== undefined) {
      setGlobalFilter((prev) => (prev === queryState.search ? prev : queryState.search));
      setSearchDraft((prev) => (prev === queryState.search ? prev : queryState.search));
    }
  }, [queryState?.search]);

  const applySearch = React.useCallback(
    (value: string) => {
      setGlobalFilter((prev) => (prev === value ? prev : value));
      if (queryState?.search !== value) {
        onQueryStateChange?.({ page: 1, search: value });
      }
    },
    [onQueryStateChange, queryState?.search],
  );

  React.useEffect(() => {
    if (!globalFilterEnabled || searchBehavior !== "instant") return;
    const timer = window.setTimeout(() => {
      applySearch(searchDraft);
    }, searchDebounceMs);
    return () => window.clearTimeout(timer);
  }, [
    applySearch,
    globalFilterEnabled,
    searchBehavior,
    searchDebounceMs,
    searchDraft,
  ]);

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
      globalFilter: globalFilterEnabled ? effectiveGlobalFilter : undefined,
      rowSelection: rowSelection?.enabled ? rowSelectionState : {},
      pagination: {
        pageIndex: toPageIndex(page),
        pageSize,
      },
    },
    enableSorting: sortingEnabled,
    enableRowSelection: rowSelection?.enabled ?? false,
    manualPagination: serverPagination,
    pageCount: serverPagination ? (pagination?.totalPages ?? -1) : undefined,
    onSortingChange: sortingEnabled
      ? (updater) => {
          const nextSorting =
            typeof updater === "function" ? updater(sorting) : updater;
          setSorting(nextSorting);
          const firstSort = nextSorting[0];
          onQueryStateChange?.({
            page: 1,
            sortBy: firstSort?.id,
            sortDirection: firstSort?.desc ? "desc" : "asc",
          });
        }
      : undefined,
    onGlobalFilterChange: undefined,
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
    getPaginationRowModel: paginationEnabled && !serverPagination ? getPaginationRowModel() : undefined,
  });

  const showToolbarPagination = paginationEnabled;
  const showTopToolbar =
    globalFilterEnabled || Boolean(toolbar) || showToolbarPagination;

  const totalPages = serverPagination
    ? (pagination?.totalPages ??
      Math.max(1, Math.ceil(Math.max(pagination?.total ?? data.length, 1) / pageSize)))
    : table.getPageCount();

  const setPaginationState = React.useCallback(
    (nextPage: number, nextPageSize: number) => {
      const clampedPage = Math.max(1, Math.min(nextPage, Math.max(totalPages, 1)));
      onQueryStateChange?.({ page: clampedPage, pageSize: nextPageSize });
      if (!queryState) {
        setInternalPagination({
          pageIndex: toPageIndex(clampedPage),
          pageSize: nextPageSize,
        });
      }
    },
    [onQueryStateChange, queryState, totalPages],
  );

  const clearSelection = React.useCallback(() => {
    setRowSelectionState({});
  }, []);

  const updateExpandedRowIds = React.useCallback(
    (nextIds: string[]) => {
      if (!expansion?.expandedRowIds) {
        setExpandedRowIdsState(nextIds);
      }
      expansion?.onExpandedRowIdsChange?.(nextIds);
    },
    [expansion],
  );

  const resolveExpansionRowId = React.useCallback(
    (row: TData, index: number) => {
      if (expansion?.getRowId) {
        return expansion.getRowId(row, index);
      }
      return defaultResolveExpansionRowId(row, index);
    },
    [expansion],
  );

  const getRowExpansionMeta = React.useCallback(
    (row: Row<TData>) => {
      const rowId = resolveExpansionRowId(row.original, row.index);
      const canExpand = expansionEnabled && (expansion?.canExpand?.(row.original) ?? true);
      const isExpanded = canExpand && expandedRowIdsSet.has(rowId);
      return { rowId, canExpand, isExpanded };
    },
    [expansion, expansionEnabled, expandedRowIdsSet, resolveExpansionRowId],
  );

  const toggleRowExpansion = React.useCallback(
    (row: TData, index: number, forceExpanded?: boolean) => {
      if (!expansionEnabled) return;
      if (expansion?.canExpand && !expansion.canExpand(row)) return;
      const rowId = resolveExpansionRowId(row, index);
      const isCurrentlyExpanded = expandedRowIdsSet.has(rowId);
      const willExpand = typeof forceExpanded === "boolean" ? forceExpanded : !isCurrentlyExpanded;

      let nextIds: string[];
      if (willExpand) {
        nextIds = expansionMode === "single" ? [rowId] : [...resolvedExpandedRowIds, rowId];
      } else {
        nextIds = resolvedExpandedRowIds.filter((id) => id !== rowId);
      }

      updateExpandedRowIds(Array.from(new Set(nextIds)));
      expansion?.onToggle?.({ row, rowId, isExpanded: willExpand });
    },
    [
      expansion,
      expansionEnabled,
      expansionMode,
      expandedRowIdsSet,
      resolveExpansionRowId,
      resolvedExpandedRowIds,
      updateExpandedRowIds,
    ],
  );

  const renderedRows = table.getRowModel().rows;
  const visibleColumnCount = table.getVisibleLeafColumns().length;
  const totalColumnCount = visibleColumnCount + (expansionEnabled ? 1 : 0);

  return (
    <div className={cn("space-y-3", className)}>
      {showTopToolbar ? (
        <div className="section-shell flex flex-wrap items-center gap-2 py-1">
          {globalFilterEnabled ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                applySearch(searchDraft);
              }}
            >
              <Input
                value={searchDraft}
                onChange={(event) => {
                  setSearchDraft(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && searchBehavior === "submit") {
                    event.preventDefault();
                    applySearch(searchDraft);
                  }
                }}
                placeholder={searchPlaceholder}
                className="h-8 w-[240px]"
              />
              <Button type="submit" size="sm" className="h-8">
                {searchSubmitLabel}
              </Button>
            </form>
          ) : null}

          {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}

          {showToolbarPagination ? (
            <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>Rows per page</span>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => setPaginationState(1, Number(value))}
              >
                <SelectTrigger size="sm" className="h-8 w-[88px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
              <span>
                Page {Math.max(page, 1)} of {Math.max(totalPages, 1)}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPaginationState(page - 1, pageSize)}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPaginationState(page + 1, pageSize)}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(maxBodyHeight ? "overflow-auto" : undefined, tableContainerClassName)}
        style={maxBodyHeight ? { maxHeight: maxBodyHeight } : undefined}
      >
        <Table
          className={tableClassName}
          enablePagination={false}
          stickyHeader={stickyHeader}
          stickyHeaderOffset={stickyHeaderOffset}
          tabletScrollable={tabletScrollable}
          tabletStickyFirstColumn={tabletStickyFirstColumn}
          tabletMinTableWidth={tabletMinTableWidth}
          edgeToEdge
        >
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {expansionEnabled ? (
                  <TableHead className={cn("pl-2", expandColumnWidthClassName)}>
                    {expansion?.expandColumn?.header ?? null}
                  </TableHead>
                ) : null}
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
              renderedRows.map((row) => {
                const { rowId, canExpand, isExpanded } = getRowExpansionMeta(row);
                const isLoading = loadingRowIdsSet.has(rowId);
                const error = expansion?.errorByRowId?.[rowId];

                return (
                  <React.Fragment key={row.id}>
                    <TableRow data-state={row.getIsSelected() ? "selected" : undefined}>
                      {expansionEnabled ? (
                        <TableCell className={cn("w-10 pl-2 align-top", expandColumnWidthClassName)}>
                          {canExpand ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground"
                              onClick={() => toggleRowExpansion(row.original, row.index)}
                              aria-label={isExpanded ? "Collapse row" : "Expand row"}
                              aria-expanded={isExpanded}
                            >
                              {isExpanded ? (
                                <ChevronDown className="size-4" />
                              ) : (
                                <ChevronRight className="size-4" />
                              )}
                            </Button>
                          ) : null}
                        </TableCell>
                      ) : null}
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                    {expansionEnabled && isExpanded ? (
                      <TableRow data-state={row.getIsSelected() ? "selected" : undefined}>
                        <TableCell colSpan={totalColumnCount} className="bg-transparent py-0">
                          {expansion?.renderExpandedContent({
                            row: row.original,
                            rowId,
                            isExpanded,
                            isLoading,
                            error,
                            collapse: () => toggleRowExpansion(row.original, row.index, false),
                          })}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </React.Fragment>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={totalColumnCount} className="text-center text-muted-foreground">
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


