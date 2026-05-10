"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { PastePreviewRow } from "./spreadsheet-paste";

export function PastePreviewDialog({
  rows,
  onConfirm,
  onCancel,
}: {
  rows: PastePreviewRow[] | null;
  onConfirm: (rows: PastePreviewRow[]) => void;
  onCancel: () => void;
}) {
  const open = rows !== null && rows.length > 0;
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Paste {rows?.length ?? 0} row{(rows?.length ?? 0) === 1 ? "" : "s"}?</AlertDialogTitle>
          <AlertDialogDescription>
            The following cells will be overwritten with clipboard data. Review before applying.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {rows && (
          <div className="max-h-48 overflow-y-auto rounded border border-[--border] text-xs font-mono">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-[--surface-muted]">
                <tr>
                  <th className="border-b border-[--border] px-2 py-1 text-left font-semibold text-[--text-muted]">
                    Row
                  </th>
                  <th className="border-b border-[--border] px-2 py-1 text-left font-semibold text-[--text-muted]">
                    Field
                  </th>
                  <th className="border-b border-[--border] px-2 py-1 text-left font-semibold text-[--text-muted]">
                    Value
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.flatMap((row) =>
                  row.fields.map((f, fi) => (
                    <tr
                      key={`${row.rowIdx}-${f.col}`}
                      className="border-b border-[--border] last:border-0"
                    >
                      {fi === 0 && (
                        <td
                          className="px-2 py-1 text-[--text-muted]"
                          rowSpan={row.fields.length}
                        >
                          {row.rowIdx + 1}
                        </td>
                      )}
                      <td className="px-2 py-1 text-[--text-strong]">{f.col}</td>
                      <td className="px-2 py-1">{f.value}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => rows && onConfirm(rows)}>
            Apply paste
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
