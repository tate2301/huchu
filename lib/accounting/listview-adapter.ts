import type { ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";

export type ListViewColumnDefinition<TData> = {
  key: string;
  label: string;
  width?: string;
  align?: "left" | "center" | "right";
  columnDef: ColumnDef<TData, unknown>;
};

function resolveHeaderLabel<TData>(column: ColumnDef<TData, unknown>): string {
  const columnWithMeta = column as ColumnDef<TData, unknown> & { id?: string; accessorKey?: string };
  if (typeof columnWithMeta.header === "string") {
    return columnWithMeta.header;
  }
  if (typeof columnWithMeta.id === "string") {
    return columnWithMeta.id;
  }
  if (typeof columnWithMeta.accessorKey === "string") {
    return columnWithMeta.accessorKey;
  }
  return "";
}

function resolveColumnKey<TData>(column: ColumnDef<TData, unknown>, index: number): string {
  const columnWithMeta = column as ColumnDef<TData, unknown> & {
    id?: string;
    accessorKey?: string;
  };
  if (typeof columnWithMeta.id === "string" && columnWithMeta.id.length > 0) {
    return columnWithMeta.id;
  }
  if (typeof columnWithMeta.accessorKey === "string" && columnWithMeta.accessorKey.length > 0) {
    return columnWithMeta.accessorKey;
  }
  return `column_${index}`;
}

function resolveWidth<TData>(column: ColumnDef<TData, unknown>): string | undefined {
  const sized = column as ColumnDef<TData, unknown> & { size?: number };
  if (typeof sized.size === "number") {
    return `${sized.size}px`;
  }
  return undefined;
}

function resolveAlign<TData>(column: ColumnDef<TData, unknown>): "left" | "center" | "right" {
  const keyed = (column as { id?: string; accessorKey?: string }).id ??
    (column as { accessorKey?: string }).accessorKey ??
    "";
  if (typeof keyed === "string") {
    const normalized = keyed.toLowerCase();
    if (
      normalized.includes("amount") ||
      normalized.includes("total") ||
      normalized.includes("debit") ||
      normalized.includes("credit") ||
      normalized.includes("balance") ||
      normalized.includes("rate") ||
      normalized.includes("qty") ||
      normalized.includes("quantity") ||
      normalized.includes("count") ||
      normalized.includes("value")
    ) {
      return "right";
    }
  }
  return "left";
}

export function adaptColumnsForListView<TData>(
  columns: ColumnDef<TData, unknown>[],
): ListViewColumnDefinition<TData>[] {
  return columns.map((column, index) => ({
    key: resolveColumnKey(column, index),
    label: resolveHeaderLabel(column),
    width: resolveWidth(column),
    align: resolveAlign(column),
    columnDef: column,
  }));
}

function resolveCellValue<TData>(
  row: TData,
  column: ColumnDef<TData, unknown>,
  fallbackKey: string,
): unknown {
  const columnWithAccessor = column as ColumnDef<TData, unknown> & {
    accessorKey?: string;
    accessorFn?: (item: TData) => unknown;
  };

  if (typeof columnWithAccessor.accessorFn === "function") {
    return columnWithAccessor.accessorFn(row);
  }

  if (typeof columnWithAccessor.accessorKey === "string" && columnWithAccessor.accessorKey.length > 0) {
    return (row as Record<string, unknown>)[columnWithAccessor.accessorKey];
  }

  return (row as Record<string, unknown>)[fallbackKey];
}

export function renderColumnCell<TData>(
  column: ListViewColumnDefinition<TData>,
  row: TData,
  rowIndex: number,
): ReactNode {
  const cell = column.columnDef.cell as ((context: {
    row: { original: TData; index: number };
    getValue: () => unknown;
  }) => ReactNode) | undefined;

  const value = resolveCellValue(row, column.columnDef, column.key);
  if (typeof cell === "function") {
    return cell({
      row: { original: row, index: rowIndex },
      getValue: () => value,
    });
  }

  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

