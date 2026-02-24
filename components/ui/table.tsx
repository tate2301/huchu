"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  FrappeListViewAdapter,
  type FrappeListViewColumn,
} from "@/components/ui/frappe-list-view";
import {
  computeListViewColumnWidths,
  inferPrimaryColumnKeys,
} from "@/components/ui/listview-column-sizing";
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

type ParsedFrappeCell = {
  className?: string;
  content: React.ReactNode;
};

type ParsedFrappeRow = Record<string, unknown> & {
  __rowId: string;
};

type ParsedFrappeTable = {
  columns: FrappeListViewColumn<ParsedFrappeRow>[];
  rows: ParsedFrappeRow[];
};

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
  selectableRows?: boolean;
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

function getElementDisplayName(node: React.ReactElement): string {
  if (typeof node.type === "string") return node.type;
  if (typeof node.type === "function") {
    const component = node.type as { displayName?: string; name?: string };
    return component.displayName ?? component.name ?? "";
  }
  if (typeof node.type === "object" && node.type !== null && "displayName" in node.type) {
    const value = (node.type as { displayName?: unknown }).displayName;
    return typeof value === "string" ? value : "";
  }
  return "";
}

function isElementNamed(node: React.ReactNode, displayName: string) {
  return React.isValidElement(node) && getElementDisplayName(node) === displayName;
}

function flattenElements(children: React.ReactNode): React.ReactElement[] {
  const nodes: React.ReactElement[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const element = child as React.ReactElement<{ children?: React.ReactNode }>;
    if (element.type === React.Fragment) {
      nodes.push(...flattenElements(element.props.children));
      return;
    }
    nodes.push(element);
  });
  return nodes;
}

function elementChildren(element: React.ReactElement): React.ReactNode {
  return (element.props as { children?: React.ReactNode }).children;
}

function hasInteractiveContent(node: React.ReactNode): boolean {
  if (node === null || node === undefined || typeof node === "boolean") return false;
  if (typeof node === "string" || typeof node === "number" || typeof node === "bigint") return false;
  if (Array.isArray(node)) return node.some((item) => hasInteractiveContent(item));
  if (!React.isValidElement(node)) return false;

  const element = node as React.ReactElement<{ children?: React.ReactNode; role?: string }>;
  const name = getElementDisplayName(element);

  if (element.type === React.Fragment) {
    return hasInteractiveContent(element.props.children);
  }

  if (typeof element.type === "string") {
    if (["button", "a", "input", "select", "textarea"].includes(element.type)) {
      return true;
    }
  } else if (/(Button|Trigger|Select|Checkbox|Switch|Radio|Combobox)/i.test(name)) {
    return true;
  }

  if (typeof element.props.role === "string") {
    if (["button", "link", "checkbox", "switch", "radio", "tab", "menuitem"].includes(element.props.role)) {
      return true;
    }
  }

  return hasInteractiveContent(element.props.children);
}

function resolveAlign(className?: string) {
  if (!className) return "left" as const;
  if (className.includes("text-right")) return "right" as const;
  if (className.includes("text-center")) return "center" as const;
  return "left" as const;
}

