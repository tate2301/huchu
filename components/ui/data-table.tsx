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
  enabled?: boolean;
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
type DataTableSearchScope = "client" | "server" | "auto";
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
  edgeToEdge?: boolean;
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
  searchScope?: DataTableSearchScope;
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

type SelectionCheckboxProps = Omit<React.ComponentProps<"input">, "type"> & {
  indeterminate?: boolean;
};

function SelectionCheckbox({
  indeterminate = false,
  className,
  ...props
}: SelectionCheckboxProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={inputRef}
      type="checkbox"
      className={cn(
        "h-4 w-4 rounded border-[var(--table-divider)] accent-[var(--action-primary-bg)]",
        className,
      )}
      {...props}
    />
  );
}

function getColumnWidthStyle<TData, TValue>(
  columnDef: ColumnDef<TData, TValue>,
): React.CSSProperties | undefined {
  const sizing = columnDef as { size?: number; minSize?: number; maxSize?: number };
  const hasWidth = typeof sizing.size === "number";
  const hasMin = typeof sizing.minSize === "number";
  const hasMax = typeof sizing.maxSize === "number";
  if (!hasWidth && !hasMin && !hasMax) return undefined;

  return {
    width: hasWidth ? `${sizing.size}px` : undefined,
    minWidth: hasMin ? `${sizing.minSize}px` : undefined,
    maxWidth: hasMax ? `${sizing.maxSize}px` : undefined,
  };
}

