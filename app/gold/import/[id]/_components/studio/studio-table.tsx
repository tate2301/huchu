"use client";

import {
  useRef,
  useCallback,
  useMemo,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  type OnChangeFn,
  type ColumnDef,
  type Row,
  flexRender,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import { Lock, ChevronDown, ChevronUpIcon, Plus, MoreHorizontal, Trash2, FileText, NoteAdd } from "@/lib/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditableNumber, EditableDate } from "../editable-cells";
import {
  KNOWN_EXPENSE_TYPES,
  expenseWeightFor,
  parseExpenses,
  type Anomaly,
  type LedgerEntry,
} from "../types";
import type { CellCoord } from "./studio-keyboard";

const ROW_H = 40;
const OVERSCAN = 10;

type EntryPatch = {
  parsedDate?: string | null;
  gramsTotal?: number | null;
  expensePatch?: { type: string; weight: number | null };
  boysGrams?: number | null;
  mdaraGrams?: number | null;
  balGrams?: number | null;
};

export type StudioTableHandle = {
  scrollToEntry: (entryId: string) => void;
  getSelectedIds: () => Set<string>;
};

export type StudioTableProps = {
  entries: LedgerEntry[];
  isLocked: boolean;
  anomaliesByEntry: Map<string, Anomaly[]>;
  groupNameForEntry: (entry: LedgerEntry) => string | null;
  onUpdateEntry: (entryId: string, patch: EntryPatch) => void;
  onInsertRowAfter?: (entryId: string) => void;
  onInsertRowBefore?: (entryId: string) => void;
  onDeleteRow?: (entryId: string) => void;
  selectedIds: Set<string>;
  onSelectChange: (ids: Set<string>) => void;
  activeCell: CellCoord | null;
  onActiveCellChange: (coord: CellCoord | null) => void;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  columnWidths: Record<string, number>;
  onColumnWidthChange: (col: string, w: number) => void;
  findQuery: string;
  onLeaderClick?: (leaderName: string) => void;
  onRowCommentClick?: (entryId: string) => void;
};

/**
 * Row state is communicated via a 3-px inset *rail* on the left edge — not by
 * tinting the whole row. The rail's color encodes the dominant signal for the
 * row (anomaly severity wins over committed-success), and the rest of the row
 * keeps its surface untinted so per-cell legibility stays intact (the user
 * explicitly asked us to stop full-row tinting).
 */
const SEVERITY_RAIL = {
  critical: "shadow-[inset_3px_0_0_0_var(--danger-600,#e11d48)]",
  warn: "shadow-[inset_3px_0_0_0_var(--warning-500,#f59e0b)]",
  info: "shadow-[inset_3px_0_0_0_var(--info-500,#0ea5e9)]",
  created: "shadow-[inset_3px_0_0_0_var(--success-500,#10b981)]",
  failed: "shadow-[inset_3px_0_0_0_var(--danger-600,#e11d48)]",
  none: "",
} as const;

function railFor(
  entry: LedgerEntry,
  anomalies: Anomaly[],
): keyof typeof SEVERITY_RAIL {
  if (entry.status === "FAILED") return "failed";
  if (anomalies.some((a) => a.severity === "CRITICAL")) return "critical";
  if (anomalies.some((a) => a.severity === "WARN")) return "warn";
  if (anomalies.some((a) => a.severity === "INFO")) return "info";
  if (entry.status === "CREATED") return "created";
  return "none";
}

function grams(n: number | null | undefined) {
  return n == null ? "—" : n.toFixed(3);
}

function highlight(text: string, query: string) {
  if (!query) return text;
  try {
    const re = new RegExp(`(${query})`, "gi");
    return text.replace(re, "<mark class=\"bg-yellow-200\">$1</mark>");
  } catch {
    return text;
  }
}

export const StudioTable = forwardRef<StudioTableHandle, StudioTableProps>(
  function StudioTable(
    {
      entries,
      isLocked,
      anomaliesByEntry,
      groupNameForEntry,
      onUpdateEntry,
      onInsertRowAfter,
      onInsertRowBefore,
      onDeleteRow,
      selectedIds,
      onSelectChange,
      activeCell,
      onActiveCellChange,
      sorting,
      onSortingChange,
      columnWidths,
      findQuery,
      onLeaderClick,
      onRowCommentClick,
    },
    ref,
  ) {
    const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
    const parentRef = useRef<HTMLDivElement>(null);

    const idToIdx = useMemo(
      () => new Map(entries.map((e, i) => [e.id, i] as const)),
      [entries],
    );

    const columns = useMemo<ColumnDef<LedgerEntry>[]>(
      () => [
        {
          id: "select",
          size: 32,
          enableSorting: false,
          header: () => (
            <input
              type="checkbox"
              checked={
                entries.length > 0 && selectedIds.size === entries.length
              }
              ref={(el) => {
                if (el) {
                  el.indeterminate =
                    selectedIds.size > 0 && selectedIds.size < entries.length;
                }
              }}
              onChange={(e) => {
                if (e.target.checked) {
                  onSelectChange(new Set(entries.map((r) => r.id)));
                } else {
                  onSelectChange(new Set());
                }
              }}
              className="h-3 w-3 accent-[--action-primary-bg]"
              aria-label="Select all"
            />
          ),
          cell: ({ row }) => (
            <input
              type="checkbox"
              checked={selectedIds.has(row.original.id)}
              onChange={() => {
                const next = new Set(selectedIds);
                if (next.has(row.original.id)) next.delete(row.original.id);
                else next.add(row.original.id);
                onSelectChange(next);
              }}
              className="h-3 w-3 accent-[--action-primary-bg]"
              aria-label={`Select row ${row.original.lineNo}`}
            />
          ),
        },
        {
          id: "lineNo",
          accessorKey: "lineNo",
          header: "#",
          size: 36,
          cell: ({ row }) => (
            <span className="font-mono text-[--text-muted]">
              {row.original.lineNo}
            </span>
          ),
        },
        {
          id: "parsedDate",
          accessorKey: "parsedDate",
          header: "Date",
          size: columnWidths["parsedDate"] ?? 90,
          cell: ({ row }) => {
            const rowLocked = isRowLocked(row.original, isLocked);
            return (
              <EditableDate
                value={row.original.parsedDate}
                onSave={(iso) => onUpdateEntry(row.original.id, { parsedDate: iso })}
                disabled={rowLocked}
              />
            );
          },
        },
        {
          id: "parsedName",
          accessorKey: "parsedName",
          header: "Leader / Group",
          size: columnWidths["parsedName"] ?? 140,
          cell: ({ row }) => {
            const groupName = groupNameForEntry(row.original);
            const rawName = row.original.parsedName ?? "—";
            const marked = findQuery
              ? highlight(rawName, findQuery)
              : null;
            return (
              <div
                onContextMenu={
                  onLeaderClick && row.original.parsedName
                    ? (e) => {
                        e.preventDefault();
                        onLeaderClick(row.original.parsedName!);
                      }
                    : undefined
                }
                title={
                  onLeaderClick && row.original.parsedName
                    ? `Right-click to see all rows for ${row.original.parsedName}`
                    : undefined
                }
              >
                <div
                  className="font-mono font-semibold text-[--text-strong]"
                  {...(marked ? { dangerouslySetInnerHTML: { __html: marked } } : {})}
                >
                  {marked ? undefined : rawName}
                </div>
                {groupName ? (
                  <div className="text-[10px] text-[--text-muted]">{groupName}</div>
                ) : (
                  <div className="text-[10px] text-amber-700">not mapped</div>
                )}
              </div>
            );
          },
        },
        {
          id: "gramsTotal",
          accessorKey: "gramsTotal",
          header: "Gross",
          size: columnWidths["gramsTotal"] ?? 80,
          cell: ({ row }) => {
            const rowLocked = isRowLocked(row.original, isLocked);
            return (
              <EditableNumber
                value={row.original.gramsTotal}
                onSave={(n) => onUpdateEntry(row.original.id, { gramsTotal: n })}
                disabled={rowLocked}
              />
            );
          },
        },
        ...KNOWN_EXPENSE_TYPES.map((t) => ({
          id: `exp_${t}`,
          header: t,
          size: columnWidths[`exp_${t}`] ?? 70,
          enableSorting: false,
          cell: ({ row }: { row: Row<LedgerEntry> }) => {
            const expenses = parseExpenses(row.original.expensesJson);
            const rowLocked = isRowLocked(row.original, isLocked);
            return (
              <EditableNumber
                value={expenseWeightFor(t, expenses)}
                onSave={(n) =>
                  onUpdateEntry(row.original.id, {
                    expensePatch: { type: t, weight: n },
                  })
                }
                disabled={rowLocked}
              />
            );
          },
        })),
        {
          id: "boysGrams",
          accessorKey: "boysGrams",
          header: "W: Workers",
          size: columnWidths["boysGrams"] ?? 80,
          cell: ({ row }) => {
            const rowLocked = isRowLocked(row.original, isLocked);
            return (
              <EditableNumber
                value={row.original.boysGrams}
                onSave={(n) =>
                  onUpdateEntry(row.original.id, { boysGrams: n })
                }
                disabled={rowLocked}
                className="text-sky-800"
              />
            );
          },
        },
        {
          id: "mdaraGrams",
          accessorKey: "mdaraGrams",
          header: "C: Company",
          size: columnWidths["mdaraGrams"] ?? 80,
          cell: ({ row }) => {
            const rowLocked = isRowLocked(row.original, isLocked);
            return (
              <EditableNumber
                value={row.original.mdaraGrams}
                onSave={(n) =>
                  onUpdateEntry(row.original.id, { mdaraGrams: n })
                }
                disabled={rowLocked}
                className="text-emerald-800"
              />
            );
          },
        },
        {
          id: "balGrams",
          accessorKey: "balGrams",
          header: "Bal",
          size: columnWidths["balGrams"] ?? 80,
          cell: ({ row }) => {
            const rowLocked = isRowLocked(row.original, isLocked);
            const val = row.original.balGrams;
            return (
              <EditableNumber
                value={val}
                onSave={(n) =>
                  onUpdateEntry(row.original.id, { balGrams: n })
                }
                disabled={rowLocked}
                className={cn(val != null && val < 0 && "text-rose-700 font-semibold")}
              />
            );
          },
        },
        {
          id: "status",
          accessorKey: "status",
          header: "Status",
          size: columnWidths["status"] ?? 80,
          cell: ({ row }) => (
            <span
              className={cn(
                "rounded border px-1.5 py-0.5 text-[10px] font-medium",
                row.original.status === "CREATED"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : row.original.status === "ANOMALY"
                    ? "border-amber-300 bg-amber-50 text-amber-800"
                    : row.original.status === "FAILED"
                      ? "border-rose-300 bg-rose-50 text-rose-800"
                      : "border-[--border] text-[--text-muted]",
              )}
            >
              {row.original.status}
            </span>
          ),
        },
      ],
      [
        entries,
        isLocked,
        selectedIds,
        onSelectChange,
        groupNameForEntry,
        onUpdateEntry,
        columnWidths,
        findQuery,
      ],
    );

    const table = useReactTable({
      data: entries,
      columns,
      state: { sorting },
      onSortingChange,
      getCoreRowModel: getCoreRowModel(),
      getSortedRowModel: getSortedRowModel(),
      getRowId: (row) => row.id,
      columnResizeMode: "onChange",
      defaultColumn: { minSize: 50 },
    });

    const { rows } = table.getRowModel();

    const rowVirtualizer = useVirtualizer({
      count: rows.length,
      getScrollElement: () => parentRef.current,
      estimateSize: () => ROW_H,
      overscan: OVERSCAN,
    });

    const virtualRows = rowVirtualizer.getVirtualItems();
    const totalSize = rowVirtualizer.getTotalSize();

    // Padding spacer pattern: instead of position:absolute on each tr (which
    // pulls the row out of the table layout and decouples it from <colgroup>
    // widths), reserve top/bottom space with two empty spacer rows. This
    // keeps every visible <tr> inside the normal table flow so column widths
    // come from <colgroup> only — thead and tbody columns stay glued.
    const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
    const paddingBottom =
      virtualRows.length > 0
        ? totalSize - virtualRows[virtualRows.length - 1].end
        : 0;

    useImperativeHandle(ref, () => ({
      scrollToEntry(entryId: string) {
        const idx = idToIdx.get(entryId);
        if (idx != null) {
          rowVirtualizer.scrollToIndex(idx, { behavior: "smooth", align: "center" });
        }
      },
      getSelectedIds() {
        return selectedIds;
      },
    }));

    const handleRowClick = useCallback(
      (e: React.MouseEvent, rowIdx: number, row: LedgerEntry) => {
        if (e.shiftKey) {
          const anchorIdx = entries.findIndex((r) => selectedIds.has(r.id));
          const start = Math.min(anchorIdx === -1 ? rowIdx : anchorIdx, rowIdx);
          const end = Math.max(anchorIdx === -1 ? rowIdx : anchorIdx, rowIdx);
          const next = new Set(selectedIds);
          for (let i = start; i <= end; i++) next.add(entries[i].id);
          onSelectChange(next);
        } else if (e.ctrlKey || e.metaKey) {
          const next = new Set(selectedIds);
          if (next.has(row.id)) next.delete(row.id);
          else next.add(row.id);
          onSelectChange(next);
        }
        onActiveCellChange({ rowIdx, colIdx: 0 });
      },
      [entries, selectedIds, onSelectChange, onActiveCellChange],
    );

    const headerGroups = table.getHeaderGroups();

    const selectionTotals = useMemo(() => {
      let count = 0;
      let gross = 0;
      let bal = 0;
      for (const e of entries) {
        if (!selectedIds.has(e.id)) continue;
        count += 1;
        gross += e.gramsTotal ?? 0;
        bal += e.balGrams ?? 0;
      }
      return { count, gross, bal };
    }, [entries, selectedIds]);

    const totals = useMemo(() => {
      return entries.reduce(
        (acc, e) => {
          const exps = parseExpenses(e.expensesJson);
          const expTotal = exps.reduce((s, x) => s + x.weight, 0);
          return {
            gross: acc.gross + (e.gramsTotal ?? 0),
            workers: acc.workers + (e.boysGrams ?? 0),
            company: acc.company + (e.mdaraGrams ?? 0),
            bal: acc.bal + (e.balGrams != null && e.balGrams < 0 ? e.balGrams : 0),
            expense: acc.expense + expTotal,
          };
        },
        { gross: 0, workers: 0, company: 0, bal: 0, expense: 0 },
      );
    }, [entries]);

    return (
      <div
        ref={parentRef}
        className="flex-1 overflow-auto"
        style={{ contain: "strict" }}
      >
        <table
          className="min-w-full text-[11px] border-collapse"
          style={{ tableLayout: "fixed" }}
        >
          {/*
            Column widths are declared once on the table itself via <colgroup>
            rather than per-th + per-td. Reason: the tbody rows are
            position:absolute (virtualizer pattern) and `tableLayout: fixed`
            normally derives widths from the first row — but an absolute-
            positioned tr is *taken out of the table layout*, so the table's
            column track was effectively only being constructed from the
            thead, and any explicit per-td widths inside the absolute rows
            had to re-align manually. With colgroup the column track is
            authoritative regardless of row positioning, and thead + tbody
            stay glued.
          */}
          <colgroup>
            {headerGroups[0]?.headers.map((header) => (
              <col key={header.id} style={{ width: header.getSize() }} />
            ))}
            <col style={{ width: 80 }} />
          </colgroup>
          <thead className="sticky top-0 z-20 bg-[--surface-muted] backdrop-blur">
            {headerGroups.map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        "border-b border-[--border] px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-[--text-muted] select-none",
                        header.column.getCanSort() && "cursor-pointer hover:text-[--text-strong]",
                      )}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {sorted === "asc" && (
                          <ChevronUpIcon className="h-3 w-3" />
                        )}
                        {sorted === "desc" && (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </div>
                    </th>
                  );
                })}
                {/* Trailing actions column; width owned by colgroup above. */}
                <th
                  className="border-b border-[--border] px-1 py-1.5"
                  aria-hidden="true"
                />
              </tr>
            ))}
          </thead>
          <tbody>
            {paddingTop > 0 && (
              <tr aria-hidden="true" style={{ height: `${paddingTop}px` }}>
                <td colSpan={(headerGroups[0]?.headers.length ?? 12) + 1} />
              </tr>
            )}
            {virtualRows.map((vRow) => {
              const row = rows[vRow.index];
              const entry = row.original;
              const rowAnomalies = anomaliesByEntry.get(entry.id) ?? [];
              const rowIdx = idToIdx.get(entry.id) ?? vRow.index;

              const isHovered = hoveredRowId === entry.id;
              const rowLocked = isRowLocked(entry, isLocked);

              return (
                <tr
                  key={row.id}
                  id={`studio-row-${entry.id}`}
                  data-row-idx={rowIdx}
                  data-row-status={entry.status}
                  style={{ height: `${ROW_H}px` }}
                  className={cn(
                    "group border-b border-[--border] align-middle transition-colors",
                    SEVERITY_RAIL[railFor(entry, rowAnomalies)],
                    selectedIds.has(entry.id) &&
                      "bg-[--action-secondary-bg]/40 shadow-[inset_3px_0_0_0_var(--action-primary-bg)]",
                    isHovered &&
                      !selectedIds.has(entry.id) &&
                      "bg-[--surface-muted]/60",
                    rowLocked && !selectedIds.has(entry.id) && "bg-[--surface-muted]/30",
                  )}
                  onMouseEnter={() => setHoveredRowId(entry.id)}
                  onMouseLeave={() => setHoveredRowId(null)}
                  onClick={(e) => handleRowClick(e, rowIdx, entry)}
                >
                  {row.getVisibleCells().map((cell, colIdx) => {
                    const isActive =
                      activeCell?.rowIdx === rowIdx &&
                      activeCell?.colIdx === colIdx;
                    const cellLocked = isRowLocked(entry, isLocked);
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          "px-2 align-middle overflow-hidden text-sm",
                          isActive &&
                            "ring-1 ring-inset ring-[--action-primary-bg]",
                          colIdx === 1 && "text-[--text-muted]",
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          onActiveCellChange({ rowIdx, colIdx });
                        }}
                      >
                        {cellLocked && colIdx > 2 ? (
                          <span className="flex items-center gap-1 text-[--text-muted]">
                            <Lock className="h-2.5 w-2.5" />
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </span>
                        ) : (
                          flexRender(cell.column.columnDef.cell, cell.getContext())
                        )}
                      </td>
                    );
                  })}

                  {/* Row action column — width owned by colgroup. */}
                  <td
                    className="px-1 align-middle"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div
                      className={cn(
                        "flex items-center justify-end gap-0.5 transition-opacity",
                        isHovered ? "opacity-100" : "opacity-0 pointer-events-none",
                      )}
                    >
                      {onRowCommentClick && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRowCommentClick(entry.id);
                          }}
                          title="View / add comment"
                          className="flex h-6 w-6 items-center justify-center rounded text-[--text-muted] hover:bg-[--surface-muted] hover:text-[--text-strong]"
                        >
                          <NoteAdd className="h-3 w-3" />
                        </button>
                      )}
                      {!rowLocked && onInsertRowBefore && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onInsertRowBefore(entry.id);
                          }}
                          title="Insert row above"
                          className="flex h-6 w-6 items-center justify-center rounded text-[--text-muted] hover:bg-[--surface-muted] hover:text-[--text-strong]"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      )}
                      {!rowLocked && onInsertRowAfter && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onInsertRowAfter(entry.id);
                          }}
                          title="Insert row below"
                          className="flex h-6 w-6 items-center justify-center rounded text-[--text-muted] hover:bg-[--surface-muted] hover:text-[--text-strong] rotate-180"
                        >
                          <Plus className="h-3 w-3 rotate-180" />
                        </button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            title="Row options"
                            className="flex h-6 w-6 items-center justify-center rounded text-[--text-muted] hover:bg-[--surface-muted] hover:text-[--text-strong]"
                          >
                            <MoreHorizontal className="h-3 w-3" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          {!rowLocked && onInsertRowBefore && (
                            <DropdownMenuItem
                              onClick={() => onInsertRowBefore(entry.id)}
                            >
                              <Plus className="mr-2 h-3.5 w-3.5" />
                              Add row above
                            </DropdownMenuItem>
                          )}
                          {!rowLocked && onInsertRowAfter && (
                            <DropdownMenuItem
                              onClick={() => onInsertRowAfter(entry.id)}
                            >
                              <Plus className="mr-2 h-3.5 w-3.5 rotate-180" />
                              Add row below
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => {
                              try {
                                navigator.clipboard.writeText(
                                  JSON.stringify(entry, null, 2),
                                );
                              } catch {
                                /* clipboard not available */
                              }
                            }}
                          >
                            <FileText className="mr-2 h-3.5 w-3.5" />
                            Copy raw JSON
                          </DropdownMenuItem>
                          {!rowLocked && onDeleteRow && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => onDeleteRow(entry.id)}
                                className="text-rose-700 focus:text-rose-700"
                              >
                                <Trash2 className="mr-2 h-3.5 w-3.5" />
                                Delete row
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
              );
            })}
            {paddingBottom > 0 && (
              <tr aria-hidden="true" style={{ height: `${paddingBottom}px` }}>
                <td colSpan={(headerGroups[0]?.headers.length ?? 12) + 1} />
              </tr>
            )}
          </tbody>
          <tfoot className="sticky bottom-0 z-20 bg-[--surface-muted] backdrop-blur">
            {selectionTotals.count > 0 ? (
              // Selection bar — replaces the totals row when rows are selected.
              // Single full-width cell so the strip reads as one continuous
              // band (no column drift) and the eye stays on the count + grams.
              <tr className="border-t border-[--action-primary-bg]/40">
                <td
                  colSpan={headerGroups[0]?.headers.length + 1 || 13}
                  className="px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-[--text-strong]">
                      {selectionTotals.count} selected
                    </span>
                    <span className="text-[--text-muted]">·</span>
                    <span className="font-mono tabular-nums text-[--text-body]">
                      {grams(selectionTotals.gross)} g gross
                    </span>
                    <span className="text-[--text-muted]">·</span>
                    <span
                      className={cn(
                        "font-mono tabular-nums",
                        selectionTotals.bal < 0
                          ? "text-rose-700"
                          : "text-[--text-body]",
                      )}
                    >
                      {grams(selectionTotals.bal)} g bal
                    </span>
                    <div className="flex-1" />
                    <button
                      type="button"
                      onClick={() => onSelectChange(new Set())}
                      className="rounded px-2 py-0.5 text-[11px] text-[--text-muted] hover:bg-[--surface-base] hover:text-[--text-strong]"
                    >
                      Clear selection
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr className="border-t border-[--border]">
                <td colSpan={3} className="px-2 py-1.5 text-[--text-muted]">
                  {entries.length} rows
                </td>
                <td className="px-2 py-1.5 text-right font-mono font-medium">
                  {grams(totals.gross)} g
                </td>
                {KNOWN_EXPENSE_TYPES.map((t) => (
                  <td key={t} className="px-2 py-1.5 text-right font-mono">
                    —
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right font-mono text-sky-800">
                  {grams(totals.workers)} g
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-emerald-800">
                  {grams(totals.company)} g
                </td>
                <td
                  className={cn(
                    "px-2 py-1.5 text-right font-mono",
                    totals.bal < 0 && "text-rose-700",
                  )}
                >
                  {totals.bal === 0 ? "—" : `${grams(totals.bal)} g`}
                </td>
                {/* Trailing actions column; width owned by colgroup. */}
                <td className="px-1 py-1.5" />
              </tr>
            )}
          </tfoot>
        </table>

        {rows.length === 0 && (
          <div className="flex items-center justify-center p-12 text-[--text-muted] text-sm">
            No rows match your filter.
          </div>
        )}
      </div>
    );
  },
);

function isRowLocked(entry: LedgerEntry, importLocked: boolean): boolean {
  return importLocked || !!(entry.goldShiftAllocationId || entry.goldPourId || entry.buyerReceiptId);
}
