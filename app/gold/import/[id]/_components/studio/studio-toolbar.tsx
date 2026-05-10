"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Plus,
  Trash2,
  Search,
  CommandIcon,
  HelpCircle,
  Maximize2,
  Minimize2,
  Eye,
  Coins,
} from "@/lib/icons";

export function StudioToolbar({
  selectedCount,
  selectedGrams,
  selectedBal,
  isLocked,
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
  findReplaceOpen,
  onOpenCommandPalette,
  onOpenKeyboardHelp,
  onToggleVimMode,
  onToggleAnnotationMode,
  onToggleFullscreen,
  onAddSale,
  onSellSelected,
}: {
  selectedCount: number;
  selectedGrams: number;
  selectedBal: number;
  isLocked: boolean;
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
  findReplaceOpen: boolean;
  onOpenCommandPalette: () => void;
  onOpenKeyboardHelp: () => void;
  onToggleVimMode: () => void;
  onToggleAnnotationMode: () => void;
  onToggleFullscreen: () => void;
  onAddSale: () => void;
  onSellSelected?: () => void;
}) {
  const hasSelection = selectedCount > 0;

  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[--border] px-3 py-1.5",
        isAnnotationMode
          ? "bg-amber-50 border-amber-200"
          : "bg-[--surface-muted]",
      )}
    >
      {isAnnotationMode && (
        <div className="flex items-center gap-1.5 rounded border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
          <Eye className="h-3.5 w-3.5" />
          Annotation mode — editing disabled
        </div>
      )}

      {!isLocked && !isAnnotationMode && (
        <>
          <ToolbarButton
            onClick={onAddRow}
            icon={<Plus className="h-3.5 w-3.5" />}
            label="Add row"
            shortcut="+"
          />
          <ToolbarButton
            onClick={onAddSale}
            icon={<Coins className="h-3.5 w-3.5" />}
            label="Sale"
            title="Add sale with FIFO preview"
          />
          <div className="h-4 w-px bg-[--border]" role="separator" />
        </>
      )}

      {hasSelection && !isLocked && !isAnnotationMode && (
        <>
          <ToolbarButton
            onClick={onDuplicateSelected}
            label={`Duplicate (${selectedCount})`}
          />
          <ToolbarButton
            onClick={onBulkEdit}
            label={`Bulk edit (${selectedCount})`}
          />
          {onSellSelected && (
            <ToolbarButton
              onClick={onSellSelected}
              icon={<Coins className="h-3.5 w-3.5" />}
              label={`Sell as receipt (${selectedCount})`}
              title="Open sale dialog pre-filled with selected pours"
            />
          )}
          <ToolbarButton
            onClick={onDeleteSelected}
            icon={<Trash2 className="h-3.5 w-3.5" />}
            label="Delete selected"
            variant="destructive"
          />
          <div className="h-4 w-px bg-[--border]" role="separator" />
        </>
      )}

      {!isLocked && !isAnnotationMode && (
        <>
          <ToolbarButton
            onClick={onUndo}
            label="Undo"
            shortcut="Ctrl+Z"
            disabled={!canUndo}
          />
          <ToolbarButton
            onClick={onRedo}
            label="Redo"
            shortcut="Ctrl+Shift+Z"
            disabled={!canRedo}
          />
          <div className="h-4 w-px bg-[--border]" role="separator" />
          <ToolbarButton
            onClick={onFindReplace}
            icon={<Search className="h-3.5 w-3.5" />}
            label="Find"
            shortcut="Ctrl+F"
            active={findReplaceOpen}
          />
          <div className="h-4 w-px bg-[--border]" role="separator" />
        </>
      )}

      {hasSelection && (
        <div className="ml-1 flex items-center gap-3 rounded border border-[--border] bg-[--surface-base] px-2 py-0.5 text-[11px] text-[--text-muted]">
          <span>
            <span className="font-semibold text-[--text-strong]">{selectedCount}</span> selected
          </span>
          <span className="font-mono">
            Gross: <span className="text-[--text-strong]">{selectedGrams.toFixed(3)} g</span>
          </span>
          {selectedBal !== 0 && (
            <span className={cn("font-mono", selectedBal < 0 && "text-rose-700")}>
              Bal: <span>{selectedBal.toFixed(3)} g</span>
            </span>
          )}
        </div>
      )}

      <div className="ml-auto flex items-center gap-1">
        <ToolbarButton
          onClick={onToggleAnnotationMode}
          icon={<Eye className="h-3.5 w-3.5" />}
          label="Annotate"
          active={isAnnotationMode}
          title="Annotation mode — review without editing"
        />
        <ToolbarButton
          onClick={onToggleVimMode}
          label="Vim"
          active={isVimMode}
          title="Vim mode — j/k navigation, dd delete, :command palette"
        />
        <div className="h-4 w-px bg-[--border]" role="separator" />
        <ToolbarButton
          onClick={onOpenCommandPalette}
          icon={<CommandIcon className="h-3.5 w-3.5" />}
          label=""
          shortcut="Cmd+K"
          title="Command palette"
        />
        <ToolbarButton
          onClick={onOpenKeyboardHelp}
          icon={<HelpCircle className="h-3.5 w-3.5" />}
          label=""
          shortcut="?"
          title="Keyboard shortcuts"
        />
        <ToolbarButton
          onClick={onToggleFullscreen}
          icon={
            isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )
          }
          label=""
          shortcut="Cmd+\"
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        />
      </div>
    </div>
  );
}

