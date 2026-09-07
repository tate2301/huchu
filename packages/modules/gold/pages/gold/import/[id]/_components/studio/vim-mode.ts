"use client";

import { useEffect, useRef, useState } from "react";
import type { CellCoord } from "./studio-keyboard";

export type VimModeState = {
  enabled: boolean;
  mode: "normal" | "edit";
};

type VimModeOptions = {
  enabled: boolean;
  activeCell: CellCoord | null;
  totalRows: number;
  totalCols: number;
  selectedIds: Set<string>;
  entries: Array<{ id: string }>;
  onMove: (coord: CellCoord) => void;
  onEdit: () => void;
  onCancel: () => void;
  onToggleSelect: (id: string) => void;
  onDeleteSelected: () => void;
  onOpenCommandPalette: () => void;
  onFocusSearch: () => void;
  onCopySelected: () => void;
  onPasteAfterActive: () => void;
};

export function useVimMode({
  enabled,
  activeCell,
  totalRows,
  totalCols,
  selectedIds,
  entries,
  onMove,
  onEdit,
  onCancel,
  onToggleSelect,
  onDeleteSelected,
  onOpenCommandPalette,
  onFocusSearch,
  onCopySelected,
  onPasteAfterActive,
}: VimModeOptions) {
  const [mode, setMode] = useState<"normal" | "edit">("normal");
  // dd / yy sequence detection: track first key press
  const pendingKey = useRef<string | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPending = () => {
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    pendingKey.current = null;
  };

  const setPending = (key: string) => {
    clearPending();
    pendingKey.current = key;
    pendingTimer.current = setTimeout(clearPending, 800);
  };

  useEffect(() => {
    if (!enabled) {
      setMode("normal");
      return;
    }

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (mode === "edit") {
        if (e.key === "Escape") {
          e.preventDefault();
          setMode("normal");
          onCancel();
        }
        return;
      }

      // Normal mode — intercept single-char keys only when not in a text input
      if (inInput) return;

      switch (e.key) {
        case "j":
          e.preventDefault();
          if (activeCell && activeCell.rowIdx < totalRows - 1)
            onMove({ rowIdx: activeCell.rowIdx + 1, colIdx: activeCell.colIdx });
          break;
        case "k":
          e.preventDefault();
          if (activeCell && activeCell.rowIdx > 0)
            onMove({ rowIdx: activeCell.rowIdx - 1, colIdx: activeCell.colIdx });
          break;
        case "h":
          e.preventDefault();
          if (activeCell && activeCell.colIdx > 0)
            onMove({ rowIdx: activeCell.rowIdx, colIdx: activeCell.colIdx - 1 });
          break;
        case "l":
          e.preventDefault();
          if (activeCell && activeCell.colIdx < totalCols - 1)
            onMove({ rowIdx: activeCell.rowIdx, colIdx: activeCell.colIdx + 1 });
          break;
        case "g":
          if (pendingKey.current === "g") {
            e.preventDefault();
            clearPending();
            onMove({ rowIdx: 0, colIdx: activeCell?.colIdx ?? 0 });
          } else {
            setPending("g");
          }
          break;
        case "G":
          e.preventDefault();
          clearPending();
          onMove({ rowIdx: totalRows - 1, colIdx: activeCell?.colIdx ?? 0 });
          break;
        case "x": {
          e.preventDefault();
          if (activeCell) {
            const entry = entries[activeCell.rowIdx];
            if (entry) onToggleSelect(entry.id);
          }
          break;
        }
        case "d":
          if (pendingKey.current === "d") {
            e.preventDefault();
            clearPending();
            onDeleteSelected();
          } else {
            setPending("d");
          }
          break;
        case "y":
          if (pendingKey.current === "y") {
            e.preventDefault();
            clearPending();
            onCopySelected();
          } else {
            setPending("y");
          }
          break;
        case "p":
          e.preventDefault();
          onPasteAfterActive();
          break;
        case "i":
        case "Enter":
          e.preventDefault();
          setMode("edit");
          onEdit();
          break;
        case "Escape":
          e.preventDefault();
          setMode("normal");
          onCancel();
          break;
        case "/":
          e.preventDefault();
          onFocusSearch();
          break;
        case ":":
          e.preventDefault();
          onOpenCommandPalette();
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    enabled,
    mode,
    activeCell,
    totalRows,
    totalCols,
    entries,
    onMove,
    onEdit,
    onCancel,
    onToggleSelect,
    onDeleteSelected,
    onOpenCommandPalette,
    onFocusSearch,
    onCopySelected,
    onPasteAfterActive,
  ]);

  return { mode, setMode };
}