export function DataTable<TData, TValue>({
  data,
  columns,
  className,
  tableClassName,
  tableContainerClassName,
  edgeToEdge = true,
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
  searchScope = "auto",
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
  const rowSelectionEnabled = true;
  const paginationEnabled = features?.pagination ?? pagination?.enabled ?? true;
  const serverPagination = pagination?.server ?? false;
  const resolvedSearchScope: Exclude<DataTableSearchScope, "auto"> =
    searchScope === "auto" ? (serverPagination ? "server" : "client") : searchScope;
  const useClientGlobalFilter = globalFilterEnabled && resolvedSearchScope === "client";

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
    useClientGlobalFilter && deferFilter ? deferredGlobalFilter : globalFilter;

  const getSearchText = React.useCallback((value: unknown): string => {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value.toLowerCase();
    if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      typeof value === "bigint"
    ) {
      return String(value).toLowerCase();
    }
    if (value instanceof Date) return value.toISOString().toLowerCase();
    if (Array.isArray(value)) {
      return value.map((item) => getSearchText(item)).join(" ");
    }
    if (typeof value === "object") {
      return Object.values(value as Record<string, unknown>)
        .map((item) => getSearchText(item))
        .join(" ");
    }
    return "";
  }, []);

  React.useEffect(() => {
    const nextSearch = queryState?.search;
    if (nextSearch !== undefined) {
      setGlobalFilter((prev) => (prev === nextSearch ? prev : nextSearch));
      setSearchDraft((prev) => (prev === nextSearch ? prev : nextSearch));
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

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting: sortingEnabled ? sorting : [],
      globalFilter: useClientGlobalFilter ? effectiveGlobalFilter : undefined,
      rowSelection: rowSelectionState,
      pagination: {
        pageIndex: toPageIndex(page),
        pageSize,
      },
    },
    enableSorting: sortingEnabled,
    enableRowSelection: rowSelectionEnabled,
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
    globalFilterFn: useClientGlobalFilter
      ? (row, _columnId, filterValue) => {
          const query =
            typeof filterValue === "string"
              ? filterValue.trim().toLowerCase()
              : "";
          if (!query) return true;
          return getSearchText(row.original).includes(query);
        }
      : undefined,
    onRowSelectionChange: setRowSelectionState,
    onPaginationChange: (updater) => {
      const next = typeof updater === "function" ? updater({ pageIndex: toPageIndex(page), pageSize }) : updater;
      onQueryStateChange?.({ page: toPage(next.pageIndex), pageSize: next.pageSize });
      if (!queryState) {
        setInternalPagination(next);
      }
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: sortingEnabled ? getSortedRowModel() : undefined,
    getFilteredRowModel: useClientGlobalFilter ? getFilteredRowModel() : undefined,
    getPaginationRowModel: paginationEnabled && !serverPagination ? getPaginationRowModel() : undefined,
  });

  const selectedRows = React.useMemo(
    () => table.getSelectedRowModel().rows.map((row) => row.original),
    [table],
  );

  React.useEffect(() => {
    rowSelection?.onSelectionChange?.(selectedRows);
  }, [rowSelection, selectedRows]);

  const showToolbarPagination = paginationEnabled;
  const showTopToolbar = globalFilterEnabled || Boolean(toolbar);
  const showBottomPagination = showToolbarPagination;

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
  const totalColumnCount =
    visibleColumnCount + (expansionEnabled ? 1 : 0) + (rowSelectionEnabled ? 1 : 0);

  return (
    <div className={cn("space-y-0", className)}>
      {showTopToolbar ? (
        <div
          className={cn(
            "flex flex-wrap items-center gap-2 bg-[var(--datatable-toolbar-bg)] px-[var(--content-gutter-x)] py-1.5",
            edgeToEdge && "table-edge-to-edge",
          )}
        >
          {globalFilterEnabled ? (
            <form
              className="flex w-full flex-wrap items-center gap-2 p-0 sm:w-auto sm:flex-nowrap"
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
                className="h-[var(--control-height-sm)] min-w-0 flex-1 bg-[var(--surface-elevated)] sm:w-[260px] sm:flex-none"
              />
              <Button type="submit" size="sm" className="min-w-[78px]">
                {searchSubmitLabel}
              </Button>
            </form>
          ) : null}

          {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}

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
          edgeToEdge={edgeToEdge}
        >
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {rowSelectionEnabled ? (
                  <TableHead className="w-11 px-2" style={{ width: 44, minWidth: 44, maxWidth: 44 }}>
                    <SelectionCheckbox
                      checked={table.getIsAllRowsSelected()}
                      indeterminate={table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()}
                      onChange={table.getToggleAllRowsSelectedHandler()}
                      aria-label="Select all rows"
                    />
                  </TableHead>
                ) : null}
                {expansionEnabled ? (
                  <TableHead className={cn("pl-2", expandColumnWidthClassName)}>
                    {expansion?.expandColumn?.header ?? null}
                  </TableHead>
                ) : null}
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={getColumnWidthStyle(header.column.columnDef)}
                  >
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
                      {rowSelectionEnabled ? (
                        <TableCell
                          className="w-11 px-2 align-top"
                          style={{ width: 44, minWidth: 44, maxWidth: 44 }}
                        >
                          <SelectionCheckbox
                            checked={row.getIsSelected()}
                            onChange={row.getToggleSelectedHandler()}
                            disabled={!row.getCanSelect()}
                            aria-label={`Select row ${row.index + 1}`}
                          />
                        </TableCell>
                      ) : null}
                      {expansionEnabled ? (
                        <TableCell className={cn("w-10 pl-2 align-top", expandColumnWidthClassName)}>
                          {canExpand ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground shadow-none hover:bg-[var(--button-ghost-hover-bg)]"
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
                        <TableCell
                          key={cell.id}
                          style={getColumnWidthStyle(cell.column.columnDef)}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                    {expansionEnabled && isExpanded ? (
                      <TableRow data-state={row.getIsSelected() ? "selected" : undefined}>
                        <TableCell colSpan={totalColumnCount} className="bg-[var(--datatable-expanded-bg)] py-0">
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
                <TableCell colSpan={totalColumnCount} className="bg-[var(--datatable-empty-bg)] py-9 text-center text-muted-foreground">
                  {emptyState ?? noResultsText}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {showBottomPagination ? (
        <div
          className={cn(
            "flex flex-wrap items-center justify-end gap-2 bg-[var(--datatable-toolbar-bg)] px-[var(--content-gutter-x)] py-1 text-xs text-muted-foreground",
            edgeToEdge && "table-edge-to-edge",
          )}
        >
          <span>Rows per page</span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => setPaginationState(1, Number(value))}
          >
            <SelectTrigger size="sm" className="w-[86px] bg-[var(--surface-base)]">
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

      {rowSelectionEnabled && selectedRows.length > 0 && rowSelection?.bulkActions ? (
        <DataTableFloatingActions>
          {rowSelection.bulkActions({ selectedRows, clearSelection })}
        </DataTableFloatingActions>
      ) : null}
    </div>
  );
}


