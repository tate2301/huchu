"use client";

import * as React from "react";
import {
  type ColumnDef,
  type ColumnDefBase,
  type VisibilityState,
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

import { Button } from "./button";
import { DataTableFloatingActions } from "./data-table-floating-actions";
import { ExportMenu } from "./export-menu";
import { Input } from "./input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";
import {
  inferTableSourceKey,
  useTableExporter,
  type TableExportFormat,
} from "../lib/table-export";
import { ChevronDown, ChevronRight, Search } from "../lib/icons";
import { cn } from "../lib/utils";

/**
 * DataTable — TanStack's table engine wearing the design system's `.dtable`.
 *
 * The DS ships its own `DataTable`, but it is fully controlled, does not sort,
 * and takes a column shape incompatible with `ColumnDef`. 103 files import this
 * one and 121 author `ColumnDef` columns against it, so the engine, the props
 * and `columnDef.meta` (whose `exportValue` the export path reads) are all
 * untouched — only the chrome moved onto DS class names.
 *
 * Load-bearing conventions kept as they were:
 *   - a column whose id is `actions`/`action`, or whose header string is
 *     "Actions", is excluded from the export payload and the column-toggle
 *     menu (`isActionColumnDefinition`). Its cell now also gets `.action`.
 *   - the header is a real `<th>` again: the sort caret is
 *     `.dtable thead th.sortable::after`, so the cell itself carries the click,
 *     the Enter/Space handler and `aria-sort` rather than a nested button.
 */

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

type DataTableExportConfig = {
  enabled?: boolean;
  sourceKey?: string;
  title?: string;
  subtitle?: string;
  fileName?: string;
  filters?: Record<string, string>;
  formats?: TableExportFormat[];
  includeTotals?: boolean;
  mode?: "SYNC" | "ASYNC";
  templateId?: string;
  templateVersionId?: string;
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
  exportConfig?: DataTableExportConfig;
  mobileCardRenderer?: (context: { row: TData; rowIndex: number }) => React.ReactNode;
  mobileListRenderer?: (context: {
    rows: Array<{ row: TData; rowIndex: number }>;
  }) => React.ReactNode;
  mobileCardListClassName?: string;
  /**
   * Break the body into labelled runs — students by class, staff by
   * department. Return the same `key` for rows that belong together and a
   * header row is drawn wherever the key changes.
   *
   * It groups what is already adjacent; it does not reorder. The query has to
   * sort by the same thing, or one class appears under several headings.
   * Returning `null` leaves a row ungrouped, which is what a student with no
   * class should do.
   */
  rowGroup?: (row: TData) => { key: string; label: React.ReactNode } | null;
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
  const sizing = columnDef as {
    size?: number;
    minSize?: number;
    maxSize?: number;
  };
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

function normalizeExportCellValue(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeExportCellValue(item)).join(", ");
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function deriveHeaderLabel(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
}

function isActionColumnHeader(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return value.trim().toLowerCase() === "actions";
}

function isActionColumnDefinition<TData, TValue>(
  columnDef: ColumnDef<TData, TValue>,
  id: string,
): boolean {
  const normalizedId = id.trim().toLowerCase();
  if (normalizedId === "actions" || normalizedId === "action") return true;
  return isActionColumnHeader((columnDef as { header?: unknown }).header);
}

/**
 * `.num` right-aligns a column and sets tabular figures. Nothing in the repo
 * declares alignment on the column — call sites reach for a `text-right` inside
 * their own `cell` renderer — so this is an opt-in read off `columnDef.meta`
 * rather than a guess. `meta` is forwarded to TanStack untouched either way.
 */
type ColumnLayoutMeta = {
  align?: "left" | "center" | "right";
  numeric?: boolean;
};

function isNumericColumnDefinition<TData, TValue>(
  columnDef: ColumnDef<TData, TValue>,
): boolean {
  const meta = (columnDef as { meta?: ColumnLayoutMeta }).meta;
  return meta?.numeric === true || meta?.align === "right";
}

function getNestedValue(source: unknown, path: string): unknown {
  if (!path.trim()) return undefined;
  const segments = path.split(".").filter(Boolean);
  let current: unknown = source;

  for (const segment of segments) {
    if (!current || typeof current !== "object") return undefined;
    const next = (current as Record<string, unknown>)[segment];
    current = next;
  }

  return current;
}

type ExportMeta<TData> = {
  exportValue?: (row: TData) => unknown;
};

function toTitleCase(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeDocumentTitle(value: string | null | undefined) {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  const pipeParts = normalized
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  if (pipeParts.length > 1) {
    const candidate = pipeParts[0];
    if (candidate) return candidate;
  }

  const dashParts = normalized
    .split(" - ")
    .map((part) => part.trim())
    .filter(Boolean);
  if (dashParts.length > 1) {
    const candidate = dashParts[0];
    if (candidate) return candidate;
  }

  return normalized;
}

function inferTitleFromPath(pathname: string | null | undefined) {
  const segments = (pathname ?? "/")
    .split("/")
    .filter(Boolean)
    .filter((segment) => !/^[0-9a-f-]{8,}$/i.test(segment));

  if (segments.length === 0) return "Table Export";

  const title = segments
    .slice(-2)
    .map((segment) => toTitleCase(segment))
    .join(" / ");

  return title || "Table Export";
}

function isLikelyIdentifierColumn(label: string) {
  return /\b(id|code|ref|reference)\b/i.test(label);
}

function isLikelyDateColumn(label: string) {
  return /\b(date|time|timestamp|created|updated)\b/i.test(label);
}

function isLikelyMoneyColumn(label: string) {
  return /\b(amount|value|price|cost|balance|total|net|gross|usd|eur|zar|zwl)\b/i.test(
    label,
  );
}

function parseNumericExportValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { value, decimals: Number.isInteger(value) ? 0 : 2, currency: "" };
  }

  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/\d{4}-\d{2}-\d{2}/.test(trimmed) || /\d{1,2}:\d{2}/.test(trimmed))
    return null;

  const negative = /^\(.*\)$/.test(trimmed);
  const currencyMatch = trimmed.match(/[$€£¥]/);
  const currency = currencyMatch?.[0] ?? "";
  const normalized = trimmed
    .replace(/[,$€£¥\s]/g, "")
    .replace(/[()]/g, "")
    .replace(/[^0-9.\-]/g, "");

  if (!normalized || normalized === "-" || normalized === ".") return null;
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return null;

  const decimalPart = normalized.split(".")[1];
  const decimals = decimalPart ? Math.min(decimalPart.length, 4) : 0;

  return {
    value: negative ? -parsed : parsed,
    decimals,
    currency,
  };
}

