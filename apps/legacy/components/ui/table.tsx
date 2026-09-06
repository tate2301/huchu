"use client";

import * as React from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Table — the design system's `.dtable` recipe, behind this repo's compound
 * markup and its built-in pagination.
 *
 * The DS ships a `DataTable` component, but it is fully controlled and takes a
 * column shape incompatible with the `ColumnDef`s the 10 files importing this
 * (and the 121 authoring columns against `data-table.tsx`) already write. So
 * the composition stays local and only the chrome moves: the `<table>` carries
 * `dtable data-table` and every section, row and cell hands its styling to the
 * package's descendant rules instead of the `--table-*` Tailwind utilities that
 * used to duplicate them.
 *
 * Two things here are deliberately *not* the design system's:
 *
 *   - The tablet width utilities on the `<table>` are driven by the public
 *     `tabletScrollable` / `tabletMinTableWidth` props and produce layout
 *     behaviour, not chrome, so they stay.
 *   - `TableBody` silently slices `React.Children` when this component owns
 *     pagination. Callers rely on passing every row and getting one page.
 *
 * Sticky headers come from `.dtable.sticky-head` on the table plus
 * `--table-sticky-top`, so `<thead>` no longer positions itself.
 *
 * Every `data-slot` is load-bearing — `app/globals.css` keys
 * `.table-rail > [data-slot="table"]` off it.
 */
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
      className={cn("p-pagination", edgeToEdge && "table-edge-to-edge", className)}
    >
      {mode === "paginated" ? (
        <>
          <span className="pg-count">
            Page <strong>{page}</strong> of <strong>{pageCount}</strong>
          </span>
          <span className="pg-size">
            Rows per page
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                setPageSize(Number(value));
                setPage(1);
              }}
            >
              <SelectTrigger size="sm" className="w-[88px]">
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
          </span>
          <span className="pg-spacer" />
          <div className="pg-nav">
            <button
              type="button"
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage(page + 1)}
              disabled={page >= pageCount}
            >
              Next
            </button>
          </div>
        </>
      ) : (
        <>
          <span className="pg-spacer" />
          <span className="pg-count">
            Showing all <strong>{rowCount.toLocaleString()}</strong> rows
          </span>
        </>
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
    const [internalMode, setInternalMode] =
      React.useState<TableMode>(defaultMode);
    const [internalPage, setInternalPage] = React.useState(1);
    const [internalPageSize, setInternalPageSize] =
      React.useState(defaultPageSize);
    const [measuredRowCount, setMeasuredRowCount] = React.useState(0);

    const mode = modeProp ?? internalMode;
    const page = pageProp ?? internalPage;
    const pageSize = pageSizeProp ?? internalPageSize;
    const rowCount = totalRows ?? measuredRowCount;
    const pageCount = Math.max(1, Math.ceil(Math.max(rowCount, 1) / pageSize));

    React.useEffect(() => {
      if (!persistKey) return;
      if (typeof window === "undefined") return;

      const savedMode = window.localStorage.getItem(
        getStorageKey(persistKey, "mode"),
      );
      if (savedMode === "all" || savedMode === "paginated") {
        if (modeProp === undefined) {
          setInternalMode(savedMode);
        } else {
          onModeChange?.(savedMode);
        }
      }

      const savedPageSize = window.localStorage.getItem(
        getStorageKey(persistKey, "pageSize"),
      );
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
          window.localStorage.setItem(
            getStorageKey(persistKey, "mode"),
            nextMode,
          );
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
          window.localStorage.setItem(
            getStorageKey(persistKey, "pageSize"),
            String(nextPageSize),
          );
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
      showControls &&
      (controlsPosition === "top" || controlsPosition === "both");
    const shouldRenderBottomControls =
      showControls &&
      (controlsPosition === "bottom" || controlsPosition === "both");

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
        <div className="space-y-0 ">
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
            className={cn(
              // No `overflow-hidden` here. Both `.table-rail` (globals.css)
              // and the design system's `.table-scroll` set `overflow-x: auto`
              // precisely so a table wider than its container can be swiped,
              // and the Tailwind utility overrode both. Between `md` and `lg`
              // the table is deliberately given `w-max`, so with the scroll
              // disabled every column past the container edge became
              // unreachable — a 1232px table clipped dead at 768px on every
              // DataTable in the app. There is no radius to protect: the rail
              // sets `border-radius: 0`.
              "table-rail table-scroll",
              edgeToEdge && "table-edge-to-edge",
            )}
            data-tablet-scrollable={tabletScrollable ? "true" : "false"}
            data-tablet-sticky-first-column={
              tabletStickyFirstColumn ? "true" : "false"
            }
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
                "dtable data-table",
                stickyHeader && "sticky-head",
                tabletScrollable &&
                  "md:max-lg:w-max md:max-lg:min-w-[var(--table-tablet-min-width)]",
                className,
              )}
              style={
                stickyHeader
                  ? ({
                      ...tableStyle,
                      "--table-sticky-top": `${stickyHeaderOffset}px`,
                    } as React.CSSProperties)
                  : tableStyle
              }
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
>(({ className, ...props }, ref) => (
  // `.dtable thead th` paints the header; pinning is `.dtable.sticky-head` on
  // the <table>, set by `Table` from its own `stickyHeader` prop.
  <thead
    ref={ref}
    data-slot="table-header"
    className={cn(className)}
    {...props}
  />
));
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
    // Hover and selection now come from `.dtable tbody tr:hover td` and
    // `.dtable tbody tr.selected td`; `TableRow` derives `.selected` from
    // `data-state`.
    <tbody
      ref={ref}
      data-slot="table-body"
      className={cn(className)}
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
  // `.dtable tfoot td` carries the muted totals treatment.
  <tfoot
    ref={ref}
    data-slot="table-footer"
    className={cn(className)}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.ComponentProps<"tr">
>(({ className, ...props }, ref) => {
  // The row border lives on `.dtable tbody td`. `data-state="selected"` is the
  // repo-wide convention (Radix-era) and stays the input; `.selected` is what
  // the design system reads.
  const isSelected =
    (props as { "data-state"?: string })["data-state"] === "selected";

  return (
    <tr
      ref={ref}
      data-slot="table-row"
      className={cn(isSelected && "selected", className)}
      {...props}
    />
  );
});
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ComponentProps<"th">
>(({ className, ...props }, ref) => (
  // `.dtable thead th` owns the uppercase label, padding and rules. Callers add
  // `num` (right-aligned) and `sortable` + `asc` / `desc` through `className`.
  <th
    ref={ref}
    data-slot="table-head"
    className={cn(className)}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.ComponentProps<"td">
>(({ className, ...props }, ref) => (
  // `.dtable tbody td` owns padding, rule and alignment. Callers add `num`,
  // `action`, `expander` or `detail` through `className`.
  <td
    ref={ref}
    data-slot="table-cell"
    className={cn(className)}
    {...props}
  />
));
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
