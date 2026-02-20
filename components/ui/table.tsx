"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type TableMode = "all" | "paginated";

type TableContextValue = {
  enablePagination: boolean;
  manualPagination: boolean;
  mode: TableMode;
  setMode: (mode: TableMode) => void;
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  setPageSize: (pageSize: number) => void;
  rowCount: number;
  setMeasuredRowCount: (count: number) => void;
  stickyHeader: boolean;
  stickyHeaderOffset: number;
};

const TableContext = React.createContext<TableContextValue | null>(null);

type ControlsPosition = "top" | "bottom" | "both";

export type TableProps = React.ComponentProps<"table"> & {
  enablePagination?: boolean;
  manualPagination?: boolean;
  totalRows?: number;
  mode?: TableMode;
  onModeChange?: (mode: TableMode) => void;
  page?: number;
  onPageChange?: (page: number) => void;
  pageSize?: number;
  onPageSizeChange?: (pageSize: number) => void;
  defaultMode?: TableMode;
  defaultPageSize?: number;
  pageSizeOptions?: number[];
  persistKey?: string;
  stickyHeader?: boolean;
  stickyHeaderOffset?: number;
  controlsPosition?: ControlsPosition;
  controlsClassName?: string;
  hideControlsWhenSinglePage?: boolean;
  edgeToEdge?: boolean;
  tabletScrollable?: boolean;
  tabletStickyFirstColumn?: boolean;
  tabletMinTableWidth?: string;
};

const defaultPageSizeOptions = [10, 25, 50, 100] as const;

function clampPage(page: number, pageCount: number) {
  if (page < 1) return 1;
  if (page > pageCount) return pageCount;
  return page;
}

function getStorageKey(key: string, suffix: string) {
  return `datatable:${key}:${suffix}`;
}

