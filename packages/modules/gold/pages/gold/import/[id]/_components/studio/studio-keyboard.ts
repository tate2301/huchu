"use client";

import { useEffect } from "react";

export type CellCoord = { rowIdx: number; colIdx: number };

type KeyboardNavOptions = {
  activeCell: CellCoord | null;
  totalRows: number;
  totalCols: number;
  onMove: (coord: CellCoord) => void;
  onEdit: (coord: CellCoord) => void;
  onCancel: () => void;
  onUndo: () => void;
  onRedo: () => void;
  isEditing: boolean;
};

export function useStudioKeyboard({
  activeCell,
  totalRows,
  totalCols,
  onMove,
  onEdit,
  onCancel,
  onUndo,
  onRedo,
  isEditing,
}: KeyboardNavOptions) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;

      if (isMod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        onUndo();
        return;
      }
      if (isMod && (e.key === "Z" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        onRedo();
        return;
      }

      if (!activeCell || isEditing) return;

      const { rowIdx, colIdx } = activeCell;
      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          if (rowIdx > 0) onMove({ rowIdx: rowIdx - 1, colIdx });
          break;
        case "ArrowDown":
          e.preventDefault();
          if (rowIdx < totalRows - 1) onMove({ rowIdx: rowIdx + 1, colIdx });
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (colIdx > 0) onMove({ rowIdx, colIdx: colIdx - 1 });
          break;
        case "ArrowRight":
          e.preventDefault();
          if (colIdx < totalCols - 1) onMove({ rowIdx, colIdx: colIdx + 1 });
          break;
        case "Tab":
          e.preventDefault();
          if (e.shiftKey) {
            if (colIdx > 0) onMove({ rowIdx, colIdx: colIdx - 1 });
            else if (rowIdx > 0) onMove({ rowIdx: rowIdx - 1, colIdx: totalCols - 1 });
          } else {
            if (colIdx < totalCols - 1) onMove({ rowIdx, colIdx: colIdx + 1 });
            else if (rowIdx < totalRows - 1) onMove({ rowIdx: rowIdx + 1, colIdx: 0 });
          }
          break;
        case "Enter":
          e.preventDefault();
          onEdit(activeCell);
          break;
        case "Escape":
          e.preventDefault();
          onCancel();
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeCell, totalRows, totalCols, onMove, onEdit, onCancel, onUndo, onRedo, isEditing]);
}
