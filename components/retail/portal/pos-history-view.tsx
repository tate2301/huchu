"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { refundPinSentence, voidPinSentence } from "@/lib/retail/till-rule-words";
import { History, Plus, RefreshCcw, Search, Trash2, XCircle } from "@/lib/icons";
import { PosNumericField } from "./pos-numeric-field";
import { PosNumericKeypad } from "./pos-numeric-keypad";
import { applyPosKeypadAction, type PosKeypadAction } from "./pos-numeric-input";
import {
  PosEmptyState,
  PosMetricCard,
  PosPanel,
  PosStatusPill,
  PosTerminalHeader,
} from "./pos-primitives";
import { usePosPortalState } from "./pos-portal-state";
import type { PaymentRow, SaleDetail, SaleRow, TenderType } from "./pos-types";
import { depositBack } from "@/lib/retail/deposits";
import { getPaymentSummary, money, round } from "./pos-utils";
import {
  formatQuantity,
  formatRetailDateTime,
  saleStatusLabel,
  saleTypeLabel,
  tenderLabel,
} from "@/lib/retail/words";

/** Money goes back as cash, card, a wallet or a voucher; a refund is in the sale's currency. */
const REFUND_TENDERS: TenderType[] = ["CASH", "CARD", "ECOCASH", "INNBUCKS", "VOUCHER"];

