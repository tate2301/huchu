"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NumericCell } from "@/components/ui/numeric-cell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { History, Plus, RefreshCcw, Search, Trash2, XCircle } from "@/lib/icons";
import { PosNumericField } from "./pos-numeric-field";
import { PosNumericKeypad } from "./pos-numeric-keypad";
import { applyPosKeypadAction, type PosKeypadAction } from "./pos-numeric-input";
import {
  PosEmptyState,
  PosMetricCard,
  PosPanel,
  PosPanelHeader,
  PosStatusPill,
  PosTerminalHeader,
} from "./pos-primitives";
import { usePosPortalState } from "./pos-portal-state";
import type { PaymentRow, SaleDetail, SaleRow, TenderType } from "./pos-types";
import { getPaymentSummary, money, round } from "./pos-utils";

export function PosHistoryView() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentShift, canOverride } = usePosPortalState();
  const [search, setSearch] = useState("");
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [refundDialog, setRefundDialog] = useState(false);
  const [voidDialog, setVoidDialog] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const [refundNotes, setRefundNotes] = useState("");
  const [refundAmounts, setRefundAmounts] = useState<Record<string, string>>({});
  const [refundPayments, setRefundPayments] = useState<PaymentRow[]>([
    { tenderType: "CASH", amount: "", reference: "" },
  ]);
  const [activeRefundNumericTarget, setActiveRefundNumericTarget] = useState<
    { type: "refund_qty"; lineId: string } | { type: "refund_amount"; index: number } | null
  >(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidNotes, setVoidNotes] = useState("");

  const salesQuery = useQuery({
    queryKey: ["retail-pos-sales", search],
    queryFn: () =>
      fetchJson<{ data: SaleRow[] }>(
        `/api/v2/retail/pos/sales?scope=mine&limit=120&search=${encodeURIComponent(search)}`,
      ),
  });
  const saleDetailQuery = useQuery({
    queryKey: ["retail-pos-sale-detail", selectedSaleId],
    queryFn: () =>
      fetchJson<{ data: SaleDetail }>(`/api/v2/retail/pos/sales/${selectedSaleId}`),
    enabled: Boolean(selectedSaleId),
  });

  const saleRows = salesQuery.data?.data ?? [];
  const postedSaleCount = saleRows.filter((sale) => sale.status === "POSTED").length;

  const selectedSale = saleDetailQuery.data?.data ?? null;
  const refundTotal = round(
    (selectedSale?.lines ?? []).reduce((sum, line) => {
      const quantity = Number(refundAmounts[line.id] || "0");
      if (quantity <= 0 || line.quantity <= 0) {
        return sum;
      }
      return sum + Math.abs(line.lineTotal) * (quantity / line.quantity);
    }, 0),
  );
  const refundPaymentSummary = useMemo(
    () => getPaymentSummary(refundPayments, refundTotal),
    [refundPayments, refundTotal],
  );
  const refundTenderGap = round(refundPaymentSummary.tenderedTotal - refundTotal);

  const refundMutation = useMutation({
    mutationFn: () =>
      fetchJson(`/api/v2/retail/pos/sales/${selectedSale?.id}/refund`, {
        method: "POST",
        body: JSON.stringify({
          shiftId: currentShift?.id,
          reason: refundReason.trim(),
          notes: refundNotes.trim() || undefined,
          lines: (selectedSale?.lines ?? [])
            .map((line) => ({
              saleLineId: line.id,
              quantity: Number(refundAmounts[line.id] || "0"),
            }))
            .filter((line) => line.quantity > 0),
          payments: refundPaymentSummary.parsed
            .filter((payment) => payment.amountValue > 0)
            .map((payment) => ({
              tenderType: payment.tenderType,
              amount: payment.amountValue,
              reference: payment.reference.trim() || undefined,
            })),
        }),
      }),
    onSuccess: () => {
      toast({ title: "Refund posted", variant: "success" });
      setRefundDialog(false);
      setRefundReason("");
      setRefundNotes("");
      setRefundAmounts({});
      setRefundPayments([{ tenderType: "CASH", amount: "", reference: "" }]);
      queryClient.invalidateQueries({ queryKey: ["retail-pos-sales"] });
      queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
      queryClient.invalidateQueries({ queryKey: ["retail-pos-sale-detail"] });
    },
    onError: (error) =>
      toast({
        title: "Unable to post refund",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const voidMutation = useMutation({
    mutationFn: () =>
      fetchJson(`/api/v2/retail/pos/sales/${selectedSale?.id}/void`, {
        method: "POST",
        body: JSON.stringify({
          shiftId: currentShift?.id,
          reason: voidReason.trim(),
          notes: voidNotes.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Sale voided", variant: "success" });
      setVoidDialog(false);
      setVoidReason("");
      setVoidNotes("");
      queryClient.invalidateQueries({ queryKey: ["retail-pos-sales"] });
      queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
      queryClient.invalidateQueries({ queryKey: ["retail-pos-sale-detail"] });
    },
    onError: (error) =>
      toast({
        title: "Unable to void sale",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const startRefund = () => {
    if (!selectedSale) {
      return;
    }
    const next = selectedSale.lines.reduce<Record<string, string>>((accumulator, line) => {
      accumulator[line.id] = String(line.quantity);
      return accumulator;
    }, {});
    setRefundAmounts(next);
    setRefundReason("");
    setRefundNotes("");
    setRefundPayments([
      {
        tenderType: "CASH",
        amount: String(Math.abs(selectedSale.totalAmount)),
        reference: "",
      },
    ]);
    setRefundDialog(true);
  };

  const updateRefundPayment = (index: number, next: Partial<PaymentRow>) => {
    setRefundPayments((current) =>
      current.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...next } : entry,
      ),
    );
  };

  const handleRefundKeypadAction = (action: PosKeypadAction) => {
    if (!activeRefundNumericTarget) return;
    if (activeRefundNumericTarget.type === "refund_qty") {
      setRefundAmounts((current) => ({
        ...current,
        [activeRefundNumericTarget.lineId]: applyPosKeypadAction(
          current[activeRefundNumericTarget.lineId] ?? "",
          action,
          { maxDecimals: 3 },
        ),
      }));
      return;
    }
    setRefundPayments((current) =>
      current.map((payment, index) =>
        index === activeRefundNumericTarget.index
          ? {
              ...payment,
              amount: applyPosKeypadAction(payment.amount ?? "", action),
            }
          : payment,
      ),
    );
  };

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4">
      <PosPanel>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              Transaction workspace
            </p>
            <h2 className="mt-1 text-[1.35rem] font-semibold tracking-[-0.03em] text-[var(--text-strong)]">
              Sales history
            </h2>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["retail-pos-sales"] })}
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        {/* Search + stats row */}
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px_160px]">
          {/* Search bar */}
          <div className="flex items-center gap-2.5 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-muted)] px-3.5 py-2 transition-all focus-within:border-[var(--action-primary-bg)] focus-within:bg-[var(--surface-base)] focus-within:ring-2 focus-within:ring-[var(--action-primary-bg)] focus-within:ring-offset-1">
            <Search className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search receipt, customer, item…"
              className="h-10 border-none bg-transparent px-0 text-[14px] shadow-none focus-visible:ring-0"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="shrink-0 rounded-md p-0.5 text-[var(--text-muted)] hover:text-[var(--text-strong)]"
              >
                <XCircle className="h-4 w-4" />
              </button>
            )}
          </div>
          <PosMetricCard
            icon={History}
            label="Results"
            value={String(saleRows.length)}
            meta="Matching receipts"
            tone="neutral"
          />
          <PosMetricCard
            icon={RefreshCcw}
            label="Posted"
            value={String(postedSaleCount)}
            meta="Ready for follow-up"
            tone="success"
          />
        </div>
      </PosPanel>

      <PosPanel className="min-h-0">
        <div className="h-full min-h-0 overflow-auto">
          {saleRows.length === 0 ? (
            <PosEmptyState
              icon={History}
              title="No transactions found"
              description={
                salesQuery.isLoading
                  ? "Loading receipt history…"
                  : "Try a different receipt number, customer, or item name."
              }
            />
          ) : (
            <table className="w-full min-w-[860px] text-sm">
              <thead className="sticky top-0 z-10 border-b border-[var(--border-subtle)] bg-[var(--surface-base)] text-left text-[10px] uppercase tracking-[0.13em] text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-3">Receipt</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3 text-center">Items</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Posted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {saleRows.map((sale) => {
                  const isRefund = sale.saleType === "REFUND";
                  const isVoid = sale.saleType === "VOID";
                  return (
                    <tr
                      key={sale.id}
                      className="group cursor-pointer transition-colors hover:bg-[var(--surface-muted)]"
                      onClick={() => setSelectedSaleId(sale.id)}
                    >
                      <td className="px-4 py-4">
                        <span className="font-mono text-[13px] font-bold text-[var(--text-strong)]">
                          {sale.saleNo}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <PosStatusPill tone={isRefund ? "danger" : isVoid ? "warning" : "success"}>
                          {sale.saleType}
                        </PosStatusPill>
                      </td>
                      <td className="px-4 py-4 text-[var(--text-muted)]">
                        {sale.customerName ?? "Walk-in"}
                      </td>
                      <td className="px-4 py-4 text-center text-[var(--text-muted)]">
                        {sale.itemCount}
                      </td>
                      <td className="px-4 py-4">
                        <PosStatusPill
                          tone={sale.status === "POSTED" ? "success" : "warning"}
                        >
                          {sale.status}
                        </PosStatusPill>
                      </td>
                      <td className={`px-4 py-4 text-right font-mono text-[13px] font-black ${isRefund ? "text-red-600" : "text-[var(--text-strong)]"}`}>
                        {isRefund && sale.totalAmount < 0 ? "−" : ""}
                        {money(Math.abs(sale.totalAmount))}
                      </td>
                      <td className="px-4 py-4 text-xs text-[var(--text-muted)]">
                        {new Date(sale.postedAt).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </PosPanel>

      <Dialog open={Boolean(selectedSaleId)} onOpenChange={(open) => !open && setSelectedSaleId(null)}>
        <DialogContent className="sm:max-w-3xl p-0 overflow-hidden">
          {selectedSale ? (
            <>
              {/* Receipt header — colored by type */}
              <PosTerminalHeader
                eyebrow={`Receipt · ${selectedSale.saleType}`}
                title={selectedSale.saleNo}
                subtitle={[
                  selectedSale.customerName ?? "Walk-in",
                  selectedSale.postedAt
                    ? new Date(selectedSale.postedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                    : "Not yet posted",
                ].join(" · ")}
                valuePrimary={money(Math.abs(selectedSale.totalAmount))}
                valueSecondary={`${selectedSale.lines.length} line${selectedSale.lines.length !== 1 ? "s" : ""}`}
                pill={
                  <PosStatusPill
                    tone={
                      selectedSale.saleType === "REFUND" ? "danger" : selectedSale.saleType === "VOID" ? "warning" : "success"
                    }
                  >
                    {selectedSale.status}
                  </PosStatusPill>
                }
              />

              <div className="max-h-[70vh] overflow-y-auto">
                <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.9fr)]">
                  {/* Line items */}
                  <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-muted)] overflow-hidden">
                    <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-base)] px-4 py-3">
                      <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                        Items sold
                      </span>
                    </div>
                    <div className="divide-y divide-[var(--border-subtle)]">
                      {selectedSale.lines.map((line) => (
                        <div
                          key={line.id}
                          className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-[var(--text-strong)]">
                              {line.itemName}
                            </div>
                            <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                              {line.quantity % 1 === 0 ? line.quantity : line.quantity.toFixed(2)} × {money(line.unitPrice)}
                            </div>
                          </div>
                          <span className="shrink-0 font-mono text-[13px] font-bold text-[var(--text-strong)]">
                            {money(line.lineTotal)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    {/* Payments */}
                    <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-muted)] overflow-hidden">
                      <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-base)] px-4 py-3">
                        <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                          Tenders
                        </span>
                      </div>
                      <div className="divide-y divide-[var(--border-subtle)]">
                        {selectedSale.payments.map((payment) => (
                          <div
                            key={payment.id}
                            className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                          >
                            <div className="min-w-0">
                              <div className="font-semibold text-[var(--text-strong)]">
                                {payment.tenderType.replaceAll("_", " ")}
                              </div>
                              {payment.reference && (
                                <div className="truncate text-[11px] text-[var(--text-muted)]">
                                  Ref: {payment.reference}
                                </div>
                              )}
                            </div>
                            <span className="shrink-0 font-mono text-[13px] font-bold text-[var(--text-strong)]">
                              {money(payment.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Promo / source info if relevant */}
                    {(selectedSale.promotionCode || selectedSale.sourceSaleNo) && (
                      <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-muted)] px-4 py-3 space-y-1 text-sm">
                        {selectedSale.promotionCode && (
                          <div className="flex justify-between text-[var(--text-muted)]">
                            <span>Promo</span>
                            <span className="font-mono font-semibold text-[var(--text-strong)]">{selectedSale.promotionCode}</span>
                          </div>
                        )}
                        {selectedSale.sourceSaleNo && (
                          <div className="flex justify-between text-[var(--text-muted)]">
                            <span>Source receipt</span>
                            <span className="font-mono font-semibold text-[var(--text-strong)]">{selectedSale.sourceSaleNo}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Actions / reversals */}
                    <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-muted)] px-4 py-4">
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                          Follow-up
                        </span>
                        <PosStatusPill tone={canOverride && currentShift ? "success" : "warning"}>
                          {canOverride && currentShift ? "Allowed" : "Restricted"}
                        </PosStatusPill>
                      </div>

                      {(selectedSale.reversals ?? []).length > 0 && (
                        <div className="mb-3 space-y-1.5">
                          {selectedSale.reversals.map((reversal) => (
                            <div
                              key={reversal.id}
                              className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2.5 text-sm"
                            >
                              <div>
                                <span className="font-mono font-semibold text-[var(--text-strong)]">{reversal.saleNo}</span>
                                <span className="ml-2 text-xs text-[var(--text-muted)]">{reversal.saleType}</span>
                              </div>
                              <span className="font-mono text-sm font-bold text-red-600">
                                {money(reversal.totalAmount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {canOverride && currentShift && selectedSale.saleType === "SALE" && selectedSale.status === "POSTED" ? (
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            className="flex-1 h-10"
                            onClick={startRefund}
                          >
                            Refund
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="flex-1 h-10 border-red-200 text-red-600 hover:bg-red-50"
                            onClick={() => setVoidDialog(true)}
                            disabled={(selectedSale.reversals ?? []).length > 0}
                          >
                            <XCircle className="h-4 w-4" />
                            Void
                          </Button>
                        </div>
                      ) : (
                        <p className="text-xs text-[var(--text-muted)]">
                          {(selectedSale.reversals ?? []).length > 0
                            ? "This sale has already been reversed."
                            : "No reversals yet. Manager or cashier with override can refund or void."}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="p-6">
              <PosEmptyState
                icon={History}
                title="Loading receipt…"
                description="Fetching the transaction details."
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={refundDialog} onOpenChange={setRefundDialog}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Refund {selectedSale?.saleNo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <PosMetricCard
                icon={History}
                label="Refund total"
                value={money(refundTotal)}
                meta="Calculated from the quantities you select"
                tone="warning"
              />
              <PosMetricCard
                icon={RefreshCcw}
                label="Tendered"
                value={money(refundPaymentSummary.tenderedTotal)}
                meta="Returned across the tenders below"
                tone={
                  Math.abs(refundPaymentSummary.tenderedTotal - refundTotal) <= 0.01
                    ? "success"
                    : "danger"
                }
              />
              <PosMetricCard
                icon={XCircle}
                label="Balance"
                value={money(refundTenderGap)}
                meta="Refunds must balance before posting"
                tone={Math.abs(refundTenderGap) <= 0.01 ? "success" : "warning"}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_320px]">
              <div className="space-y-4">
                <div className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-[var(--text-strong)]">
                      Choose items to refund
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">
                      Tap a quantity field, then use the keypad.
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {(selectedSale?.lines ?? []).map((line) => (
                      <div
                        key={line.id}
                        className="grid gap-2 rounded-lg border border-[var(--edge-subtle)] bg-[var(--surface-base)] px-3 py-3 md:grid-cols-[minmax(0,1fr)_136px_120px]"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium text-[var(--text-strong)]">
                            {line.itemName}
                          </div>
                          <div className="text-xs text-[var(--text-muted)]">
                            Sold {line.quantity.toFixed(2)} x {money(line.unitPrice)}
                          </div>
                        </div>
                        <PosNumericField
                          label="Refund qty"
                          value={refundAmounts[line.id] ?? ""}
                          active={
                            activeRefundNumericTarget?.type === "refund_qty" &&
                            activeRefundNumericTarget.lineId === line.id
                          }
                          onActivate={() =>
                            setActiveRefundNumericTarget({
                              type: "refund_qty",
                              lineId: line.id,
                            })
                          }
                        />
                        <div className="flex items-center justify-end font-mono text-sm font-semibold text-[var(--text-strong)]">
                          {money(
                            round(
                              Math.abs(line.lineTotal) *
                                (Number(refundAmounts[line.id] || "0") / (line.quantity || 1)),
                            ),
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-4 py-4">
                  <div className="text-sm font-semibold text-[var(--text-strong)]">
                    Refund details
                  </div>
                  <div className="mt-3 grid gap-3">
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-[var(--text-strong)]">
                        Reason
                      </label>
                      <Input
                        value={refundReason}
                        onChange={(event) => setRefundReason(event.target.value)}
                        placeholder="Damaged item, wrong item, customer return..."
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-[var(--text-strong)]">
                        Notes
                      </label>
                      <Textarea
                        value={refundNotes}
                        onChange={(event) => setRefundNotes(event.target.value)}
                        rows={3}
                        placeholder="Optional context for the manager or audit trail"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-[var(--text-strong)]">
                      Refund tenders
                    </div>
                    <PosStatusPill
                      tone={
                        Math.abs(refundTenderGap) <= 0.01 ? "success" : "warning"
                      }
                    >
                      {Math.abs(refundTenderGap) <= 0.01 ? "Balanced" : "Needs balance"}
                    </PosStatusPill>
                  </div>
                  <div className="mt-3 space-y-3">
                    {refundPayments.map((payment, index) => (
                      <div
                        key={`${payment.tenderType}-${index}`}
                        className="grid gap-2 rounded-lg border border-[var(--edge-subtle)] bg-[var(--surface-base)] px-3 py-3 md:grid-cols-[1fr_118px_1fr_auto]"
                      >
                        <Select
                          value={payment.tenderType}
                          onValueChange={(value) =>
                            updateRefundPayment(index, { tenderType: value as TenderType })
                          }
                        >
                          <SelectTrigger className="h-11">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CASH">Cash</SelectItem>
                            <SelectItem value="CARD">Card</SelectItem>
                            <SelectItem value="MOBILE_MONEY">Mobile money</SelectItem>
                            <SelectItem value="VOUCHER">Voucher</SelectItem>
                          </SelectContent>
                        </Select>
                        <PosNumericField
                          label="Amount"
                          value={payment.amount}
                          active={
                            activeRefundNumericTarget?.type === "refund_amount" &&
                            activeRefundNumericTarget.index === index
                          }
                          onActivate={() =>
                            setActiveRefundNumericTarget({ type: "refund_amount", index })
                          }
                        />
                        <Input
                          value={payment.reference}
                          onChange={(event) =>
                            updateRefundPayment(index, { reference: event.target.value })
                          }
                          className="h-11"
                          placeholder="Reference"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 px-3"
                          onClick={() =>
                            setRefundPayments((current) =>
                              current.filter((_, paymentIndex) => paymentIndex !== index),
                            )
                          }
                          disabled={refundPayments.length === 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3 w-full"
                    onClick={() =>
                      setRefundPayments((current) => [
                        ...current,
                        { tenderType: "CARD", amount: "", reference: "" },
                      ])
                    }
                  >
                    <Plus className="h-4 w-4" />
                    Add tender
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-4 py-4">
                <div className="text-sm font-semibold text-[var(--text-strong)]">
                  Amount keypad
                </div>
                <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                  Use the keypad for refund quantities and tender amounts to keep the flow fast on shared terminals.
                </p>
                <div className="mt-4">
                  <PosNumericKeypad onAction={handleRefundKeypadAction} />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRefundDialog(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => refundMutation.mutate()}
              disabled={
                refundMutation.isPending ||
                refundTotal <= 0 ||
                !refundReason.trim() ||
                Math.abs(refundPaymentSummary.tenderedTotal - refundTotal) > 0.01
              }
            >
              Post refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={voidDialog} onOpenChange={setVoidDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Void sale</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div
              className="rounded-xl px-4 py-4 ring-1"
              style={{ background: "var(--pos-status-danger-bg)", boxShadow: `inset 0 0 0 1px var(--pos-status-danger-ring)` }}
            >
              <div className="text-sm font-semibold text-[var(--status-error-text)]">
                Voiding removes the whole sale from the active record.
              </div>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                Use this only when the entire receipt should be cancelled. If the customer is returning part of the sale, post a refund instead.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-3 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Receipt
                </div>
                <div className="mt-2 font-mono text-sm font-semibold text-[var(--text-strong)]">
                  {selectedSale?.saleNo ?? "-"}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-3 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Total
                </div>
                <div className="mt-2 font-mono text-sm font-semibold text-[var(--text-strong)]">
                  {money(selectedSale?.totalAmount ?? 0)}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-[var(--text-strong)]">
                Reason
              </label>
              <Input
                value={voidReason}
                onChange={(event) => setVoidReason(event.target.value)}
                placeholder="Accidental duplicate, wrong register, test sale..."
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-[var(--text-strong)]">
                Notes
              </label>
              <Textarea
                value={voidNotes}
                onChange={(event) => setVoidNotes(event.target.value)}
                rows={3}
                placeholder="Optional context for the audit trail"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setVoidDialog(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => voidMutation.mutate()}
              disabled={voidMutation.isPending || !voidReason.trim()}
            >
              Void sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
