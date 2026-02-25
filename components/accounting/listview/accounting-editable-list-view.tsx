"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { ListView } from "@rtcamp/frappe-ui-react";
import { Button } from "@/components/ui/button";

type EditableListColumn<TData> = {
  key: string;
  label: string;
  width?: string;
  align?: "left" | "center" | "right";
  renderCell: (context: { row: TData; rowIndex: number }) => ReactNode;
};

type AccountingEditableListViewProps<TData> = {
  title: string;
  addLabel?: string;
  onAddRow?: () => void;
  rows: TData[];
  getRowKey?: (row: TData, index: number) => string;
  columns: EditableListColumn<TData>[];
  footer?: ReactNode;
  selectable?: boolean;
};

type InternalRow<TData> = {
  __list_row_key: string;
  __row_index: number;
  __original: TData;
} & Record<string, unknown>;

export function AccountingEditableListView<TData>({
  title,
  addLabel = "Add Row",
  onAddRow,
  rows,
  getRowKey,
  columns,
  footer,
  selectable = true,
}: AccountingEditableListViewProps<TData>) {
  const internalRows = useMemo<InternalRow<TData>[]>(() => {
    return rows.map((row, index) => ({
      ...(row as Record<string, unknown>),
      __list_row_key: getRowKey ? getRowKey(row, index) : `row_${index}`,
      __row_index: index,
      __original: row,
    }));
  }, [rows, getRowKey]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {onAddRow ? (
          <Button type="button" size="sm" variant="outline" onClick={onAddRow}>
            {addLabel}
          </Button>
        ) : null}
      </div>

      <ListView
        columns={columns.map((column) => ({
          key: column.key,
          label: column.label,
          width: column.width,
          align: column.align ?? "left",
        }))}
        rows={internalRows}
        rowKey="__list_row_key"
        options={{
          emptyState: {
            title: "No rows",
            description: "",
          },
          options: {
            selectable,
            showTooltip: false,
            rowHeight: 48,
          },
          slots: {
            cell: ({ row, column }) => {
              const source = (row as InternalRow<TData>).__original;
              const rowIndex = (row as InternalRow<TData>).__row_index;
              const matched = columns.find((candidate) => candidate.key === column.key);
              if (!matched) return "";
              return matched.renderCell({ row: source, rowIndex });
            },
          },
        }}
      />

      {footer ? <div>{footer}</div> : null}
    </div>
  );
}

export type { EditableListColumn };