export function PosHistoryView() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentShift, canOverride, till } = usePosPortalState();
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

  /**
   * The manager standing at the counter (SET-06). When the till rules ask for
   * a manager — a refund over the limit, a void the rule locks — the cashier
   * picks who approves and that person types their four-digit PIN. The server
   * decides again and answers 409 `needsApprover` if the till guessed wrong;
   * the PIN stays in component state for this one act and is cleared when the
   * dialog closes. FLR-09 replaces this with the till's approval dialog.
   */
  const [approverId, setApproverId] = useState("");
  const [approverPin, setApproverPin] = useState("");
  const [askedFor, setAskedFor] = useState<string | null>(null);
  // When Void was opened: "After 5 minutes" is judged from then.
  const [voidOpenedAt, setVoidOpenedAt] = useState<number | null>(null);
  const rules = till?.rules ?? null;
  const approvers = till?.approvers ?? [];

  const managerApproval = (reason: string) => (
    <div
      className="space-y-3 rounded-xl px-4 py-4 ring-1"
      style={{
        background: "var(--pos-status-warning-bg)",
        boxShadow: `inset 0 0 0 1px var(--pos-status-warning-ring)`,
      }}
    >
      <div className="text-sm font-semibold text-[var(--pos-status-warning-text)]">{reason}</div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Manager">
        {approvers.length === 0 ? (
          <span className="text-sm text-[var(--text-muted)]">Nobody here can approve it with a PIN yet.</span>
        ) : (
          approvers.map((person) => (
            <Button
              key={person.userId}
              type="button"
              role="radio"
              aria-checked={approverId === person.userId}
              variant={approverId === person.userId ? "default" : "outline"}
              className="h-11"
              onClick={() => setApproverId(person.userId)}
            >
              {person.name}
            </Button>
          ))
        )}
      </div>
      <Input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        value={approverPin}
        onChange={(event) => setApproverPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
        placeholder="Manager PIN"
        aria-label="Manager PIN"
        className="h-11 font-mono tracking-[0.4em]"
      />
    </div>
  );

  const forgetApproval = () => {
    setApproverId("");
    setApproverPin("");
    setAskedFor(null);
  };

  /** The `approver` body field once a manager has been picked and typed their PIN. */
  const approvalPayload = () =>
    approverId && approverPin.length === 4 ? { approver: { userId: approverId, pin: approverPin } } : {};

  /**
   * A 409 `needsApprover` (C-31) opens the approval with the server's sentence.
   * When it names a field, the approver given was refused: the PIN is cleared
   * (and the person, when they may not approve) and the error is shown. A
   * locked PIN (423) is cleared and shown.
   */
  const onRefused = (error: unknown) => {
    if (error instanceof ApiError) {
      const details = error.details as
        | { needsApprover?: boolean; reason?: string; fieldErrors?: { pin?: string; approver?: string } }
        | undefined;
      if (error.status === 409 && details?.needsApprover) {
        if (!details.fieldErrors) {
          setAskedFor(details.reason ?? error.message);
          return true;
        }
        setApproverPin("");
        if (details.fieldErrors.approver) setApproverId("");
      }
      if (error.status === 423) setApproverPin("");
    }
    return false;
  };

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

  const selectedSale = saleDetailQuery.data?.data ?? null;
  const refundTotal = round(
    (selectedSale?.lines ?? []).reduce((sum, line) => {
      const quantity = Number(refundAmounts[line.id] || "0");
      if (quantity <= 0 || line.quantity <= 0) {
        return sum;
      }
      // The bottles' deposit goes back with the goods, by the server's arithmetic.
      const deposit = depositBack(
        {
          quantity: Number(line.quantity),
          depositAmount: Number(line.depositAmount ?? 0),
          depositRefunded: Number(line.depositRefunded ?? 0),
        },
        quantity,
        Number(line.refundableQuantity ?? line.quantity),
      );
      return sum + round(Math.abs(line.lineTotal) * (quantity / line.quantity)) + deposit;
    }, 0),
  );
  const refundPaymentSummary = useMemo(
    () => getPaymentSummary(refundPayments, refundTotal),
    [refundPayments, refundTotal],
  );
  const refundTenderGap = round(refundPaymentSummary.tenderedTotal - refundTotal);

  // What earlier refunds of this sale gave back: the limit is on the sale's refunds together.
  const alreadyRefunded = round(
    (selectedSale?.lines ?? []).reduce((sum, line) => {
      if (line.quantity <= 0) return sum;
      const refundedQuantity = Math.max(line.quantity - Number(line.refundableQuantity ?? line.quantity), 0);
      return (
        sum + round(Math.abs(line.lineTotal) * (refundedQuantity / line.quantity)) + Math.abs(Number(line.depositRefunded ?? 0))
      );
    }, 0),
  );

  // What the till rules ask before the server is asked: the server decides again.
  const refundAsks =
    askedFor ??
    (!canOverride && rules && refundTotal + alreadyRefunded > Number(rules.refundPinOver)
      ? refundPinSentence(rules.refundPinOver, rules.currency)
      : null);
  const saleAgeMs =
    voidOpenedAt !== null && selectedSale?.postedAt ? voidOpenedAt - new Date(selectedSale.postedAt).getTime() : 0;
  const voidLocked =
    rules?.voidPin === "ALWAYS" || (rules?.voidPin === "AFTER_5_MINUTES" && saleAgeMs > 5 * 60 * 1000);
  const voidAsks = askedFor ?? (!canOverride && rules && voidLocked ? voidPinSentence(rules.voidPin) : null);
  const approvalReady = (asks: string | null) => !asks || (Boolean(approverId) && approverPin.length === 4);

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
          ...approvalPayload(),
        }),
      }),
    onSuccess: () => {
      toast({ title: "Refund saved", variant: "success" });
      setRefundDialog(false);
      forgetApproval();
      setRefundReason("");
      setRefundNotes("");
      setRefundAmounts({});
      setRefundPayments([{ tenderType: "CASH", amount: "", reference: "" }]);
      queryClient.invalidateQueries({ queryKey: ["retail-pos-sales"] });
      queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
      queryClient.invalidateQueries({ queryKey: ["retail-pos-sale-detail"] });
    },
    onError: (error) => {
      if (onRefused(error)) return;
      toast({
        title: "That refund was not saved",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const voidMutation = useMutation({
    mutationFn: () =>
      fetchJson(`/api/v2/retail/pos/sales/${selectedSale?.id}/void`, {
        method: "POST",
        body: JSON.stringify({
          shiftId: currentShift?.id,
          reason: voidReason.trim(),
          notes: voidNotes.trim() || undefined,
          ...approvalPayload(),
        }),
      }),
    onSuccess: () => {
      toast({ title: "Sale voided", variant: "success" });
      setVoidDialog(false);
      forgetApproval();
      setVoidReason("");
      setVoidNotes("");
      queryClient.invalidateQueries({ queryKey: ["retail-pos-sales"] });
      queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
      queryClient.invalidateQueries({ queryKey: ["retail-pos-sale-detail"] });
    },
    onError: (error) => {
      if (onRefused(error)) return;
      toast({
        title: "That sale was not voided",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
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
        amount: String(round(Math.abs(Number(selectedSale.totalAmount)) + Math.abs(Number(selectedSale.depositAmount ?? 0)))),
        reference: "",
      },
    ]);
    forgetApproval();
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
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-muted)] px-3.5 py-2 transition-all focus-within:border-[var(--action-primary-bg)] focus-within:bg-[var(--surface-base)] focus-within:ring-2 focus-within:ring-[var(--action-primary-bg)] focus-within:ring-offset-1">
            <Search className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search sale number, customer, product…"
              aria-label="Search the sales"
              className="h-10 border-none bg-transparent px-0 text-[14px] shadow-none focus-visible:ring-0"
            />
            {search && (
              <button
                type="button"
                aria-label="Clear the search"
                onClick={() => setSearch("")}
                className="shrink-0 rounded-md p-0.5 text-[var(--text-muted)] hover:text-[var(--text-strong)]"
              >
                <XCircle className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["retail-pos-sales"] })}
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh the list
          </Button>
        </div>
      </PosPanel>

      <PosPanel className="min-h-0">
        <div className="h-full min-h-0 overflow-auto">
          {saleRows.length === 0 ? (
            <PosEmptyState
              icon={History}
              title={
                salesQuery.isLoading
                  ? "Loading the sales…"
                  : salesQuery.isError
                    ? "The sales would not load"
                    : search.trim()
                      ? "No sales match that search"
                      : "No sales yet"
              }
            />
          ) : (
            <table className="w-full min-w-[860px] text-sm">
              <thead className="sticky top-0 z-10 border-b border-[var(--border-subtle)] bg-[var(--surface-base)] text-left text-xs text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-3">Sale</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3 text-right">Products</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Date</th>
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
                        {isRefund || isVoid ? (
                          <PosStatusPill tone={isRefund ? "danger" : "warning"}>
                            {saleTypeLabel(sale.saleType)}
                          </PosStatusPill>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 text-[var(--text-muted)]">
                        {sale.customerName ?? "Walk-in"}
                      </td>
                      <td className="px-4 py-4 text-right font-mono text-[var(--text-muted)]">
                        {sale.itemCount}
                      </td>
                      <td className="px-4 py-4">
                        {sale.status === "POSTED" ? null : (
                          <PosStatusPill tone="warning">{saleStatusLabel(sale.status)}</PosStatusPill>
                        )}
                      </td>
                      <td className={`px-4 py-4 text-right font-mono text-[13px] font-black ${isRefund ? "text-red-600" : "text-[var(--text-strong)]"}`}>
                        {isRefund && sale.totalAmount < 0 ? "−" : ""}
                        {money(Math.abs(sale.totalAmount) + Math.abs(sale.depositAmount ?? 0))}
                      </td>
                      <td className="px-4 py-4 font-mono text-xs text-[var(--text-muted)]">
                        {formatRetailDateTime(sale.postedAt)}
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
                eyebrow={saleTypeLabel(selectedSale.saleType)}
                title={selectedSale.saleNo}
                subtitle={[
                  selectedSale.customerName ?? "Walk-in",
                  selectedSale.postedAt ? formatRetailDateTime(selectedSale.postedAt) : "Not saved yet",
                ].join(" · ")}
                valuePrimary={money(Math.abs(Number(selectedSale.totalAmount)) + Math.abs(Number(selectedSale.depositAmount ?? 0)))}
                valueSecondary={`${selectedSale.lines.length} product${selectedSale.lines.length !== 1 ? "s" : ""}`}
                pill={
                  selectedSale.status === "POSTED" ? null : (
                    <PosStatusPill tone="warning">{saleStatusLabel(selectedSale.status)}</PosStatusPill>
                  )
                }
              />

              <div className="max-h-[70vh] overflow-y-auto">
                <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.9fr)]">
                  {/* Line items */}
                  <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-muted)] overflow-hidden">
                    <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-base)] px-4 py-3">
                      <span className="text-[12px] font-bold text-[var(--text-muted)]">
                        Products
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
                              {formatQuantity(line.quantity)} × {money(line.unitPrice)}
                            </div>
                          </div>
                          <span className="shrink-0 font-mono text-[13px] font-bold text-[var(--text-strong)]">
                            {money(line.lineTotal)}
                          </span>
                        </div>
                      ))}
                      {Number(selectedSale.depositAmount ?? 0) !== 0 ? (
                        <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                          <div className="font-semibold text-[var(--text-strong)]">Bottle deposits</div>
                          <span className="shrink-0 font-mono text-[13px] font-bold text-[var(--text-strong)]">
                            {money(Number(selectedSale.depositAmount))}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-3">
                    {/* Payments */}
                    <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-muted)] overflow-hidden">
                      <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-base)] px-4 py-3">
                        <span className="text-[12px] font-bold text-[var(--text-muted)]">
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
                                {tenderLabel(payment.tenderType)}
                              </div>
                              {payment.reference && (
                                <div className="truncate text-[11px] text-[var(--text-muted)]">
                                  Reference {payment.reference}
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
                            <span>Promotion</span>
                            <span className="font-mono font-semibold text-[var(--text-strong)]">{selectedSale.promotionCode}</span>
                          </div>
                        )}
                        {selectedSale.sourceSaleNo && (
                          <div className="flex justify-between text-[var(--text-muted)]">
                            <span>Original sale</span>
                            <span className="font-mono font-semibold text-[var(--text-strong)]">{selectedSale.sourceSaleNo}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Actions / reversals */}
                    <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-muted)] px-4 py-4">
                      <div className="mb-3 text-[12px] font-bold text-[var(--text-muted)]">
                        Refunds and voids
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
                                <span className="ml-2 text-xs text-[var(--text-muted)]">{saleTypeLabel(reversal.saleType)}</span>
                              </div>
                              <span className="font-mono text-sm font-bold text-red-600">
                                {money(reversal.totalAmount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/*
                        `canOverride` no longer gates this. It is
                        `retail.sell:approve` for the shift's actor, and the POS portal
                        admits only cashiers — so gating on it hid both buttons
                        from every user who can open this screen. A cashier sees
                        them now and is asked for a manager's approval inside
                        the dialog; the server verifies it.
                      */}
                      {currentShift && selectedSale.saleType === "SALE" && selectedSale.status === "POSTED" ? (
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
                            onClick={() => {
                              forgetApproval();
                              setVoidOpenedAt(Date.now());
                              setVoidDialog(true);
                            }}
                            disabled={(selectedSale.reversals ?? []).length > 0}
                          >
                            <XCircle className="h-4 w-4" />
                            Void
                          </Button>
                        </div>
                      ) : !currentShift ? (
                        <p className="text-xs text-[var(--text-muted)]">Open a shift first</p>
                      ) : (selectedSale.reversals ?? []).length === 0 ? (
                        <p className="text-xs text-[var(--text-muted)]">No refunds or voids</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="p-6">
              <PosEmptyState
                icon={History}
                title={saleDetailQuery.isError ? "That sale would not load" : "Loading the sale…"}
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
                tone="warning"
              />
              <PosMetricCard
                icon={RefreshCcw}
                label="Tendered"
                value={money(refundPaymentSummary.tenderedTotal)}
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
                tone={Math.abs(refundTenderGap) <= 0.01 ? "success" : "warning"}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_320px]">
              <div className="space-y-4">
                <div className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-4 py-4">
                  <div className="text-sm font-semibold text-[var(--text-strong)]">
                    Products to refund
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
                            Sold {formatQuantity(line.quantity)} × {money(line.unitPrice)}
                          </div>
                        </div>
                        <PosNumericField
                          label="Quantity"
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
                      <ReasonPicker
                        label="Refund reason"
                        reasons={rules?.refundReasons ?? []}
                        value={refundReason}
                        onChange={setRefundReason}
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
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-[var(--text-strong)]">
                      Refund tenders
                    </div>
                    {Math.abs(refundTenderGap) <= 0.01 ? null : (
                      <PosStatusPill tone="warning">
                        {refundTenderGap > 0 ? "Over" : "Short"}
                      </PosStatusPill>
                    )}
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
                            {REFUND_TENDERS.map((tender) => (
                              <SelectItem key={tender} value={tender}>
                                {tenderLabel(tender)}
                              </SelectItem>
                            ))}
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
                          aria-label="Remove the tender"
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
                    Add a tender
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-4 py-4">
                <div className="text-sm font-semibold text-[var(--text-strong)]">
                  Keypad
                </div>
                <div className="mt-4">
                  <PosNumericKeypad onAction={handleRefundKeypadAction} />
                </div>
              </div>
            </div>

            {refundAsks ? managerApproval(refundAsks) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRefundDialog(false);
                forgetApproval();
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => refundMutation.mutate()}
              disabled={
                refundMutation.isPending ||
                refundTotal <= 0 ||
                !refundReason.trim() ||
                Math.abs(refundPaymentSummary.tenderedTotal - refundTotal) > 0.01 ||
                !approvalReady(refundAsks)
              }
            >
              Refund the sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={voidDialog} onOpenChange={setVoidDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Void {selectedSale?.saleNo}?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div
              className="rounded-xl px-4 py-4 ring-1"
              style={{ background: "var(--pos-status-danger-bg)", boxShadow: `inset 0 0 0 1px var(--pos-status-danger-ring)` }}
            >
              <div className="text-sm font-semibold text-[var(--status-error-text)]">
                The whole sale is cancelled. To take back part of it, refund it instead.
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-3 py-3">
                <div className="text-xs font-semibold text-[var(--text-muted)]">
                  Sale
                </div>
                <div className="mt-2 font-mono text-sm font-semibold text-[var(--text-strong)]">
                  {selectedSale?.saleNo ?? "-"}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-3 py-3">
                <div className="text-xs font-semibold text-[var(--text-muted)]">
                  Total
                </div>
                <div className="mt-2 font-mono text-sm font-semibold text-[var(--text-strong)]">
                  {money(Number(selectedSale?.totalAmount ?? 0) + Number(selectedSale?.depositAmount ?? 0))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-[var(--text-strong)]">
                Reason
              </label>
              <ReasonPicker
                label="Void reason"
                reasons={rules?.voidReasons ?? []}
                value={voidReason}
                onChange={setVoidReason}
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
              />
            </div>

            {voidAsks ? managerApproval(voidAsks) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setVoidDialog(false);
                forgetApproval();
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => voidMutation.mutate()}
              disabled={voidMutation.isPending || !voidReason.trim() || !approvalReady(voidAsks)}
            >
              Void the sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** The till rules' reasons as buttons: a reason is picked, never typed (SET-06). */
function ReasonPicker({
  label,
  reasons,
  value,
  onChange,
}: {
  label: string;
  reasons: string[];
  value: string;
  onChange: (reason: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
      {reasons.map((reason) => (
        <Button
          key={reason}
          type="button"
          role="radio"
          aria-checked={value === reason}
          variant={value === reason ? "default" : "outline"}
          className="h-11"
          onClick={() => onChange(reason)}
        >
          {reason}
        </Button>
      ))}
    </div>
  );
}
