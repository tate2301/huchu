"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type BulkField = {
  key: string;
  label: string;
  type: "number" | "date";
};

const BULK_FIELDS: BulkField[] = [
  { key: "gramsTotal", label: "Gross (g)", type: "number" },
  { key: "boysGrams", label: "Workers (g)", type: "number" },
  { key: "mdaraGrams", label: "Company (g)", type: "number" },
  { key: "balGrams", label: "Balance (g)", type: "number" },
  { key: "parsedDate", label: "Date", type: "date" },
];

export type BulkEditPayload = {
  field: string;
  value: number | string | null;
};

export function BulkEditDialog({
  open,
  selectedCount,
  onClose,
  onApply,
}: {
  open: boolean;
  selectedCount: number;
  onClose: () => void;
  onApply: (payload: BulkEditPayload) => void;
}) {
  const [selectedField, setSelectedField] = useState<BulkField>(BULK_FIELDS[0]);
  const [rawValue, setRawValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleApply = () => {
    setError(null);
    if (!rawValue.trim()) {
      setError("Enter a value.");
      return;
    }
    if (selectedField.type === "number") {
      const n = Number(rawValue.trim());
      if (!Number.isFinite(n)) {
        setError("Enter a valid number.");
        return;
      }
      onApply({ field: selectedField.key, value: n });
    } else {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rawValue.trim())) {
        setError("Use YYYY-MM-DD format.");
        return;
      }
      onApply({ field: selectedField.key, value: rawValue.trim() });
    }
    setRawValue("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Bulk edit {selectedCount} row{selectedCount === 1 ? "" : "s"}</DialogTitle>
          <DialogDescription>
            Set a field to the same value across all selected rows.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Field</Label>
            <div className="flex flex-wrap gap-1.5">
              {BULK_FIELDS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => {
                    setSelectedField(f);
                    setRawValue("");
                    setError(null);
                  }}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                    selectedField.key === f.key
                      ? "border-[--action-primary-bg] bg-[--action-secondary-bg] text-[--action-primary-bg]"
                      : "border-[--border] text-[--text-body] hover:border-[--action-primary-bg]/40"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bulk-value">New value</Label>
            <input
              id="bulk-value"
              type={selectedField.type === "number" ? "number" : "date"}
              step={selectedField.type === "number" ? "0.001" : undefined}
              value={rawValue}
              onChange={(e) => {
                setRawValue(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleApply();
              }}
              className="w-full rounded-md border border-[--border] bg-[--surface-base] px-3 py-1.5 text-sm font-mono outline-none focus:ring-2 focus:ring-[--action-primary-bg]/30"
              placeholder={selectedField.type === "number" ? "0.000" : "YYYY-MM-DD"}
            />
            {error && (
              <p className="text-xs text-red-600" role="alert">{error}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleApply}>
            Apply to {selectedCount} row{selectedCount === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
