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
import { Plus, RefreshCcw, Trash2, XCircle } from "@/lib/icons";
import { PosNumericField } from "./pos-numeric-field";
import { PosNumericKeypad } from "./pos-numeric-keypad";
import { applyPosKeypadAction, type PosKeypadAction } from "./pos-numeric-input";
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-[1rem] border border-[var(--border)] bg-[var(--surface-base)] px-3 py-2.5">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search receipt, customer, cashier, or item"
          className="h-10 min-w-[260px] border-none bg-transparent px-0 shadow-none focus-visible:ring-0"
        />
        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["retail-pos-sales"] })}
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="rounded-[1rem] border border-[var(--border)] bg-[var(--surface-base)] p-3">
        <div className="space-y-2">
          {(salesQuery.data?.data ?? []).length === 0 ? (
            <div className="rounded-[1rem] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-3 py-10 text-center text-sm text-[var(--text-muted)]">
              {salesQuery.isLoading ? "Loading transactions..." : "No transactions found."}
            </div>
          ) : (
            (salesQuery.data?.data ?? []).map((sale) => (
              <button
                key={sale.id}
                type="button"
                onClick={() => setSelectedSaleId(sale.id)}
                className="flex w-full items-center justify-between gap-3 rounded-[1rem] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3 text-left"
              >
                <div className="min-w-0">
                  <div className="font-mono font-semibold">{sale.saleNo}</div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">
                    {sale.saleType} - {sale.customerName ?? "Walk-in"} -{" "}
                    {sale.itemCount} items
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm font-semibold">
                    {money(sale.totalAmount)}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {new Date(sale.postedAt).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <Dialog open={Boolean(selectedSaleId)} onOpenChange={(open) => !open && setSelectedSaleId(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selectedSale?.saleNo ?? "Transaction detail"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-[1.25rem] bg-[var(--surface-muted)] px-3 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Type
                </div>
                <div className="mt-2 text-sm font-medium">{selectedSale?.saleType ?? "-"}</div>
              </div>
              <div className="rounded-[1.25rem] bg-[var(--surface-muted)] px-3 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Total
                </div>
                <div className="mt-2 font-mono text-sm font-semibold">
                  {money(selectedSale?.totalAmount ?? 0)}
                </div>
              </div>
              <div className="rounded-[1.25rem] bg-[var(--surface-muted)] px-3 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Promotion
                </div>
                <div className="mt-2 text-sm font-medium">{selectedSale?.promotionCode ?? "-"}</div>
              </div>
              <div className="rounded-[1.25rem] bg-[var(--surface-muted)] px-3 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Source
                </div>
                <div className="mt-2 text-sm font-medium">{selectedSale?.sourceSaleNo ?? "-"}</div>
              </div>
            </div>

            <div className="rounded-[1.25rem] bg-[var(--surface-muted)] px-3 py-3">
              <div className="text-sm font-medium">Lines</div>
              <div className="mt-3 space-y-2">
                {(selectedSale?.lines ?? []).map((line) => (
                  <div
                    key={line.id}
                    className="flex items-center justify-between gap-3 rounded-[1.25rem] bg-[var(--surface-base)] px-3 py-3 text-sm"
                  >
                    <div>
                      <div className="font-medium">{line.itemName}</div>
                      <div className="text-xs text-[var(--text-muted)]">
                        {line.quantity.toFixed(2)} x {money(line.unitPrice)}
                      </div>
                    </div>
                    <NumericCell>{money(line.lineTotal)}</NumericCell>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[1.25rem] bg-[var(--surface-muted)] px-3 py-3">
              <div className="text-sm font-medium">Payments</div>
              <div className="mt-3 space-y-2">
                {(selectedSale?.payments ?? []).map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between gap-3 rounded-[1.25rem] bg-[var(--surface-base)] px-3 py-3 text-sm"
                  >
                    <div>
                      <div className="font-medium">{payment.tenderType.replaceAll("_", " ")}</div>
                      <div className="text-xs text-[var(--text-muted)]">
                        {payment.reference ?? "No reference"}
                      </div>
                    </div>
                    <NumericCell>{money(payment.amount)}</NumericCell>
                  </div>
                ))}
              </div>
            </div>

            {(selectedSale?.reversals ?? []).length ? (
              <div className="rounded-[1.25rem] bg-[var(--surface-muted)] px-3 py-3">
                <div className="text-sm font-medium">Reversals</div>
                <div className="mt-3 space-y-2">
                  {selectedSale?.reversals.map((reversal) => (
                    <div
                      key={reversal.id}
                      className="flex items-center justify-between gap-3 rounded-[1.25rem] bg-[var(--surface-base)] px-3 py-3 text-sm"
                    >
                      <div>
                        <div className="font-medium">{reversal.saleNo}</div>
                        <div className="text-xs text-[var(--text-muted)]">{reversal.saleType}</div>
                      </div>
                      <NumericCell>{money(reversal.totalAmount)}</NumericCell>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {canOverride &&
            currentShift &&
            selectedSale?.saleType === "SALE" &&
            selectedSale.status === "POSTED" ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={startRefund}>
                  Refund
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setVoidDialog(true)}
                  disabled={(selectedSale.reversals ?? []).length > 0}
                >
                  <XCircle className="h-4 w-4" />
                  Void sale
                </Button>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={refundDialog} onOpenChange={setRefundDialog}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Refund {selectedSale?.saleNo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              {(selectedSale?.lines ?? []).map((line) => (
                <div
                  key={line.id}
                  className="grid gap-2 rounded-[1.25rem] bg-[var(--surface-muted)] px-3 py-3 md:grid-cols-[minmax(0,1fr)_130px_120px]"
                >
                  <div>
                    <div className="font-medium">{line.itemName}</div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {line.quantity.toFixed(2)} x {money(line.unitPrice)}
                    </div>
                  </div>
                  <PosNumericField
                    label="Qty"
                    value={refundAmounts[line.id] ?? ""}
                    active={
                      activeRefundNumericTarget?.type === "refund_qty" &&
                      activeRefundNumericTarget.lineId === line.id
                    }
                    onActivate={() =>
                      setActiveRefundNumericTarget({ type: "refund_qty", lineId: line.id })
                    }
                  />
                  <div className="flex items-center justify-end font-mono text-sm">
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

            <Input
              value={refundReason}
              onChange={(event) => setRefundReason(event.target.value)}
              placeholder="Reason"
            />
            <Textarea
              value={refundNotes}
              onChange={(event) => setRefundNotes(event.target.value)}
              rows={2}
              placeholder="Notes"
            />

            {refundPayments.map((payment, index) => (
              <div
                key={`${payment.tenderType}-${index}`}
                className="grid gap-2 md:grid-cols-[1fr_110px_1fr_auto]"
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
                    <SelectItem value="TRANSFER">Transfer</SelectItem>
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
            <Button
              type="button"
              variant="outline"
              className="w-full"
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
            <div className="flex items-center justify-between gap-3 text-sm">
              <span>Refund total</span>
              <span className="font-mono">{money(refundTotal)}</span>
            </div>
            <PosNumericKeypad title="Numeric keypad" onAction={handleRefundKeypadAction} />
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
          <div className="space-y-3">
            <Input
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
              placeholder="Reason"
            />
            <Textarea
              value={voidNotes}
              onChange={(event) => setVoidNotes(event.target.value)}
              rows={3}
              placeholder="Notes"
            />
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
