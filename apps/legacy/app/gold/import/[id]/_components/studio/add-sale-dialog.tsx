"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { fetchJson } from "@/lib/api-client";

type PlannedBatch = {
  pourId: string;
  pourBarId: string;
  siteId: string;
  siteName: string;
  pourDate: string;
  grams: number;
  valueUsd: number | null;
};

type PreviewResult = {
  consumedGrams: number;
  remainingGrams: number;
  isAnomaly: boolean;
  plannedBatches: PlannedBatch[];
  totalUsd: number | null;
  priceUsdPerGram: number | null;
  priceSource: "CONFIGURED" | "LIVE" | "FALLBACK" | null;
  isCrossSite: boolean;
};

type CommitResult = {
  entryId: string;
  lineNo: number;
  receiptId: string | null;
  consumedGrams: number;
  remainingGrams: number;
  isAnomaly: boolean;
};

export function AddSaleDialog({
  open,
  importId,
  siteId,
  initialPourIds,
  isClosedPeriod,
  isSuperAdmin,
  onClose,
  onCommitted,
}: {
  open: boolean;
  importId: string;
  siteId: string | null;
  initialPourIds?: string[];
  isClosedPeriod?: boolean;
  isSuperAdmin?: boolean;
  onClose: () => void;
  onCommitted: (result: CommitResult) => void;
}) {
  const [saleGrams, setSaleGrams] = useState("");
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [notes, setNotes] = useState("");
  const [overrideFifo, setOverrideFifo] = useState(false);
  const [directPourIds, setDirectPourIds] = useState<string[]>(initialPourIds ?? []);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setSaleGrams("");
      setSaleDate(new Date().toISOString().slice(0, 10));
      setPaymentMethod("CASH");
      setNotes("");
      setOverrideFifo((initialPourIds ?? []).length > 0);
      setDirectPourIds(initialPourIds ?? []);
      setPreview(null);
      setPreviewError(null);
      setCommitError(null);
    }
  }, [open, initialPourIds]);

  const fetchPreview = useCallback(
    async (grams: number, date: string, pourIds?: string[]) => {
      if (!siteId || !importId) return;
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const body: Record<string, unknown> = {
          saleGrams: grams,
          saleDate: `${date}T00:00:00.000Z`,
        };
        if (pourIds && pourIds.length > 0) body.directPourIds = pourIds;
        const data = await fetchJson<PreviewResult>(
          `/api/gold/imports/${importId}/sales/preview`,
          { method: "POST", body: JSON.stringify(body) },
        );
        setPreview(data);
      } catch (e) {
        setPreviewError(e instanceof Error ? e.message : "Preview failed");
        setPreview(null);
      } finally {
        setPreviewLoading(false);
      }
    },
    [importId, siteId],
  );

  // Debounced preview trigger
  useEffect(() => {
    const grams = parseFloat(saleGrams);
    if (!Number.isFinite(grams) || grams <= 0) {
      setPreview(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchPreview(grams, saleDate, overrideFifo ? directPourIds : undefined);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [saleGrams, saleDate, overrideFifo, directPourIds, fetchPreview]);

  const handleCommit = async () => {
    const grams = parseFloat(saleGrams);
    if (!Number.isFinite(grams) || grams <= 0) return;
    setCommitting(true);
    setCommitError(null);
    try {
      const body: Record<string, unknown> = {
        saleGrams: grams,
        saleDate: `${saleDate}T00:00:00.000Z`,
        buyerInfo: { paymentMethod },
        notes: notes || undefined,
      };
      if (overrideFifo && directPourIds.length > 0) body.directPourIds = directPourIds;
      const result = await fetchJson<CommitResult>(
        `/api/gold/imports/${importId}/sales/commit`,
        { method: "POST", body: JSON.stringify(body) },
      );
      onCommitted(result);
      onClose();
    } catch (e) {
      setCommitError(e instanceof Error ? e.message : "Commit failed");
    } finally {
      setCommitting(false);
    }
  };

  const gramsNum = parseFloat(saleGrams);
  const gramsValid = Number.isFinite(gramsNum) && gramsNum > 0;

  const canAdd =
    gramsValid &&
    !!saleDate &&
    !committing &&
    !(isClosedPeriod && !isSuperAdmin);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Sale</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Buyer + date row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sale-method">Payment method</Label>
              <select
                id="sale-method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full rounded-md border border-[--border] bg-[--surface-base] px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[--action-primary-bg]/30"
              >
                {["CASH", "BANK", "MOBILE_MONEY", "CHECK", "OTHER"].map((m) => (
                  <option key={m} value={m}>{m.replace("_", " ")}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sale-date">Sale date</Label>
              <input
                id="sale-date"
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                className="w-full rounded-md border border-[--border] bg-[--surface-base] px-2.5 py-1.5 text-sm font-mono outline-none focus:ring-2 focus:ring-[--action-primary-bg]/30"
              />
            </div>
          </div>

          {/* Grams + auto USD */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sale-grams">Sale grams</Label>
              <input
                id="sale-grams"
                type="number"
                step="0.001"
                min="0.001"
                placeholder="0.000"
                value={saleGrams}
                onChange={(e) => setSaleGrams(e.target.value)}
                className="w-full rounded-md border border-[--border] bg-[--surface-base] px-2.5 py-1.5 text-sm font-mono outline-none focus:ring-2 focus:ring-[--action-primary-bg]/30"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Estimated USD</Label>
              <div className="flex items-center gap-1.5 rounded-md border border-[--border] bg-[--surface-muted] px-2.5 py-1.5 text-sm font-mono text-[--text-muted]">
                {preview?.totalUsd != null
                  ? `$${preview.totalUsd.toFixed(2)}`
                  : previewLoading
                    ? "…"
                    : "—"}
                {preview?.priceSource && (
                  <span className="ml-auto rounded border border-[--border] px-1 py-px text-[9px] uppercase text-[--text-subtle]">
                    {preview.priceSource}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="sale-notes">Notes (optional)</Label>
            <input
              id="sale-notes"
              type="text"
              placeholder="Reason for price override, buyer name…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-md border border-[--border] bg-[--surface-base] px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[--action-primary-bg]/30"
            />
          </div>

          {/* FIFO Preview */}
          <div className="rounded-md border border-[--border] bg-[--surface-base]">
            <div className="flex items-center justify-between border-b border-[--border] px-3 py-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">
                FIFO preview
              </span>
              {overrideFifo ? (
                <button
                  type="button"
                  onClick={() => {
                    setOverrideFifo(false);
                    setDirectPourIds([]);
                  }}
                  className="text-[11px] text-[--action-primary-bg] hover:underline"
                >
                  Use automatic FIFO
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setOverrideFifo(true)}
                  className="text-[11px] text-[--action-primary-bg] hover:underline"
                >
                  Override — pick pours manually
                </button>
              )}
            </div>

            {overrideFifo && (
              <div className="border-b border-[--border] px-3 py-2">
                <Label className="text-[11px]">Pour IDs (comma-separated UUIDs)</Label>
                <input
                  type="text"
                  placeholder="uuid1, uuid2, …"
                  value={directPourIds.join(", ")}
                  onChange={(e) => {
                    const ids = e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean);
                    setDirectPourIds(ids);
                  }}
                  className="mt-1 w-full rounded border border-[--border] bg-[--surface-muted] px-2 py-1 text-[11px] font-mono outline-none focus:ring-1 focus:ring-[--action-primary-bg]/30"
                />
              </div>
            )}

            <div className="min-h-[4rem] px-3 py-2">
              {previewLoading && (
                <p className="text-[11px] text-[--text-muted]">Computing…</p>
              )}
              {previewError && (
                <p className="text-[11px] text-red-600">{previewError}</p>
              )}
              {!previewLoading && !previewError && preview && (
                <div className="space-y-0.5">
                  {preview.plannedBatches.map((b) => (
                    <div
                      key={b.pourId}
                      className="flex items-center justify-between text-[11px]"
                    >
                      <span className="font-mono text-[--text-body]">
                        {b.pourBarId}
                        <span className="ml-1 text-[--text-muted]">({b.siteName})</span>
                      </span>
                      <span className="font-mono text-[--text-body]">
                        {b.grams.toFixed(3)} g
                        {b.valueUsd != null && (
                          <span className="ml-1 text-[--text-muted]">
                            ${b.valueUsd.toFixed(2)}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                  {preview.plannedBatches.length === 0 && (
                    <p className="text-[11px] text-[--text-muted]">No pours available.</p>
                  )}
                  {preview.plannedBatches.length > 0 && (
                    <div className="mt-1 flex justify-between border-t border-[--border] pt-1 text-[11px] font-semibold">
                      <span>Total</span>
                      <span className="font-mono">
                        {preview.consumedGrams.toFixed(3)} g
                        {preview.totalUsd != null && ` $${preview.totalUsd.toFixed(2)}`}
                      </span>
                    </div>
                  )}
                </div>
              )}
              {!previewLoading && !previewError && !preview && gramsValid && (
                <p className="text-[11px] text-[--text-muted]">Enter a valid amount to see preview.</p>
              )}
              {!previewLoading && !previewError && !preview && !gramsValid && (
                <p className="text-[11px] text-[--text-muted]">Enter sale grams above.</p>
              )}
            </div>
          </div>

          {/* Warnings */}
          {preview?.isAnomaly && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              Oversell: {preview.remainingGrams.toFixed(3)} g deficit — not enough inventory on hand.
            </div>
          )}
          {preview?.isCrossSite && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              Cross-site sale: pours span multiple sites.
            </div>
          )}
          {isClosedPeriod && !isSuperAdmin && (
            <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-[11px] text-red-800">
              Sale date falls in a closed period. Only a SUPERADMIN can post here.
            </div>
          )}
          {isClosedPeriod && isSuperAdmin && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              Sale date falls in a closed period. You may proceed as SUPERADMIN.
            </div>
          )}
          {commitError && (
            <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-[11px] text-red-800">
              {commitError}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={committing}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleCommit}
            disabled={!canAdd}
            className={cn(preview?.isAnomaly && "border-amber-400 bg-amber-500 hover:bg-amber-600")}
          >
            {committing ? "Adding…" : "Add to ledger"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
