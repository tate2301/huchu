"use client";

import { useState, useCallback, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, AlertTriangle, Info } from "@/lib/icons";
import { StudioToolbar, FindReplaceBar } from "./studio-toolbar";
import { StudioFilterBar, type StudioFilter } from "./studio-filter-bar";
import { StudioTable, type StudioTableHandle } from "./studio-table";
import { StudioAnomalyPanel, type BulkAcceptPayload } from "./studio-anomaly-panel";
import type {
  Anomaly,
  DryRunSummary,
  LedgerEntry,
} from "../types";
import type { SortingState, OnChangeFn } from "@tanstack/react-table";
import type { CellCoord } from "./studio-keyboard";

export function TabLedger({
  tableRef,
  entries,
  filteredEntries,
  isLocked,
  anomaliesByEntry,
  groupNameForEntry,
  dryRun,
  isValidating,
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
  onColumnWidthChange,
  findReplaceOpen,
  onLeaderClick,
  onRowCommentClick,
  selectedGrams,
  selectedBal,
  canUndo,
  canRedo,
  isVimMode,
  isAnnotationMode,
  isFullscreen,
  onAddRow,
  onDeleteSelected,
  onDuplicateSelected,
  onBulkEdit,
  onUndo,
  onRedo,
  onFindReplace,
  onOpenCommandPalette,
  onOpenKeyboardHelp,
  onToggleVimMode,
  onToggleAnnotationMode,
  onToggleFullscreen,
  onAddSale,
  onSellSelected,
  onValidate,
  onBulkAcceptWarn,
  onAutoFix,
  studioFilter,
  onFilterChange,
  distinctLeaders,
}: {
  tableRef: RefObject<StudioTableHandle | null>;
  entries: LedgerEntry[];
  filteredEntries: LedgerEntry[];
  isLocked: boolean;
  anomaliesByEntry: Map<string, Anomaly[]>;
  groupNameForEntry: (entry: LedgerEntry) => string | null;
  dryRun: DryRunSummary | null;
  isValidating: boolean;
  onUpdateEntry: (entryId: string, patch: Record<string, unknown>) => void;
  onInsertRowAfter: (entryId: string) => void;
  onInsertRowBefore: (entryId: string) => void;
  onDeleteRow: (entryId: string) => void;
  selectedIds: Set<string>;
  onSelectChange: (ids: Set<string>) => void;
  activeCell: CellCoord | null;
  onActiveCellChange: (coord: CellCoord | null) => void;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  columnWidths: Record<string, number>;
  onColumnWidthChange: (col: string, w: number) => void;
  findReplaceOpen: boolean;
  onLeaderClick?: (leaderName: string) => void;
  onRowCommentClick?: (entryId: string) => void;
  selectedGrams: number;
  selectedBal: number;
  canUndo: boolean;
  canRedo: boolean;
  isVimMode: boolean;
  isAnnotationMode: boolean;
  isFullscreen: boolean;
  onAddRow: () => void;
  onDeleteSelected: () => void;
  onDuplicateSelected: () => void;
  onBulkEdit: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onFindReplace: () => void;
  onOpenCommandPalette: () => void;
  onOpenKeyboardHelp: () => void;
  onToggleVimMode: () => void;
  onToggleAnnotationMode: () => void;
  onToggleFullscreen: () => void;
  onAddSale: () => void;
  onSellSelected: () => void;
  onValidate: () => void;
  onBulkAcceptWarn: (payload: BulkAcceptPayload) => void;
  onAutoFix: (anomaly: Anomaly) => void;
  studioFilter: StudioFilter;
  onFilterChange: (f: StudioFilter) => void;
  distinctLeaders: string[];
}) {
  const [anomalyPanelOpen, setAnomalyPanelOpen] = useState(false);
  const [anomalyGroupBy, setAnomalyGroupBy] = useState<"severity" | "code" | "leader" | "date">("severity");
  const [findQuery, setFindQuery] = useState("");

  const criticalCount = dryRun?.countsBySeverity.CRITICAL ?? 0;
  const warnCount = dryRun?.countsBySeverity.WARN ?? 0;
  const infoCount = dryRun?.countsBySeverity.INFO ?? 0;
  const hasAnomalies = criticalCount + warnCount + infoCount > 0;

  const handleJumpToEntry = useCallback((entryId: string) => {
    tableRef.current?.scrollToEntry(entryId);
  }, [tableRef]);

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Anomaly summary banner */}
        {hasAnomalies && (
          <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[--border] bg-[--surface-base] px-4 py-2 text-xs">
            {criticalCount > 0 && (
              <span className="flex items-center gap-1.5 text-rose-700">
                <AlertCircle className="h-3.5 w-3.5" />
                {criticalCount} critical
              </span>
            )}
            {warnCount > 0 && (
              <span className="flex items-center gap-1.5 text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                {warnCount} warn
              </span>
            )}
            {infoCount > 0 && (
              <span className="flex items-center gap-1.5 text-sky-700">
                <Info className="h-3.5 w-3.5" />
                {infoCount} info
              </span>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setAnomalyPanelOpen((o) => !o)}
              className="h-6 px-2 text-xs"
            >
              {anomalyPanelOpen ? "Hide details" : "Show details"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onValidate}
              disabled={isValidating}
              className="h-6 px-2 text-xs"
            >
              {isValidating ? "Validating…" : "Re-validate"}
            </Button>
          </div>
        )}

        {/* Unified controls row: filter bar + toolbar */}
        <div className="shrink-0 border-b border-[--border] bg-[--surface-base]">
          <StudioFilterBar
            filter={studioFilter}
            onFilterChange={onFilterChange}
            distinctLeaders={distinctLeaders}
          />
          <StudioToolbar
            selectedCount={selectedIds.size}
            selectedGrams={selectedGrams}
            selectedBal={selectedBal}
            isLocked={isLocked}
            canUndo={canUndo}
            canRedo={canRedo}
            isVimMode={isVimMode}
            isAnnotationMode={isAnnotationMode}
            isFullscreen={isFullscreen}
            onAddRow={onAddRow}
            onDeleteSelected={onDeleteSelected}
            onDuplicateSelected={onDuplicateSelected}
            onBulkEdit={onBulkEdit}
            onUndo={onUndo}
            onRedo={onRedo}
            onFindReplace={onFindReplace}
            findReplaceOpen={findReplaceOpen}
            onOpenCommandPalette={onOpenCommandPalette}
            onOpenKeyboardHelp={onOpenKeyboardHelp}
            onToggleVimMode={onToggleVimMode}
            onToggleAnnotationMode={onToggleAnnotationMode}
            onToggleFullscreen={onToggleFullscreen}
            onAddSale={onAddSale}
            onSellSelected={onSellSelected}
          />
          {findReplaceOpen && (
            <FindReplaceBar
              onClose={() => { onFindReplace(); setFindQuery(""); }}
              onApply={(find) => { setFindQuery(find); return 0; }}
            />
          )}
        </div>

        {/* Table — fills remaining space */}
        <StudioTable
          ref={tableRef}
          entries={filteredEntries}
          isLocked={isLocked || isAnnotationMode}
          anomaliesByEntry={anomaliesByEntry}
          groupNameForEntry={groupNameForEntry}
          onUpdateEntry={onUpdateEntry as Parameters<typeof StudioTable>[0]["onUpdateEntry"]}
          onInsertRowAfter={onInsertRowAfter}
          onInsertRowBefore={onInsertRowBefore}
          onDeleteRow={onDeleteRow}
          selectedIds={selectedIds}
          onSelectChange={onSelectChange}
          activeCell={activeCell}
          onActiveCellChange={onActiveCellChange}
          sorting={sorting}
          onSortingChange={onSortingChange}
          columnWidths={columnWidths}
          onColumnWidthChange={onColumnWidthChange}
          findQuery={findQuery}
          onLeaderClick={onLeaderClick}
          onRowCommentClick={onRowCommentClick}
        />
      </div>

      {/* Anomaly detail panel */}
      {anomalyPanelOpen && dryRun && (
        <div className="w-72 shrink-0 border-l border-[--border]">
          <StudioAnomalyPanel
            summary={dryRun}
            entries={entries}
            groupBy={anomalyGroupBy}
            onGroupByChange={setAnomalyGroupBy}
            onJumpTo={handleJumpToEntry}
            onClose={() => setAnomalyPanelOpen(false)}
            onBulkAccept={onBulkAcceptWarn}
            onAutoFix={onAutoFix}
          />
        </div>
      )}
    </div>
  );
}
