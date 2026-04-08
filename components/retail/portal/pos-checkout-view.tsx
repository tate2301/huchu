"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Clock, Package, Payments, Plus, Trash2, Wallet } from "@/lib/icons";
import { getPosPortalHref } from "@/lib/retail/pos-host";
import { usePosPortalState } from "./pos-portal-state";
import type { PaymentRow, TenderType } from "./pos-types";
import { money } from "./pos-utils";

const REFERENCE_REQUIRED_TENDERS: TenderType[] = ["CARD", "MOBILE_MONEY"];

function requiresReference(tenderType: TenderType) {
  return REFERENCE_REQUIRED_TENDERS.includes(tenderType);
}

function normalizeWhatsappPhone(input: string | null | undefined) {
  return String(input ?? "").replace(/\D/g, "");
}

export function PosCheckoutView() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [holdDialog, setHoldDialog] = useState(false);
  const [holdLabel, setHoldLabel] = useState("");
  const {
    search,
    setSearch,
    cart,
    customerName,
    setCustomerName,
    customerPhone,
    setCustomerPhone,
    customerEmail,
    setCustomerEmail,
    payments,
    setPayments,
    orderDiscountAmount,
    setOrderDiscountAmount,
    overrideReason,
    setOverrideReason,
    selectedPromotionId,
    setSelectedPromotionId,
    currentShift,
    isPosHost,
    catalogItems,
    catalogLoading,
    promotions,
    canOverride,
    subtotal,
    discountAmount,
    taxAmount,
    total,
    changeAmount,
    tenderedTotal,
    nonCashTotal,
    addToCart,
    updateQty,
    updateItemPrice,
    updateItemDiscount,
    removeFromCart,
    clearCart,
    postSale,
    postSalePending,
    pendingOfflineSales,
    syncOfflineSales,
    syncOfflineSalesPending,
    lastCompletedSale,
    dismissCompletedSale,
  } = usePosPortalState();
  const hasMissingRequiredReference = payments.some(
    (payment) =>
      requiresReference(payment.tenderType) &&
      payment.amount.trim() !== "" &&
      payment.reference.trim().length < 4,
  );
  const whatsappHref = (() => {
    if (!lastCompletedSale) return null;
    const message = [
      `Receipt ${lastCompletedSale.saleNo}`,
      `Amount: ${money(lastCompletedSale.totalAmount)}`,
      `Change: ${money(lastCompletedSale.changeAmount)}`,
      lastCompletedSale.customerName ? `Customer: ${lastCompletedSale.customerName}` : null,
      "Thank you for shopping with us.",
    ]
      .filter(Boolean)
      .join("\n");
    const encoded = encodeURIComponent(message);
    const phone = normalizeWhatsappPhone(lastCompletedSale.customerPhone);
    return phone
      ? `https://wa.me/${phone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
  })();

  const holdCartMutation = useMutation({
    mutationFn: () =>
      fetchJson("/api/v2/retail/pos/held-carts", {
        method: "POST",
        body: JSON.stringify({
          shiftId: currentShift?.id,
          label: holdLabel.trim() || undefined,
          cartSnapshot: {
            items: cart,
            customerName,
            orderDiscountAmount,
            selectedPromotionId,
          },
        }),
      }),
    onSuccess: () => {
      toast({ title: "Cart held", variant: "success" });
      setHoldDialog(false);
      setHoldLabel("");
      clearCart();
      queryClient.invalidateQueries({ queryKey: ["retail-held-carts"] });
      router.push(getPosPortalHref("held", isPosHost));
    },
    onError: (error) =>
      toast({
        title: "Unable to hold cart",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const addPaymentRow = () => {
    setPayments((current) => [
      ...current,
      { tenderType: "CARD", amount: "", reference: "" },
    ]);
  };

  const updatePayment = (
    index: number,
    next: Partial<PaymentRow>,
  ) => {
    setPayments((current) =>
      current.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...next } : entry,
      ),
    );
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_430px]">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-[1.25rem] bg-[var(--surface-muted)] px-3 py-2.5">
          <div className="inline-flex min-h-9 items-center gap-2 rounded-full bg-[var(--surface-base)] px-3 text-xs font-medium text-[var(--text-muted)]">
            <Clock className="h-4 w-4" />
            {currentShift ? currentShift.shiftNo : "No open shift"}
          </div>
          {currentShift ? (
            <>
              <div className="text-sm font-medium">{currentShift.site?.name ?? "Site"}</div>
              <div className="text-xs text-[var(--text-muted)]">{currentShift.registerName}</div>
              <div className="font-mono text-xs text-[var(--text-muted)]">
                {money(currentShift.netSalesValue)} net
              </div>
            </>
          ) : null}
          <div className="ml-auto flex flex-wrap gap-2">
            {!currentShift ? (
              <Button asChild size="sm">
                <Link href={getPosPortalHref("shift", isPosHost)}>Open shift</Link>
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setHoldDialog(true)}
                  disabled={cart.length === 0}
                >
                  Hold
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={getPosPortalHref("shift", isPosHost)}>Cash-up</Link>
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="rounded-[1.25rem] bg-[var(--surface-muted)] px-3 py-2.5">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Scan barcode or search item"
            className="border-none bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
        </div>
        {pendingOfflineSales > 0 ? (
          <div className="flex items-center justify-between gap-3 rounded-[1rem] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <span>
              {pendingOfflineSales} sale{pendingOfflineSales === 1 ? "" : "s"} pending offline sync
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={syncOfflineSales}
              disabled={syncOfflineSalesPending}
            >
              Sync now
            </Button>
          </div>
        ) : null}

        {promotions.length > 0 ? (
          <div className="flex gap-2 overflow-auto pb-1">
            <button
              type="button"
              onClick={() => setSelectedPromotionId("")}
              className={
                selectedPromotionId
                  ? "rounded-full bg-[var(--surface-muted)] px-3 py-1.5 text-xs text-[var(--text-muted)]"
                  : "rounded-full bg-[#d1a45a] px-3 py-1.5 text-xs text-[#2b1f0d]"
              }
            >
              No promotion
            </button>
            {promotions.map((promotion) => (
              <button
                key={promotion.id}
                type="button"
                onClick={() => setSelectedPromotionId(promotion.id)}
                className={
                  selectedPromotionId === promotion.id
                    ? "rounded-full bg-[#d1a45a] px-3 py-1.5 text-xs text-[#2b1f0d]"
                    : "rounded-full bg-[var(--surface-muted)] px-3 py-1.5 text-xs text-[var(--text-muted)]"
                }
              >
                {promotion.name}
              </button>
            ))}
          </div>
        ) : null}

        <div className="rounded-[1.5rem] bg-[var(--surface-muted)] p-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(catalogItems ?? []).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => addToCart(item)}
                disabled={!currentShift}
                className="rounded-[1.25rem] bg-[var(--surface-base)] px-3 py-3 text-left transition-transform duration-150 hover:-translate-y-0.5 disabled:opacity-60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{item.name}</div>
                    <div className="mt-1 font-mono text-[11px] text-[var(--text-muted)]">
                      {item.barcode || item.sku}
                    </div>
                  </div>
                  <Package className="h-4 w-4 text-[var(--text-muted)]" />
                </div>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <div>
                    <div className="font-mono text-base font-semibold">
                      {money(item.unitPrice)}
                    </div>
                    {item.compareAtPrice ? (
                      <div className="font-mono text-[11px] text-[var(--text-muted)] line-through">
                        {money(item.compareAtPrice)}
                      </div>
                    ) : null}
                  </div>
                  <div className="text-right text-[11px] text-[var(--text-muted)]">
                    {item.inventoryItem
                      ? `${item.inventoryItem.currentStock.toFixed(2)} ${item.inventoryItem.unit}`
                      : "No stock"}
                  </div>
                </div>
              </button>
            ))}
          </div>
          {catalogLoading ? (
            <div className="px-2 py-8 text-center text-sm text-[var(--text-muted)]">
              Loading catalog...
            </div>
          ) : null}
          {!catalogLoading && catalogItems.length === 0 ? (
            <div className="px-2 py-8 text-center text-sm text-[var(--text-muted)]">
              No sellable items found for this register.
            </div>
          ) : null}
        </div>
      </section>

      <aside className="space-y-3">
        <div className="rounded-[1.5rem] bg-[var(--surface-muted)] p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">Current sale</div>
            <div className="text-xs text-[var(--text-muted)]">{cart.length} lines</div>
          </div>

          <div className="mt-3 space-y-2">
            {cart.length === 0 ? (
              <div className="rounded-[1.25rem] bg-[var(--surface-base)] px-3 py-10 text-center text-sm text-[var(--text-muted)]">
                Add items to start a sale.
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={item.catalogItemId}
                  className="rounded-[1.25rem] bg-[var(--surface-base)] px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{item.name}</div>
                      <div className="mt-1 font-mono text-[11px] text-[var(--text-muted)]">
                        {money(item.unitPrice)} each
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => removeFromCart(item.catalogItemId)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => updateQty(item.catalogItemId, item.quantity - 1)}
                    >
                      -
                    </Button>
                    <Input
                      value={String(item.quantity)}
                      onChange={(event) =>
                        updateQty(item.catalogItemId, Number(event.target.value || "0"))
                      }
                      inputMode="decimal"
                      className="h-9 text-center font-mono"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => updateQty(item.catalogItemId, item.quantity + 1)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {canOverride ? (
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      <Input
                        value={String(item.unitPrice)}
                        onChange={(event) =>
                          updateItemPrice(
                            item.catalogItemId,
                            Number(event.target.value || "0"),
                          )
                        }
                        inputMode="decimal"
                        className="h-9"
                        placeholder="Override price"
                      />
                      <Input
                        value={String(item.lineDiscountAmount ?? 0)}
                        onChange={(event) =>
                          updateItemDiscount(
                            item.catalogItemId,
                            Number(event.target.value || "0"),
                          )
                        }
                        inputMode="decimal"
                        className="h-9"
                        placeholder="Line discount"
                      />
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[1.5rem] bg-[var(--surface-muted)] p-3">
          <div className="grid gap-2">
            <Input
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Walk-in or customer name"
              className="h-11"
            />
            <div className="grid gap-2 md:grid-cols-2">
              <Input
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
                placeholder="Customer phone (WhatsApp)"
                className="h-11"
              />
              <Input
                value={customerEmail}
                onChange={(event) => setCustomerEmail(event.target.value)}
                placeholder="Customer email"
                className="h-11"
              />
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <Input
                value={orderDiscountAmount}
                onChange={(event) => setOrderDiscountAmount(event.target.value)}
                inputMode="decimal"
                className="h-11"
                placeholder="Order discount"
              />
              {canOverride ? (
                <Input
                  value={overrideReason}
                  onChange={(event) => setOverrideReason(event.target.value)}
                  className="h-11"
                  placeholder="Override reason"
                />
              ) : null}
            </div>

            <div className="rounded-[1.25rem] bg-[var(--surface-base)] px-3 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span>Subtotal</span>
                <span className="font-mono">{money(subtotal)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span>Discounts</span>
                <span className="font-mono">{money(discountAmount)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span>Tax</span>
                <span className="font-mono">{money(taxAmount)}</span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-3 text-base font-semibold">
                <span>Total</span>
                <span className="font-mono">{money(total)}</span>
              </div>
            </div>

            <div className="space-y-2">
              {payments.map((payment, index) => (
                <div
                  key={`${payment.tenderType}-${index}`}
                  className="grid gap-2 md:grid-cols-[1fr_110px_1fr_auto]"
                >
                  <Select
                    value={payment.tenderType}
                    onValueChange={(value) =>
                      updatePayment(index, { tenderType: value as TenderType })
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
                  <Input
                    value={payment.amount}
                    onChange={(event) =>
                      updatePayment(index, { amount: event.target.value })
                    }
                    inputMode="decimal"
                    placeholder="Amount"
                    className="h-11"
                  />
                  <Input
                    value={payment.reference}
                    onChange={(event) =>
                      updatePayment(index, { reference: event.target.value })
                    }
                    placeholder={
                      requiresReference(payment.tenderType)
                        ? "Reference (required)"
                        : "Reference"
                    }
                    className="h-11"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 px-3"
                    onClick={() =>
                      setPayments((current) =>
                        current.filter((_, paymentIndex) => paymentIndex !== index),
                      )
                    }
                    disabled={payments.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" className="w-full" onClick={addPaymentRow}>
                <Plus className="h-4 w-4" />
                Add tender
              </Button>
            </div>

            <div className="rounded-[1.25rem] bg-[var(--surface-base)] px-3 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span>Tendered</span>
                <span className="font-mono">{money(tenderedTotal)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span>Change</span>
                <span className="font-mono">{money(changeAmount)}</span>
              </div>
            </div>

            <Button
              className="h-12 text-base"
              onClick={postSale}
              disabled={
                !currentShift ||
                cart.length === 0 ||
                nonCashTotal > total ||
                tenderedTotal < total ||
                hasMissingRequiredReference ||
                postSalePending
              }
            >
              <Wallet className="h-4 w-4" />
              Complete sale
            </Button>
          </div>
        </div>
      </aside>

      <Dialog open={holdDialog} onOpenChange={setHoldDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hold cart</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="block text-sm font-semibold">Label</label>
            <Input
              value={holdLabel}
              onChange={(event) => setHoldLabel(event.target.value)}
              placeholder="Counter pickup"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setHoldDialog(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => holdCartMutation.mutate()}
              disabled={holdCartMutation.isPending}
            >
              Hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(lastCompletedSale)} onOpenChange={(open) => !open && dismissCompletedSale()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sale completed</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-[1.25rem] bg-[var(--surface-muted)] px-3 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                Receipt
              </div>
              <div className="mt-2 font-mono text-lg font-semibold">
                {lastCompletedSale?.saleNo}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                <span>Total</span>
                <span className="font-mono">{money(lastCompletedSale?.totalAmount ?? 0)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                <span>Change</span>
                <span className="font-mono">{money(lastCompletedSale?.changeAmount ?? 0)}</span>
              </div>
              {lastCompletedSale?.loyalty ? (
                <div className="mt-3 border-t border-[var(--border-subtle)] pt-3 text-xs text-[var(--text-muted)]">
                  Loyalty: +{lastCompletedSale.loyalty.pointsEarned} points, balance{" "}
                  <span className="font-mono">{lastCompletedSale.loyalty.pointsBalance}</span> (
                  {lastCompletedSale.loyalty.tier})
                </div>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={dismissCompletedSale}>
              Continue selling
            </Button>
            {whatsappHref ? (
              <Button asChild variant="outline">
                <a href={whatsappHref} target="_blank" rel="noreferrer">
                  Send WhatsApp receipt
                </a>
              </Button>
            ) : null}
            <Button asChild>
              <Link href={getPosPortalHref("history", isPosHost)}>
                <Payments className="h-4 w-4" />
                View history
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
