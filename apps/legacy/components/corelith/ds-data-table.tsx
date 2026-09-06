"use client";

import * as React from "react";
import {
  Alert,
  Button,
  DataTable,
  DataToolbar,
  EmptyState,
  Input,
  Pagination,
  Select,
  Skeleton,
  type DataTableColumn,
} from "@corelithzw/react";

/**
 * Local wrapper over the design system's `DataTable`.
 *
 * Its prop surface is the app's, not the package's, so call sites stay put when
 * the package's API moves. Two things it deliberately does NOT delegate:
 *
 *  · Pagination. `DataTable`'s own `pagination` prop slices `data` internally,
 *    but every call site already hands us the rows for the current page (or
 *    pages server-side), so the table renders what it is given and the page
 *    controls live in the toolbar.
 *  · Sorting. The package sorts client-side from `columns[].sortable` and
 *    `sortAccessor`; there is no controlled sort state to forward.
 */

export type DsDataTableProps<Row> = {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  getRowId: (row: Row, index: number) => string;
  ariaLabel: string;
  searchValue?: string;
  searchPlaceholder?: string;
  searchSubmitLabel?: string;
  onSearchChange?: (value: string) => void;
  onSearchSubmit?: (value: string) => void;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  isLoading?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  error?: React.ReactNode | null;
  errorTitle?: React.ReactNode;
  emptyTitle?: React.ReactNode;
  emptyDescription?: React.ReactNode;
  pagination?: {
    page: number;
    pageCount: number;
    total?: number;
    pageSize?: number;
    pageSizeOptions?: number[];
    onPageChange: (page: number) => void;
    onPageSizeChange?: (pageSize: number) => void;
  };
  page?: number;
  pageCount?: number;
  total?: number;
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
};

export function DsDataTable<Row>({
  columns,
  rows,
  getRowId,
  ariaLabel,
  searchValue,
  searchPlaceholder = "Search",
  searchSubmitLabel = "Search",
  onSearchChange,
  onSearchSubmit,
  filters,
  actions,
  isLoading,
  loading,
  loadingLabel = "Fetching records",
  error,
  errorTitle = "Unable to load records",
  emptyTitle = "No records found",
  emptyDescription = "Records will appear here when they are available.",
  page,
  pageCount,
  total,
  pageSize,
  pageSizeOptions,
  onPageChange,
  onPageSizeChange,
  pagination,
}: DsDataTableProps<Row>) {
  const hasSearch = searchValue !== undefined || Boolean(onSearchChange || onSearchSubmit);
  const activePage = pagination?.page ?? page;
  const activePageCount = pagination?.pageCount ?? pageCount;
  const activeTotal = pagination?.total ?? total;
  const activePageSize = pagination?.pageSize ?? pageSize;
  const activePageSizeOptions = pagination?.pageSizeOptions ?? pageSizeOptions;
  const activeOnPageChange = pagination?.onPageChange ?? onPageChange;
  const activeOnPageSizeChange = pagination?.onPageSizeChange ?? onPageSizeChange;
  const hasPagination =
    activePage !== undefined && activePageCount !== undefined && Boolean(activeOnPageChange);
  const showLoading = isLoading ?? loading ?? false;

  const searchSlot = hasSearch ? (
    <form
      className="flex min-w-0 items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSearchSubmit?.(searchValue ?? "");
      }}
    >
      <Input
        value={searchValue ?? ""}
        onChange={(event) => onSearchChange?.(event.target.value)}
        placeholder={searchPlaceholder}
        aria-label={searchPlaceholder}
      />
      <Button type="submit" variant="secondary" size="sm">
        {searchSubmitLabel}
      </Button>
    </form>
  ) : undefined;

  const actionsSlot =
    actions || hasPagination ? (
      <>
        {actions}
        {hasPagination ? (
          <>
            {/* `Pagination` ships no page-size control, so pair it with a Select. */}
            {activePageSizeOptions?.length && activeOnPageSizeChange ? (
              <Select
                size="sm"
                aria-label="Rows per page"
                value={String(activePageSize ?? activePageSizeOptions[0])}
                onChange={(event) => activeOnPageSizeChange(Number(event.target.value))}
              >
                {activePageSizeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option} per page
                  </option>
                ))}
              </Select>
            ) : null}
            {activeTotal !== undefined ? (
              <span className="t-caption t-muted whitespace-nowrap">
                {activeTotal} total
              </span>
            ) : null}
            <Pagination
              page={activePage!}
              count={Math.max(1, activePageCount!)}
              onPageChange={activeOnPageChange!}
              aria-label={`${ariaLabel} pagination`}
            />
          </>
        ) : null}
      </>
    ) : undefined;

  return (
    <section className="space-y-3" aria-label={ariaLabel}>
      {error ? (
        <Alert tone="danger" title={errorTitle}>
          {error}
        </Alert>
      ) : null}

      <DataToolbar search={searchSlot} filters={filters} actions={actionsSlot} />

      {showLoading ? (
        <div className="space-y-2" aria-label={loadingLabel} aria-busy="true">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} variant="text" />
          ))}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          rowKey={getRowId}
          sortable
          emptyState={<EmptyState title={emptyTitle} body={emptyDescription} />}
        />
      )}
    </section>
  );
}