function parseFrappeTable(children: React.ReactNode): ParsedFrappeTable | null {
  const sections = flattenElements(children);
  const headerSection = sections.find((node) => isElementNamed(node, "TableHeader"));
  const bodySection = sections.find((node) => isElementNamed(node, "TableBody"));
  const hasUnsupportedSections = sections.some(
    (node) => isElementNamed(node, "TableFooter") || isElementNamed(node, "TableCaption"),
  );

  if (!headerSection || !bodySection || hasUnsupportedSections) {
    return null;
  }

  const headerRows = flattenElements(elementChildren(headerSection)).filter((node) =>
    isElementNamed(node, "TableRow"),
  );
  if (headerRows.length !== 1) {
    return null;
  }

  const headerCells = flattenElements(elementChildren(headerRows[0])).filter((node) =>
    isElementNamed(node, "TableHead"),
  );
  if (headerCells.length === 0) {
    return null;
  }

  const columns: FrappeListViewColumn<ParsedFrappeRow>[] = [];
  for (let index = 0; index < headerCells.length; index += 1) {
    const cell = headerCells[index];
    const props = cell.props as React.ComponentProps<"th">;
    const colSpan = props.colSpan ?? 1;
    const rowSpan = props.rowSpan ?? 1;
    if (colSpan !== 1 || rowSpan !== 1) {
      return null;
    }
    if (hasInteractiveContent(props.children)) {
      return null;
    }

    columns.push({
      key: `col_${index}`,
      label: props.children,
      align: resolveAlign(props.className),
      width: "max-content",
    });
  }

  const bodyRows = flattenElements(elementChildren(bodySection)).filter((node) =>
    isElementNamed(node, "TableRow"),
  );

  const rows: ParsedFrappeRow[] = [];
  for (let rowIndex = 0; rowIndex < bodyRows.length; rowIndex += 1) {
    const row = bodyRows[rowIndex];
    const rowProps = row.props as React.ComponentProps<"tr">;
    const cells = flattenElements(rowProps.children).filter((node) =>
      isElementNamed(node, "TableCell"),
    );

    if (cells.length !== columns.length) {
      return null;
    }

    const nextRow: ParsedFrappeRow = {
      __rowId: `row-${rowIndex}`,
    };

    for (let columnIndex = 0; columnIndex < cells.length; columnIndex += 1) {
      const cell = cells[columnIndex];
      const cellProps = cell.props as React.ComponentProps<"td">;
      const colSpan = cellProps.colSpan ?? 1;
      const rowSpan = cellProps.rowSpan ?? 1;
      if (colSpan !== 1 || rowSpan !== 1) {
        return null;
      }
      if (hasInteractiveContent(cellProps.children)) {
        return null;
      }

      nextRow[`col_${columnIndex}`] = {
        className: cellProps.className,
        content: cellProps.children,
      } satisfies ParsedFrappeCell;
    }

    rows.push(nextRow);
  }

  const columnWidths = computeListViewColumnWidths({
    columns,
    rows,
    getCellContent: (row, column) => {
      const value = row[column.key];
      if (value && typeof value === "object" && "content" in (value as Record<string, unknown>)) {
        return (value as ParsedFrappeCell).content;
      }
      return value;
    },
    primaryColumnKeys: inferPrimaryColumnKeys(columns),
  });

  return {
    columns: columns.map((column) => ({
      ...column,
      width: columnWidths[column.key] ?? column.width,
    })),
    rows,
  };
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
      selectableRows = false,
      edgeToEdge = false,
      tabletScrollable = true,
      tabletStickyFirstColumn = false,
      tabletMinTableWidth = "100%",
      style: tableStyle,
      children,
      ...props
    },
    ref,
  ) => {
    const [internalMode, setInternalMode] = React.useState<TableMode>(defaultMode);
    const [internalPage, setInternalPage] = React.useState(1);
    const [internalPageSize, setInternalPageSize] = React.useState(defaultPageSize);
    const [measuredRowCount, setMeasuredRowCount] = React.useState(0);

    const parsedFrappeTable = React.useMemo(() => parseFrappeTable(children), [children]);
    const mode = modeProp ?? internalMode;
    const page = pageProp ?? internalPage;
    const pageSize = pageSizeProp ?? internalPageSize;
    const resolvedMeasuredCount = parsedFrappeTable ? parsedFrappeTable.rows.length : measuredRowCount;
    const rowCount = totalRows ?? resolvedMeasuredCount;
    const pageCount = Math.max(1, Math.ceil(Math.max(rowCount, 1) / pageSize));
    const visibleFrappeRows = React.useMemo(() => {
      if (!parsedFrappeTable) return [];
      const parsedRows = parsedFrappeTable.rows;
      if (enablePagination && mode === "paginated" && !manualPagination) {
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        return parsedRows.slice(start, end);
      }
      return parsedRows;
    }, [enablePagination, manualPagination, mode, page, pageSize, parsedFrappeTable]);

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
            {parsedFrappeTable ? (
              <FrappeListViewAdapter
                className={cn(
                  "w-full text-sm",
                  tabletScrollable &&
                  "md:max-lg:w-max md:max-lg:min-w-[var(--table-tablet-min-width)]",
                  className,
                )}
                style={tableStyle}
                columns={parsedFrappeTable.columns}
                rows={visibleFrappeRows}
                rowKey="__rowId"
                selectable={selectableRows}
                resizeColumn={false}
                showTooltip={false}
                cellRenderer={({ item }) => {
                  if (item && typeof item === "object" && "content" in (item as Record<string, unknown>)) {
                    const cell = item as ParsedFrappeCell;
                    return <div className={cn("text-table-cell", cell.className)}>{cell.content}</div>;
                  }
                  return item as React.ReactNode;
                }}
              />
            ) : (
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
              >
                {children}
              </table>
            )}
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
        "border border-[var(--table-divider)] px-[var(--table-gutter-x)] py-1.5 text-left align-middle text-[12px] font-semibold tracking-[0.03em] uppercase [&:has([role=checkbox])]:pr-0",
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
        "border border-[var(--table-divider)] px-[var(--table-gutter-x)] py-1.5 align-middle text-table-cell [&:has([role=checkbox])]:pr-0",
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

