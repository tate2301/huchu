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
  onRowClick,
  cellRenderer,
  onSelectionChange,
  onSelectionMetaChange,
  selectionBannerActions,
}: FrappeListViewAdapterProps<TRow>) {
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
    <ListView
      columns={columns as unknown[]}
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
  );
}