function TablePaginationControls({
  rowCount,
  page,
  pageCount,
  pageSize,
  mode,
  setPage,
  setPageSize,
  pageSizeOptions,
  edgeToEdge,
  className,
}: {
  rowCount: number;
  page: number;
  pageCount: number;
  pageSize: number;
  mode: TableMode;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  pageSizeOptions: readonly number[];
  edgeToEdge: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-none bg-[var(--table-toolbar-bg)] px-[var(--content-gutter-x)] py-1",
        edgeToEdge && "table-edge-to-edge",
        className,
      )}
    >
      {mode === "paginated" ? (
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Rows per page</span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              setPageSize(Number(value));
              setPage(1);
            }}
          >
            <SelectTrigger size="sm" className="h-8 w-[88px] bg-[var(--surface-base)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>
            Page {page} of {pageCount}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setPage(page - 1)}
            disabled={page <= 1}
          >
            Previous
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setPage(page + 1)}
            disabled={page >= pageCount}
          >
            Next
          </Button>
        </div>
      ) : (
        <p className="ml-auto text-xs text-muted-foreground">
          Showing all {rowCount.toLocaleString()} rows
        </p>
      )}
    </div>
  );
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  (
    {
      className,
      enablePagination = true,
      manualPagination = false,
      totalRows,
      mode: modeProp,
      onModeChange,
      page: pageProp,
      onPageChange,
      pageSize: pageSizeProp,
      onPageSizeChange,
      defaultMode = "paginated",
      defaultPageSize = 25,
      pageSizeOptions = defaultPageSizeOptions,
      persistKey,
      stickyHeader = true,
      stickyHeaderOffset = 0,
      controlsPosition = "bottom",
      controlsClassName,
      hideControlsWhenSinglePage = false,
      edgeToEdge = false,
      tabletScrollable = true,
      tabletStickyFirstColumn = false,
      tabletMinTableWidth = "100%",
      style: tableStyle,
      ...props
    },
    ref,
  ) => {
    const [internalMode, setInternalMode] = React.useState<TableMode>(defaultMode);
    const [internalPage, setInternalPage] = React.useState(1);
    const [internalPageSize, setInternalPageSize] = React.useState(defaultPageSize);
    const [measuredRowCount, setMeasuredRowCount] = React.useState(0);

    const mode = modeProp ?? internalMode;
    const page = pageProp ?? internalPage;
    const pageSize = pageSizeProp ?? internalPageSize;
    const rowCount = totalRows ?? measuredRowCount;
    const pageCount = Math.max(1, Math.ceil(Math.max(rowCount, 1) / pageSize));

    React.useEffect(() => {
      if (!persistKey) return;
      if (typeof window === "undefined") return;

      const savedMode = window.localStorage.getItem(getStorageKey(persistKey, "mode"));
      if (savedMode === "all" || savedMode === "paginated") {
        if (modeProp === undefined) {
          setInternalMode(savedMode);
        } else {
          onModeChange?.(savedMode);
        }
      }

      const savedPageSize = window.localStorage.getItem(getStorageKey(persistKey, "pageSize"));
      const parsedPageSize = savedPageSize ? Number(savedPageSize) : Number.NaN;
      if (Number.isFinite(parsedPageSize) && parsedPageSize > 0) {
        if (pageSizeProp === undefined) {
          setInternalPageSize(parsedPageSize);
        } else {
          onPageSizeChange?.(parsedPageSize);
        }
      }
    }, [modeProp, onModeChange, onPageSizeChange, pageSizeProp, persistKey]);

    React.useEffect(() => {
      const nextPage = clampPage(page, pageCount);
      if (nextPage !== page) {
        if (pageProp === undefined) {
          setInternalPage(nextPage);
        }
        onPageChange?.(nextPage);
      }
    }, [onPageChange, page, pageCount, pageProp]);

    const setMode = React.useCallback(
      (nextMode: TableMode) => {
        if (modeProp === undefined) {
          setInternalMode(nextMode);
        }
        onModeChange?.(nextMode);
        if (persistKey && typeof window !== "undefined") {
          window.localStorage.setItem(getStorageKey(persistKey, "mode"), nextMode);
        }
      },
      [modeProp, onModeChange, persistKey],
    );

    const setPage = React.useCallback(
      (nextPage: number) => {
        const clamped = clampPage(nextPage, pageCount);
        if (pageProp === undefined) {
          setInternalPage(clamped);
        }
        onPageChange?.(clamped);
      },
      [onPageChange, pageCount, pageProp],
    );

    const setPageSize = React.useCallback(
      (nextPageSize: number) => {
        if (pageSizeProp === undefined) {
          setInternalPageSize(nextPageSize);
        }
        onPageSizeChange?.(nextPageSize);
        if (persistKey && typeof window !== "undefined") {
          window.localStorage.setItem(getStorageKey(persistKey, "pageSize"), String(nextPageSize));
        }
      },
      [onPageSizeChange, pageSizeProp, persistKey],
    );

    const setMeasuredCount = React.useCallback((count: number) => {
      setMeasuredRowCount(count);
    }, []);

    const showControls =
      enablePagination &&
      (!hideControlsWhenSinglePage || rowCount > pageSize || mode === "all");

    const shouldRenderTopControls =
      showControls && (controlsPosition === "top" || controlsPosition === "both");
    const shouldRenderBottomControls =
      showControls && (controlsPosition === "bottom" || controlsPosition === "both");

    const contextValue = React.useMemo<TableContextValue>(
      () => ({
        enablePagination,
        manualPagination,
        mode,
        setMode,
        page,
        setPage,
        pageSize,
        setPageSize,
        rowCount,
        setMeasuredRowCount: setMeasuredCount,
        stickyHeader,
        stickyHeaderOffset,
      }),
      [
        enablePagination,
        manualPagination,
        mode,
        page,
        pageSize,
        rowCount,
        setMeasuredCount,
        setMode,
        setPage,
        setPageSize,
        stickyHeader,
        stickyHeaderOffset,
      ],
    );

    return (
      <TableContext.Provider value={contextValue}>
        <div className="space-y-0">
          {shouldRenderTopControls ? (
            <TablePaginationControls
              rowCount={rowCount}
              page={page}
              pageCount={pageCount}
              pageSize={pageSize}
              mode={mode}
              setPage={setPage}
              setPageSize={setPageSize}
              pageSizeOptions={pageSizeOptions}
              edgeToEdge={edgeToEdge}
              className={controlsClassName}
            />
          ) : null}

          <div
            className={cn("table-rail", edgeToEdge && "table-edge-to-edge")}
            data-tablet-scrollable={tabletScrollable ? "true" : "false"}
            data-tablet-sticky-first-column={tabletStickyFirstColumn ? "true" : "false"}
            style={
              tabletScrollable
                ? ({
                  "--table-tablet-min-width": tabletMinTableWidth,
                } as React.CSSProperties)
                : undefined
            }
          >
            <table
              ref={ref}
              data-slot="table"
              className={cn(
                "w-full caption-bottom text-sm",
                tabletScrollable &&
                "md:max-lg:w-max md:max-lg:min-w-[var(--table-tablet-min-width)]",
                className,
              )}
              style={tableStyle}
              {...props}
            />
          </div>

          {shouldRenderBottomControls ? (
            <TablePaginationControls
              rowCount={rowCount}
              page={page}
              pageCount={pageCount}
              pageSize={pageSize}
              mode={mode}
              setPage={setPage}
              setPageSize={setPageSize}
              pageSizeOptions={pageSizeOptions}
              edgeToEdge={edgeToEdge}
              className={controlsClassName}
            />
          ) : null}
        </div>
      </TableContext.Provider>
    );
  },
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.ComponentProps<"thead">
>(({ className, style, ...props }, ref) => {
  const tableContext = React.useContext(TableContext);
  const stickyHeader = tableContext?.stickyHeader ?? false;
  const stickyHeaderOffset = tableContext?.stickyHeaderOffset ?? 0;

  return (
    <thead
      ref={ref}
      data-slot="table-header"
      className={cn(
        "[&_tr]:border-b [&_tr]:border-[var(--table-divider)] [&_tr]:text-[var(--table-header-text)]",
        stickyHeader &&
        "sticky z-20 [&_tr]:bg-[var(--table-header-bg)] supports-[backdrop-filter]:backdrop-blur",
        className,
      )}
      style={stickyHeader ? { ...style, top: stickyHeaderOffset } : style}
      {...props}
    />
  );
});
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.ComponentProps<"tbody">
>(({ className, children, ...props }, ref) => {
  const tableContext = React.useContext(TableContext);
  const rows = React.Children.toArray(children);

  React.useEffect(() => {
    tableContext?.setMeasuredRowCount(rows.length);
  }, [rows.length, tableContext]);

  let visibleRows = rows;

  if (
    tableContext &&
    tableContext.enablePagination &&
    tableContext.mode === "paginated" &&
    !tableContext.manualPagination
  ) {
    const start = (tableContext.page - 1) * tableContext.pageSize;
    const end = start + tableContext.pageSize;
    visibleRows = rows.slice(start, end);
  }

  return (
    <tbody
      ref={ref}
      data-slot="table-body"
      className={cn(
        "[&_tr:last-child]:border-0 [&_tr]:bg-[var(--table-row-bg)] [&_tr:nth-child(even)]:bg-[var(--table-row-bg-alt)] [&_tr:hover]:bg-[var(--table-row-hover-bg)] [&_tr[data-state=selected]]:bg-[var(--table-row-selected-bg)]",
        className,
      )}
      {...props}
    >
      {visibleRows}
    </tbody>
  );
});
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.ComponentProps<"tfoot">
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    data-slot="table-footer"
    className={cn("border-t border-[var(--table-divider)] bg-[var(--surface-subtle)]/60 font-medium [&>tr]:last:border-b-0", className)}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.ComponentProps<"tr">>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      data-slot="table-row"
      className={cn(
        "border-b border-[var(--table-divider)] transition-colors duration-[var(--motion-duration-fast)]",
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<HTMLTableCellElement, React.ComponentProps<"th">>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      data-slot="table-head"
      className={cn(
        "h-[var(--table-head-min-h)] border border-[var(--table-divider)] px-[var(--table-gutter-x)] text-left align-middle text-[12px] font-semibold tracking-[0.03em] uppercase [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  ),
);
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, React.ComponentProps<"td">>(
  ({ className, ...props }, ref) => (
    <td
      ref={ref}
      data-slot="table-cell"
      className={cn(
        "min-h-[var(--table-row-min-h)] border border-[var(--table-divider)] px-[var(--table-gutter-x)] py-2.5 align-middle text-table-cell [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  ),
);
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.ComponentProps<"caption">
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    data-slot="table-caption"
    className={cn("text-muted-foreground mt-4 text-sm", className)}
    {...props}
  />
));
TableCaption.displayName = "TableCaption";

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};

