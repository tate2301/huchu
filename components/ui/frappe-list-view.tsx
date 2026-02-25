"use client";

import * as React from "react";
import {
  ListContext,
  ListEmptyState,
  ListGroups,
  ListHeader,
  ListRows,
  ListSelectBanner,
  ListView,
} from "@rtcamp/frappe-ui-react";
import { cn } from "@/lib/utils";

type FrappeListViewAlign = "left" | "center" | "right";

export type FrappeListViewColumn<TRow extends Record<string, unknown>> = {
  key: keyof TRow & string;
  label: React.ReactNode;
  align?: FrappeListViewAlign;
  width?: number | string;
};

type FrappeListViewCellContext<TRow extends Record<string, unknown>> = {
  row: TRow;
  column: FrappeListViewColumn<TRow>;
  item: unknown;
  align: string;
};

type FrappeListViewEmptyState = {
  title: string;
  description: string;
  button?: {
    label: string;
    onClick: () => void;
  };
};

export type FrappeListViewAdapterProps<TRow extends Record<string, unknown>> = {
  columns: FrappeListViewColumn<TRow>[];
  rows: TRow[];
  rowKey: keyof TRow & string;
  className?: string;
  style?: React.CSSProperties;
  emptyState?: FrappeListViewEmptyState;
  selectable?: boolean;
  selectionText?: (count: number) => string;
  rowHeight?: number | string;
  resizeColumn?: boolean;
  showTooltip?: boolean;
  autoFitColumns?: boolean;
  onRowClick?: (row: TRow, event: React.MouseEvent) => void;
  cellRenderer?: (context: FrappeListViewCellContext<TRow>) => React.ReactNode;
  onSelectionChange?: (rows: TRow[]) => void;
  onSelectionMetaChange?: (meta: {
    clearSelection: () => void;
    selectAll: () => void;
    allRowsSelected: boolean;
  }) => void;
  selectionBannerActions?: (context: {
    selectedRows: TRow[];
    clearSelection: () => void;
    selectAll: () => void;
    allRowsSelected: boolean;
  }) => React.ReactNode;
};

function parseBaseWidthPx(width: number | string | undefined): number | undefined {
  if (typeof width === "number") return width;
  if (typeof width !== "string") return undefined;

  const minMaxMatch = width.match(/^minmax\(\s*([\d.]+)px\s*,\s*([^)]+)\)$/i);
  if (minMaxMatch) {
    return Number(minMaxMatch[1]);
  }

  const pxMatch = width.match(/^([\d.]+)px$/i);
  if (pxMatch) {
    return Number(pxMatch[1]);
  }

  return undefined;
}

function mergeColumnWidth(
  width: number | string | undefined,
  measuredWidthPx: number | undefined,
): number | string | undefined {
  if (!measuredWidthPx || !Number.isFinite(measuredWidthPx)) {
    return width;
  }

  const safeMeasuredWidth = Math.max(0, Math.ceil(measuredWidthPx));
  if (typeof width === "number") {
    return `${Math.max(width, safeMeasuredWidth)}px`;
  }
  if (typeof width === "string") {
    const minMaxMatch = width.match(/^minmax\(\s*([\d.]+)px\s*,\s*([^)]+)\)$/i);
    if (minMaxMatch) {
      const minPx = Number(minMaxMatch[1]);
      const maxPart = minMaxMatch[2];
      return `minmax(${Math.max(minPx, safeMeasuredWidth)}px,${maxPart})`;
    }
    const pxMatch = width.match(/^([\d.]+)px$/i);
    if (pxMatch) {
      const px = Number(pxMatch[1]);
      return `${Math.max(px, safeMeasuredWidth)}px`;
    }
  }
  return `${safeMeasuredWidth}px`;
}

type SelectionSyncProps<TRow extends Record<string, unknown>> = {
  rowByKey: Map<unknown, TRow>;
  onSelectionChange?: (rows: TRow[]) => void;
  onSelectionMetaChange?: (meta: {
    clearSelection: () => void;
    selectAll: () => void;
    allRowsSelected: boolean;
  }) => void;
};

function SelectionSync<TRow extends Record<string, unknown>>({
  rowByKey,
  onSelectionChange,
  onSelectionMetaChange,
}: SelectionSyncProps<TRow>) {
  const list = React.useContext(ListContext);
  const selections = list.options?.selections;
  const selectionSignatureRef = React.useRef<string>("");

  React.useEffect(() => {
    if (!onSelectionChange || !selections) return;
    const keys = Array.from(selections).map((key) => String(key)).sort();
    const nextSignature = keys.join("|");
    if (nextSignature === selectionSignatureRef.current) return;
    selectionSignatureRef.current = nextSignature;
    const selectedRows = Array.from(selections)
      .map((key) => rowByKey.get(key))
      .filter((row): row is TRow => Boolean(row));
    onSelectionChange(selectedRows);
  }, [onSelectionChange, rowByKey, selections]);

  React.useEffect(() => {
    if (!onSelectionMetaChange || !list.options) return;
    onSelectionMetaChange({
      clearSelection: () => list.options?.toggleAllRows(false),
      selectAll: () => list.options?.toggleAllRows(true),
      allRowsSelected: list.options.allRowsSelected,
    });
  }, [list.options, onSelectionMetaChange]);

  return null;
}

