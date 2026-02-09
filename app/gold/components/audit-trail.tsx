"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Download, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PdfTemplate } from "@/components/pdf/pdf-template";
import { RecordSavedBanner } from "@/components/shared/record-saved-banner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
  fetchGoldCorrections,
  fetchGoldDispatches,
  fetchGoldPours,
  fetchGoldReceipts,
  fetchGoldShiftAllocations,
  type GoldCorrection,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { exportElementToPdf } from "@/lib/pdf";

type AuditEntryKind = "POUR" | "DISPATCH" | "RECEIPT" | "ALLOCATION" | "CORRECTION";

type AuditEntry = {
  id: string;
  timestamp: string;
  action: string;
  user: string;
  details: string;
  kind: AuditEntryKind;
  entityId?: string;
};

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
};

function getCorrectionTarget(entry: AuditEntry): { entityType: "POUR" | "DISPATCH" | "RECEIPT"; entityId: string } | null {
  if ((entry.kind === "POUR" || entry.kind === "DISPATCH" || entry.kind === "RECEIPT") && entry.entityId) {
    return { entityType: entry.kind, entityId: entry.entityId };
  }
  return null;
}

export function AuditTrail({
  setViewMode,
}: {
  setViewMode: (mode: "menu" | "pour" | "dispatch" | "receipt" | "reconciliation" | "audit") => void;
}) {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createdId = searchParams.get("createdId");
  const auditPdfRef = useRef<HTMLDivElement | null>(null);
  const [correctionTarget, setCorrectionTarget] = useState<AuditEntry | null>(null);
  const [correctionReason, setCorrectionReason] = useState("");

  const {
    data: poursData,
    isLoading: poursLoading,
    error: poursError,
  } = useQuery({
    queryKey: ["gold-pours"],
    queryFn: () => fetchGoldPours({ limit: 200 }),
  });
  const {
    data: dispatchesData,
    isLoading: dispatchesLoading,
    error: dispatchesError,
  } = useQuery({
    queryKey: ["gold-dispatches"],
    queryFn: () => fetchGoldDispatches({ limit: 200 }),
  });
  const {
    data: receiptsData,
    isLoading: receiptsLoading,
    error: receiptsError,
  } = useQuery({
    queryKey: ["gold-receipts"],
    queryFn: () => fetchGoldReceipts({ limit: 200 }),
  });
  const {
    data: allocationsData,
    isLoading: allocationsLoading,
    error: allocationsError,
  } = useQuery({
    queryKey: ["gold-shift-allocations", "audit"],
    queryFn: () => fetchGoldShiftAllocations({ limit: 200 }),
  });
  const {
    data: correctionsData,
    isLoading: correctionsLoading,
    error: correctionsError,
  } = useQuery({
    queryKey: ["gold-corrections"],
    queryFn: () => fetchGoldCorrections({ limit: 200 }),
  });

  const createCorrectionMutation = useMutation({
    mutationFn: async (payload: {
      entityType: "POUR" | "DISPATCH" | "RECEIPT";
      entityId: string;
      reason: string;
    }) =>
      fetchJson<GoldCorrection>("/api/gold/corrections", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Correction logged",
        description: "A corrective event was appended to the audit chain.",
        variant: "success",
      });
      setCorrectionTarget(null);
      setCorrectionReason("");
      queryClient.invalidateQueries({ queryKey: ["gold-corrections"] });
      queryClient.invalidateQueries({ queryKey: ["gold-pours"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to log correction",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const pours = useMemo(() => poursData?.data ?? [], [poursData]);
  const dispatches = useMemo(() => dispatchesData?.data ?? [], [dispatchesData]);
  const receipts = useMemo(() => receiptsData?.data ?? [], [receiptsData]);
  const allocations = useMemo(() => allocationsData?.data ?? [], [allocationsData]);
  const corrections = useMemo(() => correctionsData?.data ?? [], [correctionsData]);

  const dispatchById = useMemo(() => {
    const map = new Map<string, (typeof dispatches)[number]>();
    dispatches.forEach((dispatch) => map.set(dispatch.id, dispatch));
    return map;
  }, [dispatches]);
  const receiptById = useMemo(() => {
    const map = new Map<string, (typeof receipts)[number]>();
    receipts.forEach((receipt) => map.set(receipt.id, receipt));
    return map;
  }, [receipts]);

  const auditEntries = useMemo<AuditEntry[]>(() => {
    const entries: AuditEntry[] = [];

    pours.forEach((pour) => {
      const witnessNames = [pour.witness1?.name, pour.witness2?.name].filter(Boolean).join(" & ");
      entries.push({
        id: `pour-${pour.id}`,
        timestamp: pour.pourDate,
        action: "Pour Recorded",
        user: witnessNames || "Witnessed",
        details: `${pour.pourBarId} | ${pour.grossWeight}g | ${pour.site.code}`,
        kind: "POUR",
        entityId: pour.id,
      });
    });

    dispatches.forEach((dispatch) => {
      entries.push({
        id: `dispatch-${dispatch.id}`,
        timestamp: dispatch.dispatchDate,
        action: "Dispatch Created",
        user: dispatch.handedOverBy?.name || "Handover",
        details: `${dispatch.goldPour.pourBarId} -> ${dispatch.courier}`,
        kind: "DISPATCH",
        entityId: dispatch.id,
      });
    });

    receipts.forEach((receipt) => {
      entries.push({
        id: `receipt-${receipt.id}`,
        timestamp: receipt.receiptDate,
        action: "Receipt Confirmed",
        user: "Buyer Receipt",
        details: `#${receipt.receiptNumber} | Assay ${receipt.assayResult ?? "n/a"} | Paid ${receipt.paidAmount}`,
        kind: "RECEIPT",
        entityId: receipt.id,
      });
    });

    allocations.forEach((allocation) => {
      entries.push({
        id: `allocation-${allocation.id}`,
        timestamp: allocation.createdAt,
        action: "Shift Allocation Recorded",
        user: "Gold Control",
        details: `${allocation.site.code} | ${allocation.shift} | ${allocation.totalWeight}g total`,
        kind: "ALLOCATION",
      });
    });

    corrections.forEach((correction) => {
      const relatedDispatch = correction.entityType === "DISPATCH" ? dispatchById.get(correction.entityId) : null;
      const relatedReceipt = correction.entityType === "RECEIPT" ? receiptById.get(correction.entityId) : null;
      const linkedRef =
        correction.entityType === "POUR"
          ? correction.pour.pourBarId
          : correction.entityType === "DISPATCH"
            ? relatedDispatch?.goldPour.pourBarId ?? correction.pour.pourBarId
            : relatedReceipt?.goldDispatch.goldPour.pourBarId ?? correction.pour.pourBarId;

      entries.push({
        id: `correction-${correction.id}`,
        timestamp: correction.createdAt,
        action: "Correction Logged",
        user: correction.createdBy.name,
        details: `${correction.entityType} (${linkedRef}): ${correction.reason}`,
        kind: "CORRECTION",
      });
    });

    return entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [allocations, corrections, dispatchById, dispatches, pours, receiptById, receipts]);

  const isLoading = poursLoading || dispatchesLoading || receiptsLoading || allocationsLoading || correctionsLoading;
  const error = poursError || dispatchesError || receiptsError || allocationsError || correctionsError;
  const exportDisabled = isLoading || auditEntries.length === 0;

  const handleLogCorrection = () => {
    if (!correctionTarget) return;
    const target = getCorrectionTarget(correctionTarget);
    if (!target) return;
    const reason = correctionReason.trim();
    if (!reason) {
      toast({
        title: "Reason required",
        description: "Enter a correction reason before submitting.",
        variant: "destructive",
      });
      return;
    }
    createCorrectionMutation.mutate({
      entityType: target.entityType,
      entityId: target.entityId,
      reason,
    });
  };

  return (
    <div className="space-y-6">
      <Button variant="outline" onClick={() => setViewMode("menu")}>
        Back to Menu
      </Button>
      <RecordSavedBanner entityLabel="gold audit entry" />

      <Card>
        <CardHeader>
          <CardTitle>Audit Trail</CardTitle>
          <CardDescription>Immutable timeline of pours, dispatches, receipts, and corrections</CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load audit trail</AlertTitle>
              <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
            </Alert>
          ) : isLoading ? (
            <div className="text-sm text-muted-foreground">Loading audit entries...</div>
          ) : auditEntries.length === 0 ? (
            <div className="text-sm text-muted-foreground">No gold activity recorded yet.</div>
          ) : (
            <div className="space-y-3">
              {auditEntries.map((entry) => {
                const isHighlighted = Boolean(createdId && entry.id.endsWith(createdId));
                const canCorrect = entry.kind === "POUR" || entry.kind === "DISPATCH" || entry.kind === "RECEIPT";
                return (
                  <div
                    key={entry.id}
                    className={`rounded border-l-4 p-3 ${
                      isHighlighted ? "border-emerald-500 bg-emerald-50" : "border-border bg-muted/60"
                    }`}
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">{formatTimestamp(entry.timestamp)}</div>
                        <div className="text-sm font-semibold">{entry.action}</div>
                        <div className="text-sm text-muted-foreground">{entry.details}</div>
                        <div className="text-xs text-muted-foreground">By: {entry.user}</div>
                      </div>
                      {canCorrect ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => setCorrectionTarget(entry)}>
                          Log Correction
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-6 border-t pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Shield className="h-4 w-4" />
              <span>Corrections are append-only events linked to the original chain of custody.</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button
        variant="outline"
        className="w-full"
        onClick={() => {
          if (auditPdfRef.current) {
            exportElementToPdf(
              auditPdfRef.current,
              `gold-audit-trail-${new Date().toISOString().slice(0, 10)}.pdf`,
            );
          }
        }}
        disabled={exportDisabled}
      >
        <Download className="mr-2 h-4 w-4" />
        Export Complete Audit Log (PDF)
      </Button>

      <Dialog open={!!correctionTarget} onOpenChange={(open) => !open && setCorrectionTarget(null)}>
        <DialogContent className="w-full sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Log Correction</DialogTitle>
            <DialogDescription>
              This adds a correction event to the audit trail without modifying historical records.
            </DialogDescription>
          </DialogHeader>
          {correctionTarget ? (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Target: <span className="font-semibold text-foreground">{correctionTarget.action}</span>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">Correction Reason *</label>
                <Textarea
                  value={correctionReason}
                  onChange={(event) => setCorrectionReason(event.target.value)}
                  placeholder="Describe what was wrong and what should be considered authoritative."
                  rows={4}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={handleLogCorrection}
                  disabled={createCorrectionMutation.isPending}
                >
                  {createCorrectionMutation.isPending ? "Saving..." : "Save Correction"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setCorrectionTarget(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <div className="absolute left-[-9999px] top-0">
        <div ref={auditPdfRef}>
          <PdfTemplate
            title="Gold Audit Trail"
            subtitle="Immutable record of gold operations and correction events"
            meta={[
              { label: "Total entries", value: String(auditEntries.length) },
              { label: "Latest entry", value: auditEntries[0] ? formatTimestamp(auditEntries[0].timestamp) : "-" },
            ]}
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="py-2">Timestamp</th>
                  <th className="py-2">Action</th>
                  <th className="py-2">Details</th>
                  <th className="py-2">User</th>
                </tr>
              </thead>
              <tbody>
                {auditEntries.map((entry) => (
                  <tr key={entry.id} className="border-b border-gray-100">
                    <td className="py-2">{formatTimestamp(entry.timestamp)}</td>
                    <td className="py-2 font-semibold">{entry.action}</td>
                    <td className="py-2">{entry.details}</td>
                    <td className="py-2">{entry.user}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PdfTemplate>
        </div>
      </div>
    </div>
  );
}
