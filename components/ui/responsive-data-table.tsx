"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, type DataTableProps } from "./data-table";
import { DataTableMobile } from "./data-table-mobile";
import { useMediaQuery } from "@/hooks/use-media-query";

type ResponsiveDataTableProps<TData, TValue> = DataTableProps<TData, TValue> & {
  /** Breakpoint below which mobile view is shown. Defaults to 'md' (768px) */
  mobileBreakpoint?: "sm" | "md" | "lg";
  /** Force a specific view mode */
  forceMode?: "desktop" | "mobile";
};

/**
 * Responsive data table that automatically switches between
 * desktop table view and mobile card view based on screen size.
 *
 * For screens below the breakpoint (default: md/768px),
 * renders cards optimized for mobile. Otherwise renders
 * the full desktop table.
 */
export function ResponsiveDataTable<TData, TValue>({
  mobileBreakpoint = "md",
  forceMode,
  ...props
}: ResponsiveDataTableProps<TData, TValue>) {
  // Media query based on breakpoint
  const breakpointQuery = React.useMemo(() => {
    switch (mobileBreakpoint) {
      case "sm":
        return "(min-width: 640px)";
      case "md":
        return "(min-width: 768px)";
      case "lg":
        return "(min-width: 1024px)";
      default:
        return "(min-width: 768px)";
    }
  }, [mobileBreakpoint]);

  const isDesktop = useMediaQuery(breakpointQuery);

  // Determine which view to show
  const showDesktop = forceMode === "desktop" || (forceMode !== "mobile" && isDesktop);

  if (showDesktop) {
    return <DataTable {...props} />;
  }

  // Mobile view - we need to create a simplified table instance
  // to pass to DataTableMobile
  return (
    <div className="space-y-3">
      {/* Toolbar with search/filters */}
      {props.toolbar && (
        <div className="flex flex-col gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] p-3">
          {props.toolbar}
        </div>
      )}

      {/* Search if enabled */}
      {props.searchPlaceholder && (
        <div className="flex gap-2">
          <input
            type="text"
            placeholder={props.searchPlaceholder}
            className="flex-1 rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm"
          />
        </div>
      )}

      {/* Mobile cards - simplified version */}
      <div className="space-y-3">
        {props.data.length === 0 ? (
          <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] p-8 text-center">
            <p className="text-sm text-[var(--text-muted)]">
              {props.noResultsText || "No records found."}
            </p>
          </div>
        ) : (
          props.data.map((row, idx) => {
            // Render mobile card for each row
            const visibleColumns = props.columns.filter((col) => {
              const def = col as { id?: string; header?: unknown };
              const columnId = (def.id || `col-${idx}`).toLowerCase();
              return columnId !== "actions" && columnId !== "action";
            });

            return (
              <div
                key={idx}
                className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] p-4"
              >
                <div className="space-y-3">
                  {visibleColumns.slice(0, 4).map((column, colIdx) => {
                    const def = column as {
                      id?: string;
                      header?: unknown;
                      accessorKey?: string;
                      cell?: unknown;
                    };
                    const columnId = def.id || def.accessorKey || `col-${colIdx}`;

                    // Get column label
                    let label = "";
                    if (typeof def.header === "string") {
                      label = def.header;
                    } else if (def.accessorKey) {
                      label = def.accessorKey
                        .split(/[._-]/)
                        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                        .join(" ");
                    }

                    // Get cell value
                    let value: React.ReactNode = "";
                    if (typeof def.accessorKey === "string") {
                      const keys = def.accessorKey.split(".");
                      let current: any = row;
                      for (const key of keys) {
                        current = current?.[key];
                      }
                      value = String(current ?? "");
                    }

                    // If custom cell renderer exists, use it
                    if (typeof def.cell === "function") {
                      try {
                        value = def.cell({ row: { original: row }, getValue: () => value } as any);
                      } catch {
                        // Fallback to raw value if cell function fails
                      }
                    }

                    return (
                      <div key={columnId} className="flex flex-col gap-1">
                        <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                          {label || columnId}
                        </span>
                        <div className="text-sm text-[var(--text-strong)]">{value}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {props.pagination?.enabled && props.data.length > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] p-3">
          <span className="text-xs text-[var(--text-muted)]">
            Page {props.queryState?.page || 1}
          </span>
          <div className="flex gap-2">
            <button
              className="rounded-lg border border-[var(--border-default)] px-3 py-1 text-sm disabled:opacity-50"
              disabled={(props.queryState?.page || 1) <= 1}
            >
              Previous
            </button>
            <button className="rounded-lg border border-[var(--border-default)] px-3 py-1 text-sm">
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