function ToolbarButton({
  onClick,
  icon,
  label,
  shortcut,
  disabled,
  variant,
  active,
  title,
}: {
  onClick: () => void;
  icon?: React.ReactNode;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  variant?: "destructive";
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? (shortcut ? `${label} (${shortcut})` : label)}
      className={cn(
        "flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors",
        variant === "destructive"
          ? "text-rose-700 hover:bg-rose-50 disabled:opacity-40"
          : active
            ? "bg-[--action-secondary-bg] text-[--action-primary-bg]"
            : "text-[--text-body] hover:bg-[--surface-canvas] disabled:text-[--text-subtle] disabled:cursor-not-allowed",
      )}
    >
      {icon}
      {label}
      {shortcut && (
        <kbd className="ml-0.5 rounded border border-[--border] px-1 py-px text-[9px] text-[--text-subtle]">
          {shortcut}
        </kbd>
      )}
    </button>
  );
}

export function FindReplaceBar({
  onClose,
  onApply,
}: {
  onClose: () => void;
  onApply: (find: string, replace: string, useRegex: boolean) => number;
}) {
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [useRegex, setUseRegex] = useState(false);
  const [lastCount, setLastCount] = useState<number | null>(null);

  const handleApply = () => {
    if (!find.trim()) return;
    const count = onApply(find, replace, useRegex);
    setLastCount(count);
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[--border] bg-[--surface-canvas] px-3 py-2">
      <span className="text-[11px] font-medium text-[--text-muted]">Find / Replace</span>
      <input
        type="text"
        placeholder="Find…"
        value={find}
        onChange={(e) => { setFind(e.target.value); setLastCount(null); }}
        className="h-6 w-40 rounded border border-[--border] bg-[--surface-base] px-2 text-xs outline-none focus:ring-1 focus:ring-[--action-primary-bg]/30"
        autoFocus
      />
      <span className="text-[--text-muted]">→</span>
      <input
        type="text"
        placeholder="Replace with…"
        value={replace}
        onChange={(e) => { setReplace(e.target.value); setLastCount(null); }}
        className="h-6 w-40 rounded border border-[--border] bg-[--surface-base] px-2 text-xs outline-none focus:ring-1 focus:ring-[--action-primary-bg]/30"
      />
      <label className="flex items-center gap-1 text-[11px] text-[--text-muted]">
        <input
          type="checkbox"
          checked={useRegex}
          onChange={(e) => setUseRegex(e.target.checked)}
          className="h-3 w-3"
        />
        Regex
      </label>
      <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={handleApply}>
        Replace all
      </Button>
      {lastCount !== null && (
        <span className="text-[11px] text-[--text-muted]">
          {lastCount} replaced
        </span>
      )}
      <button
        type="button"
        onClick={onClose}
        className="ml-auto text-[11px] text-[--text-muted] hover:text-[--text-strong]"
      >
        Close
      </button>
    </div>
  );
}