export function FrappeListViewAdapter<TRow extends Record<string, unknown>>({
  columns,
  rows,
  rowKey,
  className,
  style,
  emptyState,
  selectable = false,
  selectionText,
  rowHeight = "auto",
  resizeColumn = false,
  showTooltip = false,
  autoFitColumns = true,
  onRowClick,
  cellRenderer,
  onSelectionChange,
  onSelectionMetaChange,
  selectionBannerActions,
}: FrappeListViewAdapterProps<TRow>) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const [measuredColumnWidths, setMeasuredColumnWidths] = React.useState<Record<string, number>>({});

  const columnSignature = React.useMemo(
    () => columns.map((column) => `${column.key}:${String(column.width ?? "")}`).join("|"),
    [columns],
  );

  React.useEffect(() => {
    setMeasuredColumnWidths({});
  }, [columnSignature]);

  const resolvedColumns = React.useMemo(() => {
    return columns.map((column) => ({
      ...column,
      width: mergeColumnWidth(column.width, measuredColumnWidths[column.key]),
    }));
  }, [columns, measuredColumnWidths]);

  React.useEffect(() => {
    if (!autoFitColumns || rows.length === 0 || columns.length === 0) return;

    const host = hostRef.current;
    if (!host) return;

    let rafId: number | null = null;

    const measure = () => {
      const grids = Array.from(host.querySelectorAll<HTMLElement>(".huchu-listview-compact .grid.items-center"));
      if (grids.length === 0) return;

      const selectionOffset = selectable ? 1 : 0;

      setMeasuredColumnWidths((previous) => {
        const next = { ...previous };
        let changed = false;

        for (let index = 0; index < columns.length; index += 1) {
          const column = columns[index];
          const columnKey = String(column.key);
          const configuredMinWidth = parseBaseWidthPx(column.width) ?? 0;
          let requiredWidth = Math.max(configuredMinWidth, previous[columnKey] ?? 0);

          for (const grid of grids) {
            const columnCell = grid.children.item(index + selectionOffset) as HTMLElement | null;
            if (!columnCell) continue;

            const inner = columnCell.firstElementChild as HTMLElement | null;
            const candidateScrollWidth = Math.max(
              columnCell.scrollWidth,
              inner?.scrollWidth ?? 0,
            );
            const hasHorizontalOverflow = candidateScrollWidth - columnCell.clientWidth > 1;
            if (!hasHorizontalOverflow) continue;

            requiredWidth = Math.max(requiredWidth, Math.ceil(candidateScrollWidth + 8));
          }

          if (requiredWidth > (previous[columnKey] ?? 0) + 1) {
            next[columnKey] = requiredWidth;
            changed = true;
          }
        }

        return changed ? next : previous;
      });
    };

    const scheduleMeasure = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        measure();
      });
    };

    scheduleMeasure();
    const resizeObserver = new ResizeObserver(() => {
      scheduleMeasure();
    });
    resizeObserver.observe(host);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      resizeObserver.disconnect();
    };
  }, [autoFitColumns, columns, rows, selectable]);

  const rowByKey = React.useMemo(() => {
    const map = new Map<unknown, TRow>();
    for (const row of rows) {
      map.set(row[rowKey], row);
    }
    return map;
  }, [rowKey, rows]);

  const showGroupedRows = React.useMemo(
    () =>
      rows.length > 0 &&
      rows.every(
        (row) =>
          typeof row === "object" &&
          row !== null &&
          "group" in row &&
          "rows" in row &&
          Array.isArray((row as { rows?: unknown }).rows),
      ),
    [rows],
  );

  const options = React.useMemo(
    () => ({
      emptyState,
      slots: cellRenderer
        ? {
            cell: ({
              row,
              column,
              item,
              align,
            }: {
              row: unknown;
              column: unknown;
              item: unknown;
              align: string;
            }) =>
              cellRenderer({
                row: row as TRow,
                column: column as FrappeListViewColumn<TRow>,
                item,
                align,
              }),
          }
        : undefined,
      options: {
        selectable,
        selectionText,
        rowHeight,
        resizeColumn,
        showTooltip,
        onRowClick: onRowClick as ((row: unknown, event: React.MouseEvent) => void) | undefined,
      },
    }),
    [cellRenderer, emptyState, onRowClick, resizeColumn, rowHeight, selectable, selectionText, showTooltip],
  );

  return (
    <div ref={hostRef}>
      <ListView
        columns={resolvedColumns as unknown[]}
        rows={rows as unknown[]}
        rowKey={rowKey}
        options={options}
        className={cn("huchu-listview-compact !w-full !min-w-full", className)}
        style={style}
      >
        <>
          <SelectionSync
            rowByKey={rowByKey}
            onSelectionChange={onSelectionChange}
            onSelectionMetaChange={onSelectionMetaChange}
          />
          <ListHeader />
          {rows.length > 0 ? showGroupedRows ? <ListGroups /> : <ListRows /> : <ListEmptyState />}
          {selectable ? (
            <ListSelectBanner
              actions={
                selectionBannerActions
                  ? ({ selections, selectAll, unselectAll, allRowsSelected }) => {
                      const selectedRows = Array.from(selections)
                        .map((key) => rowByKey.get(key))
                        .filter((row): row is TRow => Boolean(row));
                      return selectionBannerActions({
                        selectedRows,
                        clearSelection: unselectAll,
                        selectAll,
                        allRowsSelected,
                      });
                    }
                  : undefined
              }
            />
          ) : null}
        </>
      </ListView>
    </div>
  );
}
