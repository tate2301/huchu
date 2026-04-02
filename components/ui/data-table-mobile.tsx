"use client";

import * as React from "react";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronRight } from "@/lib/icons";
import { cn } from "@/lib/utils";

type DataTableMobileProps<TData> = {
  rows: Row<TData>[];
  columns: ColumnDef<TData, unknown>[];
  onRowSelect?: (row: Row<TData>, selected: boolean) => void;
  selectedRows?: Set<string>;
  expansionConfig?: {
    canExpand?: (row: TData) => boolean;
    renderExpandedContent?: (row: TData) => React.ReactNode;
    expandedRowIds?: Set<string>;
    onToggleExpansion?: (rowId: string) => void;
  };
  emptyText?: string;
  className?: string;
};

function isActionColumn(columnId: string, header: unknown): boolean {
  const id = columnId.toLowerCase();
  if (id === "actions" || id === "action") return true;
  if (typeof header === "string" && header.toLowerCase().trim() === "actions") return true;
  return false;
}

function getColumnLabel(column: ColumnDef<TData, unknown>, id: string): string {
  const def = column as { header?: unknown; accessorKey?: string };
  if (typeof def.header === "string") return def.header;
  if (typeof def.accessorKey === "string") {
    return def.accessorKey
      .split(/[._-]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }
  return id
    .split(/[._-]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function DataTableMobile<TData>({
  rows,
  columns,
  onRowSelect,
  selectedRows,
  expansionConfig,
  emptyText = "No records found.",
  className,
}: DataTableMobileProps<TData>) {
  const [expandedCards, setExpandedCards] = React.useState<Set<string>>(new Set());

  const toggleCardExpansion = React.useCallback(
    (rowId: string) => {
      setExpandedCards((prev) => {
        const next = new Set(prev);
        if (next.has(rowId)) {
          next.delete(rowId);
        } else {
          next.add(rowId);
        }
        return next;
      });
      expansionConfig?.onToggleExpansion?.(rowId);
    },
    [expansionConfig],
  );

  // Filter out action columns and get visible data columns
  const dataColumns = React.useMemo(
    () =>
      columns.filter((col, idx) => {
        const columnDef = col as { id?: string; header?: unknown };
        const columnId = columnDef.id ?? `column-${idx}`;
        return !isActionColumn(columnId, columnDef.header);
      }),
    [columns],
  );

  // Find action column if it exists
  const actionColumn = React.useMemo(
    () =>
      columns.find((col, idx) => {
        const columnDef = col as { id?: string; header?: unknown };
        const columnId = columnDef.id ?? `column-${idx}`;
        return isActionColumn(columnId, columnDef.header);
      }),
    [columns],
  );

  if (rows.length === 0) {
    return (
      <div className={cn("rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] p-8 text-center", className)}>
        <p className="text-sm text-[var(--text-muted)]">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {rows.map((row) => {
        const rowId = row.id;
        const isSelected = selectedRows?.has(rowId) ?? false;
        const canExpand = expansionConfig?.canExpand?.(row.original) ?? false;
        const isExpanded = expansionConfig?.expandedRowIds?.has(rowId) ?? expandedCards.has(rowId);

        return (
          <Card
            key={rowId}
            className={cn(
              "overflow-hidden transition-colors",
              isSelected && "ring-2 ring-[var(--primary)] ring-offset-2",
            )}
          >
            <CardContent className="p-4">
              <div className="space-y-3">
                {/* Primary data fields */}
                {dataColumns.slice(0, 4).map((column, colIdx) => {
                  const cell = row.getVisibleCells()[colIdx];
                  if (!cell) return null;

                  const columnDef = column as { id?: string; header?: unknown; cell?: unknown };
                  const columnId = columnDef.id ?? `col-${colIdx}`;
                  const label = getColumnLabel(column, columnId);

                  return (
                    <div key={columnId} className="flex flex-col gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                        {label}
                      </span>
                      <div className="text-sm text-[var(--text-strong)]">
                        {typeof columnDef.cell === "function"
                          ? columnDef.cell({ row, getValue: () => cell.getValue() } as any)
                          : String(cell.getValue() ?? "")}
                      </div>
                    </div>
                  );
                })}

                {/* Show expandable indicator if more than 4 columns */}
                {dataColumns.length > 4 && !isExpanded && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleCardExpansion(rowId)}
                    className="w-full justify-center"
                  >
                    <ChevronRight className="mr-2 h-4 w-4" />
                    Show {dataColumns.length - 4} more field{dataColumns.length - 4 !== 1 ? "s" : ""}
                  </Button>
                )}

                {/* Expanded additional fields */}
                {isExpanded && dataColumns.length > 4 && (
                  <>
                    {dataColumns.slice(4).map((column, colIdx) => {
                      const actualColIdx = colIdx + 4;
                      const cell = row.getVisibleCells()[actualColIdx];
                      if (!cell) return null;

                      const columnDef = column as { id?: string; header?: unknown; cell?: unknown };
                      const columnId = columnDef.id ?? `col-${actualColIdx}`;
                      const label = getColumnLabel(column, columnId);

                      return (
                        <div key={columnId} className="flex flex-col gap-1">
                          <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                            {label}
                          </span>
                          <div className="text-sm text-[var(--text-strong)]">
                            {typeof columnDef.cell === "function"
                              ? columnDef.cell({ row, getValue: () => cell.getValue() } as any)
                              : String(cell.getValue() ?? "")}
                          </div>
                        </div>
                      );
                    })}

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleCardExpansion(rowId)}
                      className="w-full justify-center"
                    >
                      <ChevronDown className="mr-2 h-4 w-4" />
                      Show less
                    </Button>
                  </>
                )}

                {/* Custom expansion content */}
                {canExpand && expansionConfig?.renderExpandedContent && (
                  <div className="border-t border-[var(--border-default)] pt-3">
                    {expansionConfig.renderExpandedContent(row.original)}
                  </div>
                )}

                {/* Action buttons */}
                {actionColumn && (
                  <div className="flex flex-wrap gap-2 border-t border-[var(--border-default)] pt-3">
                    {(() => {
                      const columnDef = actionColumn as { cell?: unknown };
                      const cells = row.getVisibleCells();
                      const actionCell = cells[cells.length - 1];
                      if (!actionCell || !columnDef.cell || typeof columnDef.cell !== "function") {
                        return null;
                      }
                      return columnDef.cell({ row, getValue: () => actionCell.getValue() } as any);
                    })()}
                  </div>
                )}

                {/* Selection indicator */}
                {onRowSelect && (
                  <div className="flex items-center gap-2 border-t border-[var(--border-default)] pt-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => onRowSelect(row, e.target.checked)}
                      className="h-4 w-4 rounded border-[var(--border-default)] accent-[var(--primary)]"
                      aria-label={`Select row ${row.index + 1}`}
                    />
                    <span className="text-xs text-[var(--text-muted)]">
                      {isSelected ? "Selected" : "Select this item"}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
