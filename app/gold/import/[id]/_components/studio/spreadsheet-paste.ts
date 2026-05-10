"use client";

import { useEffect, useCallback, useState } from "react";
import type { CellCoord } from "./studio-keyboard";
import type { LedgerEntry } from "../types";

export type PastePreviewRow = {
  rowIdx: number;
  entryId: string;
  fields: { col: string; value: string }[];
};

const EDITABLE_COLS = ["parsedDate", "gramsTotal", "boysGrams", "mdaraGrams", "balGrams"] as const;
type EditableCol = (typeof EDITABLE_COLS)[number];

function colAtIndex(idx: number): EditableCol | null {
  return EDITABLE_COLS[idx] ?? null;
}

export function useSpreadsheetPaste({
  enabled,
  activeCell,
  entries,
  onPreview,
}: {
  enabled: boolean;
  activeCell: CellCoord | null;
  entries: LedgerEntry[];
  onPreview: (rows: PastePreviewRow[]) => void;
}) {
  const parse = useCallback(
    (clipText: string) => {
      if (!activeCell) return;
      const lines = clipText.trimEnd().split(/\r?\n/);
      const preview: PastePreviewRow[] = [];
      lines.forEach((line, lineIdx) => {
        const rowIdx = activeCell.rowIdx + lineIdx;
        const entry = entries[rowIdx];
        if (!entry) return;
        const cells = line.split("\t");
        const fields: PastePreviewRow["fields"] = [];
        cells.forEach((cell, cellIdx) => {
          const colIdx = activeCell.colIdx + cellIdx;
          const col = colAtIndex(colIdx);
          if (col) fields.push({ col, value: cell.trim() });
        });
        if (fields.length > 0) {
          preview.push({ rowIdx, entryId: entry.id, fields });
        }
      });
      if (preview.length > 0) onPreview(preview);
    },
    [activeCell, entries, onPreview],
  );

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;
      if (inInput || !activeCell) return;

      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (!text || !text.includes("\t")) return;

      e.preventDefault();
      parse(text);
    };

    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [enabled, activeCell, parse]);
}

export type PastePreviewDialogProps = {
  rows: PastePreviewRow[] | null;
  onConfirm: (rows: PastePreviewRow[]) => void;
  onCancel: () => void;
};

export function usePastePreview() {
  const [preview, setPreview] = useState<PastePreviewRow[] | null>(null);
  return {
    preview,
    onPreview: setPreview,
    onCancel: () => setPreview(null),
  };
}