function formatTotalValue(value: number, decimals: number, currency: string) {
  const precision = Math.max(0, Math.min(4, decimals));
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
  return `${currency}${formatted}`;
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
  exportConfig,
  mobileCardRenderer,
  mobileListRenderer,
  mobileCardListClassName,
  rowGroup,
}: DataTableProps<TData, TValue>) {
  const sortingEnabled = features?.sorting ?? true;
  const globalFilterEnabled = features?.globalFilter ?? true;
  const rowSelectionEnabled = true;
  const paginationEnabled = features?.pagination ?? pagination?.enabled ?? true;
  const serverPagination = pagination?.server ?? false;
  const resolvedSearchScope: Exclude<DataTableSearchScope, "auto"> =
    searchScope === "auto"
      ? serverPagination
        ? "server"
        : "client"
      : searchScope;
  const useClientGlobalFilter =
    globalFilterEnabled && resolvedSearchScope === "client";

  const [globalFilter, setGlobalFilter] = React.useState(
    queryState?.search ?? "",
  );
  const [searchDraft, setSearchDraft] = React.useState(
    queryState?.search ?? "",
  );
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [rowSelectionState, setRowSelectionState] =
    React.useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [internalPagination, setInternalPagination] =
    React.useState<PaginationState>({
      pageIndex: 0,
      pageSize: 25,
    });
  const [clientPathname, setClientPathname] = React.useState<string | null>(
    null,
  );
  const [clientDocumentTitle, setClientDocumentTitle] = React.useState<
    string | null
  >(null);
  const [clientHeadingTitle, setClientHeadingTitle] = React.useState<
    string | null
  >(null);
  const [exportingFormat, setExportingFormat] =
    React.useState<TableExportFormat | null>(null);
  const [exportStatusMessage, setExportStatusMessage] = React.useState<
    string | null
  >(null);
  const [expandedRowIdsState, setExpandedRowIdsState] = React.useState<
    string[]
  >(expansion?.defaultExpandedRowIds ?? []);

  const page = queryState?.page ?? toPage(internalPagination.pageIndex);
  const pageSize = queryState?.pageSize ?? internalPagination.pageSize;
  const expansionEnabled = expansion?.enabled ?? false;
  const expansionMode = expansion?.mode ?? "multiple";
  const resolvedExpandedRowIds =
    expansion?.expandedRowIds ?? expandedRowIdsState;
  const expandedRowIdsSet = React.useMemo(
    () => new Set(resolvedExpandedRowIds),
    [resolvedExpandedRowIds],
  );
  const loadingRowIdsSet = React.useMemo(
    () => new Set(expansion?.loadingRowIds ?? []),
    [expansion?.loadingRowIds],
  );
  const expandColumnWidthClassName =
    expansion?.expandColumn?.widthClassName ?? "w-10";
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
    if (typeof window === "undefined") return;
    setClientPathname(window.location.pathname);
    setClientDocumentTitle(document.title ?? null);
    const heading = document.querySelector("main h1, h1");
    setClientHeadingTitle(heading?.textContent ?? null);
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

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting: sortingEnabled ? sorting : [],
      globalFilter: useClientGlobalFilter ? effectiveGlobalFilter : undefined,
      rowSelection: rowSelectionState,
      columnVisibility,
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
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: (updater) => {
      const next =
        typeof updater === "function"
          ? updater({ pageIndex: toPageIndex(page), pageSize })
          : updater;
      onQueryStateChange?.({
        page: toPage(next.pageIndex),
        pageSize: next.pageSize,
      });
      if (!queryState) {
        setInternalPagination(next);
      }
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: sortingEnabled ? getSortedRowModel() : undefined,
    getFilteredRowModel: useClientGlobalFilter
      ? getFilteredRowModel()
      : undefined,
    getPaginationRowModel:
      paginationEnabled && !serverPagination
        ? getPaginationRowModel()
        : undefined,
  });

  const selectedRows = React.useMemo(
    () => table.getSelectedRowModel().rows.map((row) => row.original),
    [table],
  );

  React.useEffect(() => {
    rowSelection?.onSelectionChange?.(selectedRows);
  }, [rowSelection, selectedRows]);

  const exportEnabled = exportConfig?.enabled ?? true;
  const exportColumns = React.useMemo(() => {
    return table
      .getVisibleLeafColumns()
      .filter(
        (column) => !isActionColumnDefinition(column.columnDef, column.id),
      )
      .map((column) => {
        const columnDef = column.columnDef as {
          accessorKey?: string;
          header?: unknown;
        };
        const accessorKey =
          typeof columnDef.accessorKey === "string"
            ? columnDef.accessorKey
            : null;
        const key = accessorKey ?? column.id;
        if (!key) return null;
        const label = deriveHeaderLabel(
          columnDef.header,
          accessorKey ?? column.id,
        );
        if (!label.trim()) return null;
        return {
          id: column.id,
          key,
          label,
        };
      })
      .filter((column): column is { id: string; key: string; label: string } =>
        Boolean(column),
      );
  }, [table]);

  const resolveExportValue = React.useCallback(
    (row: Row<TData>, column: { id: string; key: string }) => {
      const tableValue = row.getValue(column.id);
      if (tableValue !== undefined) return tableValue;

      const columnDef = row
        .getAllCells()
        .find((cell) => cell.column.id === column.id)?.column.columnDef as
        | (ColumnDefBase<TData, unknown> & {
            accessorKey?: string;
            meta?: ExportMeta<TData>;
          })
        | null;

      const metaValue = columnDef?.meta?.exportValue?.(row.original);
      if (metaValue !== undefined) return metaValue;

      if (columnDef?.accessorKey) {
        const accessorValue = getNestedValue(
          row.original,
          columnDef.accessorKey,
        );
        if (accessorValue !== undefined) return accessorValue;
      }

      const idValue = getNestedValue(row.original, column.id);
      if (idValue !== undefined) return idValue;

      const keyValue = getNestedValue(row.original, column.key);
      if (keyValue !== undefined) return keyValue;

      return "";
    },
    [],
  );
  const baseExportRows = React.useMemo(() => {
    const rows = serverPagination
      ? table.getRowModel().rows
      : table.getPrePaginationRowModel().rows;
    return rows.map((row) => {
      const values: Record<string, unknown> = {};
      for (const column of exportColumns) {
        values[column.key] = normalizeExportCellValue(
          resolveExportValue(row, column),
        );
      }
      return values;
    });
  }, [exportColumns, resolveExportValue, serverPagination, table]);
  const includeTotals = exportConfig?.includeTotals ?? true;
  const exportTotals = React.useMemo(() => {
    if (
      !includeTotals ||
      baseExportRows.length === 0 ||
      exportColumns.length === 0
    ) {
      return [] as Array<{ key: string; label: string; value: string }>;
    }

    return exportColumns
      .map((column) => {
        const normalizedLabel = `${column.label} ${column.key}`.toLowerCase();
        if (
          isLikelyIdentifierColumn(normalizedLabel) ||
          isLikelyDateColumn(normalizedLabel)
        ) {
          return null;
        }

        const nonEmptyValues = baseExportRows
          .map((row) => row[column.key])
          .filter((value) => {
            if (value === null || value === undefined) return false;
            if (typeof value === "string") return value.trim().length > 0;
            return true;
          });

        if (nonEmptyValues.length < 2) return null;

        const numericValues = nonEmptyValues
          .map((value) => parseNumericExportValue(value))
          .filter(
            (
              value,
            ): value is { value: number; decimals: number; currency: string } =>
              Boolean(value),
          );

        if (numericValues.length < 2) return null;
        if (numericValues.length / nonEmptyValues.length < 0.6) return null;

        const total = numericValues.reduce(
          (sum, value) => sum + value.value,
          0,
        );
        const hasCurrency = numericValues.some((value) => value.currency);
        const currency =
          numericValues.find((value) => value.currency)?.currency ?? "";
        const decimals =
          hasCurrency || isLikelyMoneyColumn(normalizedLabel)
            ? 2
            : Math.min(
                3,
                Math.max(...numericValues.map((value) => value.decimals)),
              );
        const formatted = formatTotalValue(total, decimals, currency);

        return {
          key: column.key,
          label: `Total ${column.label}`,
          value: formatted,
        };
      })
      .filter((value): value is { key: string; label: string; value: string } =>
        Boolean(value),
      );
  }, [baseExportRows, exportColumns, includeTotals]);
  const exportRows = React.useMemo(() => {
    if (
      !includeTotals ||
      exportTotals.length === 0 ||
      exportColumns.length === 0
    ) {
      return baseExportRows;
    }

    const totalsRow: Record<string, unknown> = {};
    for (const column of exportColumns) {
      totalsRow[column.key] = "";
    }

    const firstColumnKey = exportColumns[0]?.key;
    if (firstColumnKey) {
      totalsRow[firstColumnKey] = "Total";
    }

    for (const total of exportTotals) {
      totalsRow[total.key] = total.value;
    }

    return [...baseExportRows, totalsRow];
  }, [baseExportRows, exportColumns, exportTotals, includeTotals]);

  const toggleableColumns = React.useMemo(
    () =>
      table
        .getAllLeafColumns()
        .filter((column) => column.getCanHide())
        .filter(
          (column) => !isActionColumnDefinition(column.columnDef, column.id),
        )
        .map((column) => {
          const columnDef = column.columnDef as {
            accessorKey?: string;
            header?: unknown;
          };
          const fallback = columnDef.accessorKey ?? column.id;
          return {
            id: column.id,
            label: deriveHeaderLabel(columnDef.header, fallback),
            column,
          };
        })
        .filter((entry) => entry.label.trim().length > 0)
        .sort((a, b) => a.label.localeCompare(b.label)),
    [table],
  );
  const inferredSourceKey = React.useMemo(
    () => inferTableSourceKey(clientPathname),
    [clientPathname],
  );
  const inferredTitle = React.useMemo(() => {
    const headingTitle = normalizeDocumentTitle(clientHeadingTitle);
    if (headingTitle) return headingTitle;

    const documentTitle = normalizeDocumentTitle(clientDocumentTitle);
    if (documentTitle) return documentTitle;

    return inferTitleFromPath(clientPathname);
  }, [clientDocumentTitle, clientHeadingTitle, clientPathname]);
  const exportSourceKey = exportConfig?.sourceKey ?? inferredSourceKey;
  const exportFileName =
    exportConfig?.fileName ?? exportSourceKey.replace(/\./g, "-");
  const exportDisabled =
    baseExportRows.length === 0 || exportColumns.length === 0;
  const exportFormats = exportConfig?.formats?.length
    ? exportConfig.formats
    : (["pdf", "csv"] as TableExportFormat[]);
  const hasAnyExportFilters =
    Boolean(queryState?.search?.trim()) ||
    Boolean(
      exportConfig?.filters && Object.keys(exportConfig.filters).length > 0,
    );
  const exportMeta = React.useMemo(() => {
    const details: Array<{ label: string; value: string }> = [
      { label: "Rows", value: String(baseExportRows.length) },
    ];
    if (queryState?.search?.trim()) {
      details.push({ label: "Search", value: queryState.search.trim() });
    }
    if (exportConfig?.filters) {
      for (const [key, value] of Object.entries(exportConfig.filters)) {
        if (value.trim()) {
          details.push({
            label: toTitleCase(key.replace(/[^a-zA-Z0-9]+/g, "-")),
            value,
          });
        }
      }
    }
    details.push(
      ...exportTotals.map((item) => ({ label: item.label, value: item.value })),
    );
    return details;
  }, [
    baseExportRows.length,
    exportConfig?.filters,
    exportTotals,
    queryState?.search,
  ]);
  const tableExporter = useTableExporter();
  const handleExport = React.useCallback(
    async (format: TableExportFormat) => {
      if (exportingFormat || !tableExporter) return;
      setExportingFormat(format);
      setExportStatusMessage(
        format === "pdf"
          ? "Preparing PDF export..."
          : "Preparing CSV export...",
      );
      try {
        await tableExporter(
          {
            sourceKey: exportSourceKey,
            format,
            filters: exportConfig?.filters,
            templateId: exportConfig?.templateId,
            templateVersionId: exportConfig?.templateVersionId,
            mode: exportConfig?.mode,
            idempotencyKey: `${exportSourceKey}:${format}:${JSON.stringify(exportConfig?.filters ?? {})}:${JSON.stringify(queryState ?? {})}`,
            payload: {
              title: exportConfig?.title ?? inferredTitle,
              subtitle:
                exportConfig?.subtitle ??
                (hasAnyExportFilters
                  ? "Filtered data export"
                  : "Full table export"),
              fileName: exportFileName,
              meta: exportMeta,
              list: {
                columns: exportColumns.map((column) => ({
                  key: column.key,
                  label: column.label,
                })),
                rows: exportRows,
              },
            },
          },
          {
            onStatus: (status) => {
              if (status === "requesting")
                setExportStatusMessage("Sending export request...");
              if (status === "queued")
                setExportStatusMessage("Export queued. Processing...");
              if (status === "processing")
                setExportStatusMessage("Rendering export...");
              if (status === "ready")
                setExportStatusMessage("Export ready. Downloading...");
              if (status === "downloading")
                setExportStatusMessage("Downloading file...");
              if (status === "done") setExportStatusMessage("Export complete.");
            },
          },
        );
      } catch (error) {
        setExportStatusMessage(
          error instanceof Error ? error.message : "Export failed",
        );
      } finally {
        setExportingFormat(null);
      }
    },
    [
      exportColumns,
      exportConfig?.filters,
      exportConfig?.mode,
      exportConfig?.subtitle,
      exportConfig?.templateId,
      exportConfig?.templateVersionId,
      exportConfig?.title,
      exportFileName,
      exportMeta,
      exportRows,
      exportSourceKey,
      exportingFormat,
      hasAnyExportFilters,
      inferredTitle,
      queryState,
    ],
  );

  const showToolbarPagination = paginationEnabled;
  const showTopToolbar =
    globalFilterEnabled ||
    Boolean(toolbar) ||
    exportEnabled ||
    toggleableColumns.length > 0;
  const showBottomPagination = showToolbarPagination;

  const totalPages = serverPagination
    ? (pagination?.totalPages ??
      Math.max(
        1,
        Math.ceil(Math.max(pagination?.total ?? data.length, 1) / pageSize),
      ))
    : table.getPageCount();

  const setPaginationState = React.useCallback(
    (nextPage: number, nextPageSize: number) => {
      const clampedPage = Math.max(
        1,
        Math.min(nextPage, Math.max(totalPages, 1)),
      );
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
      const canExpand =
        expansionEnabled && (expansion?.canExpand?.(row.original) ?? true);
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
      const willExpand =
        typeof forceExpanded === "boolean"
          ? forceExpanded
          : !isCurrentlyExpanded;

      let nextIds: string[];
      if (willExpand) {
        nextIds =
          expansionMode === "single"
            ? [rowId]
            : [...resolvedExpandedRowIds, rowId];
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
  const primaryDataColumn = React.useMemo(
    () =>
      table
        .getVisibleLeafColumns()
        .find(
          (column) => !isActionColumnDefinition(column.columnDef, column.id),
        ),
    [table],
  );
  const primaryColumnMaxWidth = React.useMemo(() => {
    const sizing = primaryDataColumn?.columnDef as
      | { maxSize?: number; size?: number; minSize?: number }
      | undefined;
    return sizing?.maxSize ?? sizing?.size ?? sizing?.minSize ?? 220;
  }, [primaryDataColumn]);
  const visibleColumnCount = table.getVisibleLeafColumns().length;
  const totalColumnCount =
    visibleColumnCount +
    (expansionEnabled ? 1 : 0) +
    (rowSelectionEnabled ? 1 : 0);

  return (
    <div className={cn("space-y-0", className)}>
      {showTopToolbar ? (
        <div
          className={cn(
            "data-toolbar dt-toolbar",
            edgeToEdge && "table-edge-to-edge",
          )}
        >
          {globalFilterEnabled ? (
            <form
              className="flex w-full flex-wrap items-center gap-2 p-0 lg:w-auto lg:flex-nowrap"
              onSubmit={(event) => {
                event.preventDefault();
                applySearch(searchDraft);
              }}
            >
              {/* `.search-input`/`.search-l` style the raw <input> inside them,
                  and reserve the left gutter the `[data-icon]` sits in. */}
              <div className="search-input search-l">
                <span data-icon aria-hidden="true">
                  <Search className="size-4" />
                </span>
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
                />
              </div>
              <Button type="submit" size="sm" className="min-w-[78px]">
                {searchSubmitLabel}
              </Button>
            </form>
          ) : null}

          {toolbar ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2 lg:ml-2">
              {toolbar}
            </div>
          ) : null}
          {toggleableColumns.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="sm" variant="outline">
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Show / Hide Columns</DropdownMenuLabel>
                {toggleableColumns.map((entry) => (
                  <DropdownMenuCheckboxItem
                    key={entry.id}
                    checked={entry.column.getIsVisible()}
                    onCheckedChange={(checked) =>
                      entry.column.toggleVisibility(Boolean(checked))
                    }
                  >
                    {entry.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {exportEnabled ? (
            <>
              {/* `.dt-toolbar > .spacer` is the design system's `ml-auto`. */}
              <span className="spacer" />
              <ExportMenu
                label="Export"
                formats={exportFormats}
                disabled={exportDisabled}
                exportingFormat={exportingFormat}
                onExport={handleExport}
              />
            </>
          ) : null}
        </div>
      ) : null}
      {exportEnabled && exportStatusMessage ? (
        <p className="px-[var(--content-gutter-x)] py-1 text-sm text-muted-foreground">
          {exportStatusMessage}
        </p>
      ) : null}

      {mobileCardRenderer || mobileListRenderer ? (
        <div className={cn("space-y-2 md:hidden", mobileCardListClassName)}>
          {renderedRows.length > 0 ? (
            mobileListRenderer ? (
              mobileListRenderer({
                rows: renderedRows.map((row, rowIndex) => ({
                  row: row.original,
                  rowIndex,
                })),
              })
            ) : (
              renderedRows.map((row, rowIndex) => (
                <div
                  key={row.id}
                  className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-base)] px-3 py-2.5 shadow-[var(--surface-frame-shadow)]"
                >
                  {mobileCardRenderer?.({ row: row.original, rowIndex })}
                </div>
              ))
            )
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--edge-subtle)] bg-[var(--datatable-empty-bg)] px-4 py-8 text-center text-sm text-muted-foreground">
              {emptyState ?? noResultsText}
            </div>
          )}
        </div>
      ) : null}

      <div
        className={cn(
          maxBodyHeight ? "overflow-auto" : undefined,
          tableContainerClassName,
          // Either mobile renderer replaces the table below `md`. Checking only
          // `mobileCardRenderer` here left every `mobileListRenderer` caller
          // stacking the list on top of the full table on a phone.
          (mobileCardRenderer || mobileListRenderer) && "hidden md:block",
        )}
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
                  <TableHead
                    className="w-11 px-2"
                    style={{ width: 44, minWidth: 44, maxWidth: 44 }}
                  >
                    <SelectionCheckbox
                      checked={table.getIsAllRowsSelected()}
                      indeterminate={
                        table.getIsSomeRowsSelected() &&
                        !table.getIsAllRowsSelected()
                      }
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
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  const toggleSort = () =>
                    header.column.toggleSorting(sorted === "asc");

                  return (
                    <TableHead
                      key={header.id}
                      className={cn(
                        isNumericColumnDefinition(header.column.columnDef) &&
                          "num",
                        canSort && "sortable",
                        sorted === "asc" && "asc",
                        sorted === "desc" && "desc",
                      )}
                      style={getColumnWidthStyle(header.column.columnDef)}
                      aria-sort={
                        !canSort
                          ? undefined
                          : sorted === "asc"
                            ? "ascending"
                            : sorted === "desc"
                              ? "descending"
                              : "none"
                      }
                      tabIndex={canSort ? 0 : undefined}
                      onClick={canSort ? toggleSort : undefined}
                      onKeyDown={
                        canSort
                          ? (event) => {
                              if (event.key !== "Enter" && event.key !== " ") {
                                return;
                              }
                              event.preventDefault();
                              toggleSort();
                            }
                          : undefined
                      }
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {renderedRows.length > 0 ? (
              renderedRows.map((row, renderedIndex) => {
                const { rowId, canExpand, isExpanded } =
                  getRowExpansionMeta(row);
                const isLoading = loadingRowIdsSet.has(rowId);
                const error = expansion?.errorByRowId?.[rowId];

                // Compare against the row above rather than tracking a running
                // key: the same group can legitimately appear twice if the sort
                // separates it, and a header at each break is the honest
                // rendering of what the reader is actually looking at.
                const group = rowGroup?.(row.original) ?? null;
                const previousGroup =
                  renderedIndex > 0
                    ? (rowGroup?.(renderedRows[renderedIndex - 1].original) ?? null)
                    : null;
                const startsGroup =
                  group !== null && group.key !== previousGroup?.key;

                return (
                  <React.Fragment key={row.id}>
                    {startsGroup ? (
                      <TableRow className="data-table-group-row">
                        <TableCell
                          colSpan={totalColumnCount}
                          className="bg-[var(--surface-muted)] py-2 text-sm font-semibold text-muted-foreground"
                        >
                          {group.label}
                        </TableCell>
                      </TableRow>
                    ) : null}
                    <TableRow
                      data-state={row.getIsSelected() ? "selected" : undefined}
                      className={cn(
                        expansionEnabled && isExpanded && "expanded",
                      )}
                    >
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
                        <TableCell
                          className={cn("expander", expandColumnWidthClassName)}
                        >
                          {canExpand ? (
                            <button
                              type="button"
                              className="more"
                              onClick={() =>
                                toggleRowExpansion(row.original, row.index)
                              }
                              aria-label={
                                isExpanded ? "Collapse row" : "Expand row"
                              }
                              aria-expanded={isExpanded}
                            >
                              {isExpanded ? (
                                <ChevronDown className="size-4" />
                              ) : (
                                <ChevronRight className="size-4" />
                              )}
                            </button>
                          ) : null}
                        </TableCell>
                      ) : null}
                      {row.getVisibleCells().map((cell) =>
                        (() => {
                          const columnDef = cell.column.columnDef as {
                            accessorKey?: string;
                            header?: unknown;
                          };
                          const columnLabel = deriveHeaderLabel(
                            columnDef.header,
                            columnDef.accessorKey ?? cell.column.id,
                          );
                          const semanticKey =
                            `${cell.column.id} ${columnDef.accessorKey ?? ""} ${columnLabel}`.toLowerCase();
                          const isActionCell = isActionColumnDefinition(
                            cell.column.columnDef,
                            cell.column.id,
                          );
                          const usesPrimaryWidth =
                            cell.column.id === primaryDataColumn?.id ||
                            isLikelyIdentifierColumn(semanticKey) ||
                            isLikelyDateColumn(semanticKey);

                          return (
                            <TableCell
                              key={cell.id}
                              className={cn(
                                isActionCell && "action",
                                isNumericColumnDefinition(
                                  cell.column.columnDef,
                                ) && "num",
                              )}
                              style={getColumnWidthStyle(cell.column.columnDef)}
                            >
                              {isActionCell ? (
                                flexRender(
                                  cell.column.columnDef.cell,
                                  cell.getContext(),
                                )
                              ) : (
                                <div
                                  className="block w-full max-w-full overflow-hidden text-ellipsis whitespace-nowrap [&>*]:inline [&>*]:max-w-full [&>*]:overflow-hidden [&>*]:text-ellipsis [&>*]:whitespace-nowrap [&>*+*]:ml-1"
                                  style={{
                                    maxWidth: usesPrimaryWidth
                                      ? `${primaryColumnMaxWidth}px`
                                      : "320px",
                                  }}
                                >
                                  {flexRender(
                                    cell.column.columnDef.cell,
                                    cell.getContext(),
                                  )}
                                </div>
                              )}
                            </TableCell>
                          );
                        })(),
                      )}
                    </TableRow>
                    {expansionEnabled && isExpanded ? (
                      <TableRow
                        data-state={
                          row.getIsSelected() ? "selected" : undefined
                        }
                      >
                        <TableCell
                          colSpan={totalColumnCount}
                          className="detail"
                        >
                          {expansion?.renderExpandedContent({
                            row: row.original,
                            rowId,
                            isExpanded,
                            isLoading,
                            error,
                            collapse: () =>
                              toggleRowExpansion(
                                row.original,
                                row.index,
                                false,
                              ),
                          })}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </React.Fragment>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={totalColumnCount}>
                  {/* `.empty-state` styles by descendant, so a caller-supplied
                      node keeps its own markup and only inherits the frame. */}
                  <div className="empty-state">
                    {emptyState ?? <h3>{noResultsText}</h3>}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {showBottomPagination ? (
        <div
          className={cn("p-pagination", edgeToEdge && "table-edge-to-edge")}
        >
          <span className="pg-count">
            Page <strong>{Math.max(page, 1)}</strong> of{" "}
            <strong>{Math.max(totalPages, 1)}</strong>
          </span>
          <span className="pg-size">
            Rows per page
            <Select
              value={String(pageSize)}
              onValueChange={(value) => setPaginationState(1, Number(value))}
            >
              <SelectTrigger size="sm" className="w-[86px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </span>
          <span className="pg-spacer" />
          <div className="pg-nav">
            <button
              type="button"
              onClick={() => setPaginationState(page - 1, pageSize)}
              disabled={page <= 1}
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPaginationState(page + 1, pageSize)}
              disabled={page >= totalPages}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {rowSelectionEnabled &&
      selectedRows.length > 0 &&
      rowSelection?.bulkActions ? (
        <DataTableFloatingActions
          count={selectedRows.length}
          onClear={clearSelection}
        >
          {rowSelection.bulkActions({ selectedRows, clearSelection })}
        </DataTableFloatingActions>
      ) : null}
    </div>
  );
}
