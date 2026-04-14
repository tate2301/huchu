"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/components/ui/use-toast";
import { useOfflineRuntime } from "@/components/providers/offline-provider";
import { createOfflineRetailCustomer } from "@/lib/retail/offline-runtime";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Package,
  Payments,
  ReceiptLong,
  Save,
  Search,
  Sparkles,
  Trash2,
  User,
  Users,
  Wallet,
  X,
  Plus,
} from "@/lib/icons";
import { cn } from "@/lib/utils";
import { getPosPortalHref } from "@/lib/retail/pos-host";
import { PosInlineValidationBanner } from "./pos-inline-validation-banner";
import { PosNumericKeypad } from "./pos-numeric-keypad";
import { applyPosKeypadAction, type PosKeypadAction } from "./pos-numeric-input";
import { PosEmptyState, PosStatusPill } from "./pos-primitives";
import { usePosPortalState } from "./pos-portal-state";
import type { PaymentRow, TenderType } from "./pos-types";
import { money } from "./pos-utils";

/* ─── Types ─────────────────────────────────────────────────────── */

type CheckoutNumericTarget =
  | { type: "line_qty"; lineId: string }
  | { type: "line_price"; lineId: string }
  | { type: "line_discount"; lineId: string }
  | { type: "order_discount" }
  | { type: "tender_amount"; index: number }
  | { type: "redeem_points" };

/* ─── Helpers ───────────────────────────────────────────────────── */

function requiresReference(tenderType: TenderType, requiredReferenceTenders: TenderType[]) {
  return requiredReferenceTenders.includes(tenderType);
}

function normalizeWhatsappPhone(input: string | null | undefined) {
  return String(input ?? "").replace(/\D/g, "");
}

function roundUp(value: number, step: number) {
  if (value <= 0) return 0;
  return Math.ceil(value / step) * step;
}

function tenderLabel(tenderType: TenderType) {
  switch (tenderType) {
    case "CASH":
      return "Cash";
    case "CARD":
      return "Card";
    case "MOBILE_MONEY":
      return "Mobile money";
    case "TRANSFER":
      return "Transfer";
    case "VOUCHER":
      return "Voucher";
    default:
      return tenderType;
  }
}

/* ─── Compact numeric field (inline) ────────────────────────────── */

function NumField({
  label,
  value,
  active,
  onActivate,
  className,
}: {
  label: string;
  value: string;
  active?: boolean;
  onActivate: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onActivate}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-all duration-150",
        active
          ? "border-[var(--action-primary-bg)] bg-[color-mix(in_srgb,var(--action-primary-bg)_6%,var(--surface-base))] ring-2 ring-[var(--action-primary-bg)] ring-offset-1"
          : "border-[var(--border-default)] bg-[var(--surface-base)] hover:bg-[var(--surface-muted)]",
        className,
      )}
    >
      <span className="text-xs text-[var(--text-muted)]">{label}</span>
      <span className="font-mono text-sm font-semibold text-[var(--text-strong)]">
        {value || "0"}
      </span>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════ */

export function PosCheckoutView() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { tenantKey } = useOfflineRuntime();
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  /* ── Local state ─────────────────────────────────── */
  const [holdDialog, setHoldDialog] = useState(false);
  const [holdLabel, setHoldLabel] = useState("");
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [activeTarget, setActiveTarget] = useState<CheckoutNumericTarget | null>(null);
  const [customerSheetOpen, setCustomerSheetOpen] = useState(false);
  const [adjustmentsOpen, setAdjustmentsOpen] = useState(false);

  /* ── Global POS state ────────────────────────────── */
  const {
    search,
    setSearch,
    cart,
    customerName,
    setCustomerName,
    selectedCustomerId,
    selectCustomer,
    customerSearchResults,
    customerSearchLoading,
    customerPhone,
    setCustomerPhone,
    customerEmail,
    setCustomerEmail,
    loyaltyRedemptionPoints,
    setLoyaltyRedemptionPoints,
    payments,
    setPayments,
    splitTenderMode,
    setSplitTenderMode,
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
    checkoutBaseBlockers,
    pendingOfflineSales,
    syncOfflineSales,
    syncOfflineSalesPending,
    requiredReferenceTenders,
    minReferenceLength,
    lastCompletedSale,
    dismissCompletedSale,
  } = usePosPortalState();

  /* ── Derived state ───────────────────────────────── */

  const selectedLine = useMemo(
    () => cart.find((line) => line.catalogItemId === selectedLineId) ?? null,
    [cart, selectedLineId],
  );

  const selectedCustomer =
    customerSearchResults.find((customer) => customer.id === selectedCustomerId) ?? null;

  const selectedPromotion =
    promotions.find((promotion) => promotion.id === selectedPromotionId) ?? null;

  const lineCountLabel = `${cart.length} item${cart.length === 1 ? "" : "s"}`;

  /* ── Focus helper ────────────────────────────────── */

  const focusSearchInput = () => {
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  };

  const handleAddCatalogItem = (item: (typeof catalogItems)[number]) => {
    addToCart(item);
    /* BUG FIX: Auto-set activeTarget to payment amount when first item added */
    if (activeTarget === null && selectedLineId === null) {
      setActiveTarget({ type: "tender_amount", index: 0 });
    }
    setSearch("");
    focusSearchInput();
  };

  /* ── Payment sync ────────────────────────────────── */

  useEffect(() => {
    if (splitTenderMode) return;
    if (payments.length !== 1) {
      const base = payments[0] ?? {
        tenderType: "CASH" as TenderType,
        amount: "",
        reference: "",
      };
      setPayments([{ ...base }]);
      return;
    }
    if (cart.length > 0 && !payments[0].amount.trim()) {
      setPayments((current) =>
        current.map((payment, index) =>
          index === 0 ? { ...payment, amount: total.toFixed(2) } : payment,
        ),
      );
    }
    if (cart.length === 0 && payments[0].amount.trim()) {
      setPayments((current) =>
        current.map((payment, index) => (index === 0 ? { ...payment, amount: "" } : payment)),
      );
    }
  }, [cart.length, payments, setPayments, splitTenderMode, total]);

  /* BUG FIX: Also auto-set activeTarget when cart is restored (e.g. from held carts)
     We use a ref to detect when cart transitions from empty to non-empty */
  const prevCartLengthRef = useRef(cart.length);
  useEffect(() => {
    const wasEmpty = prevCartLengthRef.current === 0;
    prevCartLengthRef.current = cart.length;
    if (wasEmpty && cart.length > 0 && activeTarget === null && selectedLineId === null) {
      // Use requestAnimationFrame to avoid synchronous setState in effect
      requestAnimationFrame(() => {
        setActiveTarget({ type: "tender_amount", index: 0 });
      });
    }
  }, [cart.length, activeTarget, selectedLineId]);

  const hasMissingRequiredReference = payments.some(
    (payment) =>
      requiresReference(payment.tenderType, requiredReferenceTenders) &&
      payment.amount.trim() !== "" &&
      payment.reference.trim().length < minReferenceLength,
  );

  const blockers = useMemo(() => {
    const next = [...checkoutBaseBlockers];
    if (nonCashTotal > total + 0.01) {
      next.push("Non-cash tenders cannot exceed sale total.");
    }
    if (tenderedTotal < total - 0.01) {
      next.push("Tendered amount is below the sale total.");
    }
    if (hasMissingRequiredReference) {
      next.push("Required tender references are incomplete.");
    }
    return next;
  }, [checkoutBaseBlockers, hasMissingRequiredReference, nonCashTotal, tenderedTotal, total]);

  /* ── Keypad ──────────────────────────────────────── */

  const applyToTarget = (target: CheckoutNumericTarget, action: PosKeypadAction) => {
    if (target.type === "order_discount") {
      setOrderDiscountAmount(applyPosKeypadAction(orderDiscountAmount, action));
      return;
    }
    if (target.type === "redeem_points") {
      setLoyaltyRedemptionPoints(
        applyPosKeypadAction(loyaltyRedemptionPoints, action, {
          allowDecimal: false,
          maxDecimals: 0,
        }),
      );
      return;
    }
    if (target.type === "tender_amount") {
      const currentValue = payments[target.index]?.amount ?? "";
      const nextValue = applyPosKeypadAction(currentValue, action);
      updatePayment(target.index, { amount: nextValue });
      return;
    }
    if (target.type === "line_qty") {
      const currentValue = String(
        selectedLine?.catalogItemId === target.lineId ? selectedLine.quantity : 0,
      );
      const nextValue = applyPosKeypadAction(currentValue, action, { maxDecimals: 3 });
      if (!nextValue) return;
      const parsed = Number(nextValue);
      if (Number.isFinite(parsed) && parsed > 0) {
        updateQty(target.lineId, parsed);
      }
      return;
    }
    if (target.type === "line_price") {
      const currentValue = String(
        selectedLine?.catalogItemId === target.lineId ? selectedLine.unitPrice : 0,
      );
      const nextValue = applyPosKeypadAction(currentValue, action);
      const parsed = Number(nextValue || "0");
      if (Number.isFinite(parsed) && parsed >= 0) {
        updateItemPrice(target.lineId, parsed);
      }
      return;
    }
    const currentValue = String(
      selectedLine?.catalogItemId === target.lineId ? selectedLine.lineDiscountAmount ?? 0 : 0,
    );
    const nextValue = applyPosKeypadAction(currentValue, action);
    const parsed = Number(nextValue || "0");
    if (Number.isFinite(parsed) && parsed >= 0) {
      updateItemDiscount(target.lineId, parsed);
    }
  };

  const handleKeypadAction = (action: PosKeypadAction) => {
    if (!activeTarget) return;
    applyToTarget(activeTarget, action);
  };

  const handleCharge = () => {
    if (blockers.length) {
      toast({ title: "Fix checkout blockers", description: blockers[0], variant: "default" });
      const firstTenderIndex = payments.findIndex((payment) => Number(payment.amount || "0") <= 0);
      if (firstTenderIndex >= 0) {
        setActiveTarget({ type: "tender_amount", index: firstTenderIndex });
      }
      return;
    }
    postSale();
  };

  const keypadPresets = useMemo(() => {
    const exact = total.toFixed(2);
    const round5 = roundUp(total, 5).toFixed(2);
    const round10 = roundUp(total, 10).toFixed(2);
    const seen = new Set<string>();
    const result: Array<{ label: string; value: string }> = [];
    if (total > 0) {
      seen.add(exact);
      result.push({ label: money(total), value: exact });
      if (!seen.has(round5)) {
        seen.add(round5);
        result.push({ label: money(Number(round5)), value: round5 });
      }
      if (!seen.has(round10)) {
        seen.add(round10);
        result.push({ label: money(Number(round10)), value: round10 });
      }
    }
    return result;
  }, [total]);

  const activeTargetLabel = (() => {
    if (!activeTarget) return "Tap a field";
    if (activeTarget.type === "order_discount") return "Order discount";
    if (activeTarget.type === "redeem_points") return "Loyalty points";
    if (activeTarget.type === "tender_amount") {
      return `${tenderLabel(payments[activeTarget.index]?.tenderType ?? "CASH")} amount`;
    }
    if (activeTarget.type === "line_qty") return "Qty";
    if (activeTarget.type === "line_price") return "Price";
    return "Line discount";
  })();

  /* ── Mutations ───────────────────────────────────── */

  const createCustomerMutation = useMutation({
    mutationFn: () =>
      fetchJson<{ data: { id: string; name: string; phone: string | null; email: string | null } }>(
        "/api/v2/retail/customers",
        {
          method: "POST",
          body: JSON.stringify({
            name: customerName.trim(),
            phone: customerPhone.trim() || undefined,
            email: customerEmail.trim() || undefined,
          }),
        },
      ),
    onSuccess: (payload) => {
      selectCustomer({
        id: payload.data.id,
        name: payload.data.name,
        phone: payload.data.phone,
        email: payload.data.email,
        loyaltyPoints: 0,
        loyaltyTier: "BRONZE",
      });
      setCustomerSheetOpen(false);
      toast({ title: "Customer saved", variant: "success" });
    },
    onError: async (error) => {
      const message = getApiErrorMessage(error);
      const offlineCandidate =
        /network|failed to fetch|load failed/i.test(message) ||
        (typeof navigator !== "undefined" && !navigator.onLine);

      if (offlineCandidate && tenantKey) {
        const queued = await createOfflineRetailCustomer(tenantKey, {
          name: customerName.trim(),
          phone: customerPhone.trim() || null,
          email: customerEmail.trim() || null,
        });
        selectCustomer({
          id: queued.record.tempId,
          name: String(queued.record.payload.name ?? customerName.trim()),
          phone: (queued.record.payload.phone as string | null | undefined) ?? null,
          email: (queued.record.payload.email as string | null | undefined) ?? null,
          loyaltyPoints: 0,
          loyaltyTier: "BRONZE",
        });
        setCustomerSheetOpen(false);
        toast({
          title: "Customer queued offline",
          description: "This customer will sync automatically when the connection is back.",
          variant: "default",
        });
        return;
      }

      toast({
        title: "Unable to save customer",
        description: message,
        variant: "destructive",
      });
    },
  });

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

  const updatePayment = (index: number, next: Partial<PaymentRow>) => {
    setPayments((current) =>
      current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...next } : entry)),
    );
  };

  const addPaymentRow = () => {
    setPayments((current) => [...current, { tenderType: "CARD", amount: "", reference: "" }]);
  };

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
    return phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  })();

  /* ═══════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════ */

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Toolbar ────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--edge-subtle)] bg-[var(--surface-base)] px-3 py-2 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        {/* Search */}
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-muted)] px-2.5 py-1.5 transition-all duration-150 focus-within:border-[var(--action-primary-bg)] focus-within:ring-2 focus-within:ring-[var(--action-primary-bg)] focus-within:ring-offset-1">
          <Search className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
          <input
            ref={searchInputRef}
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              if (catalogItems.length === 0) return;
              event.preventDefault();
              handleAddCatalogItem(catalogItems[0]);
            }}
            placeholder="Scan barcode or search product…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]"
          />
          {search ? (
            <button
              type="button"
              onClick={() => { setSearch(""); focusSearchInput(); }}
              className="shrink-0 text-[var(--text-muted)] transition-colors hover:text-[var(--text-strong)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <span className="hidden shrink-0 rounded bg-[var(--surface-base)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)] sm:inline">
              Enter ↵
            </span>
          )}
        </div>

        {/* Shift badge */}
        {currentShift ? (
          <span className="hidden shrink-0 rounded-md bg-[var(--surface-muted)] px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] md:inline-flex md:items-center md:gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {currentShift.shiftNo}
          </span>
        ) : (
          <Button size="sm" variant="outline" className="shrink-0 text-xs" asChild>
            <Link href={getPosPortalHref("shift", isPosHost)}>Open shift</Link>
          </Button>
        )}

        {/* Offline indicator */}
        {pendingOfflineSales > 0 ? (
          <button
            type="button"
            onClick={syncOfflineSales}
            disabled={syncOfflineSalesPending}
            className="shrink-0 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-100"
          >
            {pendingOfflineSales} queued
          </button>
        ) : null}

        {/* Quick actions */}
        <div className="hidden shrink-0 items-center gap-1 md:flex">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs"
            onClick={() => setHoldDialog(true)}
            disabled={cart.length === 0 || !currentShift}
          >
            Hold
          </Button>
          <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" asChild>
            <Link href={getPosPortalHref("held", isPosHost)}>
              <ReceiptLong className="h-3.5 w-3.5" />
              Held
            </Link>
          </Button>
        </div>
      </div>

      {/* ── Three-column checkout grid ─────────────────── */}
      <div className="grid min-h-0 flex-1 overflow-hidden xl:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)_minmax(300px,0.85fr)]">
        {/* ┄┄┄ Column 1 — Catalog ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ */}
        <div className="flex min-h-0 flex-col overflow-hidden border-r border-[var(--edge-subtle)]">
          {/* Promo pills */}
          {promotions.length > 0 ? (
            <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-[var(--edge-subtle)] px-3 py-2">
              <button
                type="button"
                onClick={() => setSelectedPromotionId("")}
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                  !selectedPromotionId
                    ? "bg-[var(--action-primary-bg)] text-white"
                    : "bg-[var(--surface-muted)] text-[var(--text-muted)] hover:bg-[var(--surface-base)]",
                )}
              >
                No promo
              </button>
              {promotions.map((promo) => (
                <button
                  key={promo.id}
                  type="button"
                  onClick={() => setSelectedPromotionId(promo.id)}
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                    selectedPromotionId === promo.id
                      ? "bg-[var(--action-primary-bg)] text-white"
                      : "bg-[var(--surface-muted)] text-[var(--text-muted)] hover:bg-[var(--surface-base)]",
                  )}
                >
                  {promo.name}
                </button>
              ))}
            </div>
          ) : null}

          {/* Catalog grid */}
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {!currentShift ? (
              <PosEmptyState
                icon={Clock}
                title="Open a shift first"
                description="Start a shift to unlock the register."
                action={
                  <Button size="sm" asChild>
                    <Link href={getPosPortalHref("shift", isPosHost)}>Open shift</Link>
                  </Button>
                }
                className="min-h-[10rem]"
              />
            ) : catalogLoading ? (
              <div className="flex min-h-[10rem] items-center justify-center text-sm text-[var(--text-muted)]">
                Loading catalog…
              </div>
            ) : catalogItems.length === 0 ? (
              <div className="flex min-h-[10rem] flex-col items-center justify-center gap-1 text-center">
                <Package className="h-8 w-8 text-[var(--text-muted)]" />
                <p className="text-sm font-medium text-[var(--text-muted)]">
                  {search ? "No items match" : "Search for items"}
                </p>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {catalogItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleAddCatalogItem(item)}
                    disabled={!currentShift}
                    className="group relative flex items-center gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] p-2.5 text-left transition-all duration-150 hover:border-[color-mix(in_srgb,var(--action-primary-bg)_30%,var(--border-default))] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] active:scale-[0.97]"
                  >
                    {/* Image / Placeholder */}
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--surface-muted)]">
                      {item.imageUrl ? (
                        <Image
                          src={item.imageUrl}
                          alt={item.name}
                          width={48}
                          height={48}
                          className="h-full w-full object-cover"
                          unoptimized
                        />
                      ) : (
                        <Package className="h-5 w-5 text-[var(--text-muted)]" />
                      )}
                    </div>
                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-1 text-sm font-medium leading-tight text-[var(--text-strong)]">
                        {item.name}
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-[var(--text-muted)]">
                        {item.barcode || item.sku}
                      </div>
                      {item.inventoryItem ? (
                        <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                          {item.inventoryItem.currentStock.toFixed(0)} {item.inventoryItem.unit}
                        </div>
                      ) : null}
                    </div>
                    {/* Price */}
                    <div className="shrink-0 text-right">
                      <div className="font-mono text-sm font-semibold text-[var(--text-strong)]">
                        {money(item.unitPrice)}
                      </div>
                    </div>
                    {/* Hover add indicator */}
                    <div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--action-primary-bg)] text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                      <Plus className="h-3 w-3" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ┄┄┄ Column 2 — Cart ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ */}
        <div className="flex min-h-0 flex-col overflow-hidden border-r border-[var(--edge-subtle)]">
          {/* Cart header */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--edge-subtle)] px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[var(--text-strong)]">Cart</span>
              {cart.length > 0 ? (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--action-primary-bg)] px-1.5 text-[10px] font-bold text-white">
                  {cart.length}
                </span>
              ) : null}
              {selectedCustomer ? (
                <button
                  type="button"
                  onClick={() => setCustomerSheetOpen(true)}
                  className="flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--action-primary-bg)_10%,var(--surface-base))] px-2 py-0.5 text-[10px] font-medium text-[var(--action-primary-bg)] transition-colors hover:bg-[color-mix(in_srgb,var(--action-primary-bg)_16%,var(--surface-base))]"
                >
                  <User className="h-3 w-3" />
                  {selectedCustomer.name}
                </button>
              ) : null}
            </div>
            {cart.length > 0 ? (
              <button
                type="button"
                onClick={clearCart}
                className="rounded-md px-1.5 py-0.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-red-50 hover:text-red-600"
              >
                Clear
              </button>
            ) : null}
          </div>

          {/* Cart items */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="flex h-full items-center justify-center p-4">
                <p className="text-sm text-[var(--text-muted)]">Scan or search to add items</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--edge-subtle)]">
                {cart.map((item) => {
                  const isSelected = selectedLineId === item.catalogItemId;
                  const lineTotal = item.quantity * item.unitPrice - (item.lineDiscountAmount ?? 0);
                  return (
                    <button
                      key={item.catalogItemId}
                      type="button"
                      onClick={() => {
                        setSelectedLineId(item.catalogItemId);
                        setActiveTarget({ type: "line_qty", lineId: item.catalogItemId });
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150",
                        isSelected
                          ? "border-l-2 border-l-[var(--action-primary-bg)] bg-[color-mix(in_srgb,var(--action-primary-bg)_6%,var(--surface-base))]"
                          : "border-l-2 border-l-transparent hover:bg-[var(--surface-muted)]",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-[var(--text-strong)]">
                          {item.name}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--text-muted)]">
                          <span className="font-mono">
                            {item.quantity} × {money(item.unitPrice)}
                          </span>
                          {item.lineDiscountAmount ? (
                            <span className="font-mono text-emerald-600">-{money(item.lineDiscountAmount)}</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-mono text-sm font-semibold text-[var(--text-strong)]">
                          {money(lineTotal)}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-red-50 hover:text-red-500"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromCart(item.catalogItemId);
                          if (selectedLineId === item.catalogItemId) {
                            setSelectedLineId(null);
                            setActiveTarget(null);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Line editor (when a line is selected) */}
          {selectedLine ? (
            <div className="shrink-0 border-t border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-3 py-2">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Editing: {selectedLine.name}
                </span>
                <button
                  type="button"
                  onClick={() => { setSelectedLineId(null); setActiveTarget(null); }}
                  className="rounded-md p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-base)] hover:text-[var(--text-strong)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <NumField
                  label="Qty"
                  value={String(selectedLine.quantity)}
                  active={activeTarget?.type === "line_qty" && activeTarget.lineId === selectedLine.catalogItemId}
                  onActivate={() => setActiveTarget({ type: "line_qty", lineId: selectedLine.catalogItemId })}
                />
                <NumField
                  label="Price"
                  value={String(selectedLine.unitPrice)}
                  active={activeTarget?.type === "line_price" && activeTarget.lineId === selectedLine.catalogItemId}
                  onActivate={() => setActiveTarget({ type: "line_price", lineId: selectedLine.catalogItemId })}
                />
                <NumField
                  label="Disc"
                  value={String(selectedLine.lineDiscountAmount ?? 0)}
                  active={activeTarget?.type === "line_discount" && activeTarget.lineId === selectedLine.catalogItemId}
                  onActivate={() => setActiveTarget({ type: "line_discount", lineId: selectedLine.catalogItemId })}
                />
              </div>
            </div>
          ) : null}

          {/* Cart summary */}
          <div className="shrink-0 border-t border-[var(--edge-subtle)] bg-[var(--surface-base)] px-3 py-2">
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>Subtotal ({lineCountLabel})</span>
              <span className="font-mono">{money(subtotal)}</span>
            </div>
            {discountAmount > 0 ? (
              <div className="flex items-center justify-between text-xs text-emerald-600">
                <span>Discount</span>
                <span className="font-mono">-{money(discountAmount)}</span>
              </div>
            ) : null}
            {taxAmount > 0 ? (
              <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span>Tax</span>
                <span className="font-mono">{money(taxAmount)}</span>
              </div>
            ) : null}
            <div className="mt-1 flex items-center justify-between border-t border-[var(--edge-subtle)] pt-1 text-sm font-semibold text-[var(--text-strong)]">
              <span>Total</span>
              <span className="font-mono">{money(total)}</span>
            </div>
          </div>
        </div>

        {/* ┄┄┄ Column 3 — Payment ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ */}
        <div className="flex min-h-0 flex-col overflow-hidden bg-[color-mix(in_srgb,var(--action-primary-bg)_3%,var(--surface-base))]">
          {/* a) Amount due + Change + Action chips */}
          <div className="shrink-0 px-4 pt-3 pb-2 text-center">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Amount due
            </div>
            <div className="mt-0.5 font-mono text-[2rem] font-bold leading-tight tracking-tight text-[var(--text-strong)]">
              {money(total)}
            </div>
            {changeAmount > 0 ? (
              <div className="mt-0.5 font-mono text-sm font-semibold text-emerald-600">
                Change: {money(changeAmount)}
              </div>
            ) : (
              <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                Tendered: <span className="font-mono font-semibold">{money(tenderedTotal)}</span>
              </div>
            )}
            {selectedPromotion ? (
              <div className="mt-1">
                <PosStatusPill tone="brand">{selectedPromotion.name}</PosStatusPill>
              </div>
            ) : null}

            {/* Action chips */}
            <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
              <button
                type="button"
                onClick={() => setCustomerSheetOpen(true)}
                className="flex items-center gap-1 rounded-full border border-[var(--border-default)] bg-[var(--surface-base)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)] transition-all duration-150 hover:border-[var(--action-primary-bg)] hover:text-[var(--action-primary-bg)]"
              >
                <User className="h-3 w-3" />
                {selectedCustomer ? selectedCustomer.name : "Walk-in"}
              </button>
              <button
                type="button"
                onClick={() => setAdjustmentsOpen(true)}
                className="flex items-center gap-1 rounded-full border border-[var(--border-default)] bg-[var(--surface-base)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)] transition-all duration-150 hover:border-[var(--action-primary-bg)] hover:text-[var(--action-primary-bg)]"
              >
                <Sparkles className="h-3 w-3" />
                Adjust
              </button>
              <button
                type="button"
                onClick={() => setSplitTenderMode(!splitTenderMode)}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all duration-150",
                  splitTenderMode
                    ? "border-[var(--action-primary-bg)] bg-[color-mix(in_srgb,var(--action-primary-bg)_8%,var(--surface-base))] text-[var(--action-primary-bg)]"
                    : "border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-muted)] hover:border-[var(--action-primary-bg)] hover:text-[var(--action-primary-bg)]",
                )}
              >
                {splitTenderMode ? "Single" : "Split"}
              </button>
              <button
                type="button"
                onClick={() => setHoldDialog(true)}
                disabled={cart.length === 0 || !currentShift}
                className="flex items-center gap-1 rounded-full border border-[var(--border-default)] bg-[var(--surface-base)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)] transition-all duration-150 hover:border-[var(--action-primary-bg)] hover:text-[var(--action-primary-bg)] disabled:opacity-40"
              >
                Hold
              </button>
            </div>
          </div>

          {/* b) Tender row(s) */}
          <div className="shrink-0 space-y-1.5 border-t border-[var(--edge-subtle)] px-3 py-2">
            {payments.map((payment, index) => {
              const isActiveTender = activeTarget?.type === "tender_amount" && activeTarget.index === index;
              return (
                <div key={`${payment.tenderType}-${index}`} className="flex items-center gap-1.5">
                  <Select
                    value={payment.tenderType}
                    onValueChange={(value) =>
                      updatePayment(index, { tenderType: value as TenderType })
                    }
                  >
                    <SelectTrigger className="h-10 w-[7rem] shrink-0 bg-[var(--surface-base)] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CASH">Cash</SelectItem>
                      <SelectItem value="CARD">Card</SelectItem>
                      <SelectItem value="MOBILE_MONEY">Mobile</SelectItem>
                      <SelectItem value="TRANSFER">Transfer</SelectItem>
                      <SelectItem value="VOUCHER">Voucher</SelectItem>
                    </SelectContent>
                  </Select>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveTarget({ type: "tender_amount", index })
                    }
                    className={cn(
                      "flex h-10 min-w-0 flex-1 items-center rounded-lg border px-3 font-mono text-sm font-semibold transition-all duration-150",
                      isActiveTender
                        ? "border-[var(--action-primary-bg)] bg-[color-mix(in_srgb,var(--action-primary-bg)_6%,white)] ring-2 ring-[var(--action-primary-bg)] ring-offset-1"
                        : "border-[var(--border-default)] bg-[var(--surface-base)] hover:bg-[var(--surface-muted)]",
                    )}
                  >
                    {payment.amount || "0.00"}
                  </button>
                  {requiresReference(payment.tenderType, requiredReferenceTenders) ? (
                    <Input
                      value={payment.reference}
                      onChange={(e) => updatePayment(index, { reference: e.target.value })}
                      placeholder={`Ref (min ${minReferenceLength})`}
                      className="h-10 w-[6rem] shrink-0 text-xs"
                    />
                  ) : null}
                  {splitTenderMode && payments.length > 1 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setPayments((cur) => cur.filter((_, i) => i !== index))
                      }
                      className="shrink-0 rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-red-50 hover:text-red-500"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              );
            })}
            {splitTenderMode ? (
              <button
                type="button"
                onClick={addPaymentRow}
                className="w-full rounded-lg border border-dashed border-[var(--border-default)] py-2 text-xs text-[var(--text-muted)] transition-colors hover:border-[var(--action-primary-bg)] hover:bg-[var(--surface-base)] hover:text-[var(--action-primary-bg)]"
              >
                + Add tender
              </button>
            ) : null}
          </div>

          {/* c) Keypad */}
          <div className="shrink-0 px-3 pb-2 pt-1">
            {/* Active target badge */}
            <div className="mb-1.5 flex items-center justify-center">
              <span className="inline-flex items-center rounded-full bg-[var(--surface-muted)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {activeTargetLabel}
              </span>
            </div>

            {/* Keypad grid — fixed heights, no flex-1 */}
            <PosNumericKeypad
              onAction={handleKeypadAction}
              presets={keypadPresets}
            />
          </div>

          {/* Spacer to push charge button to bottom */}
          <div className="min-h-0 flex-1" />

          {/* d) Validation + Charge button */}
          <div className="shrink-0 space-y-2 border-t border-[var(--edge-subtle)] bg-[var(--surface-base)] px-3 py-3">
            <PosInlineValidationBanner messages={blockers} />

            <button
              type="button"
              className={cn(
                "flex h-14 w-full items-center justify-center gap-2 rounded-xl text-base font-bold text-white shadow-lg transition-all duration-200 active:scale-[0.98]",
                cart.length === 0 || postSalePending
                  ? "cursor-not-allowed bg-gray-300"
                  : "bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 hover:shadow-emerald-200",
              )}
              onClick={handleCharge}
              disabled={postSalePending || cart.length === 0}
            >
              <Wallet className="h-5 w-5" />
              Charge {money(total)}
            </button>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════
         DIALOGS & SHEETS
         ════════════════════════════════════════════════════ */}

      {/* ── Customer sheet ──────────────────────────────── */}
      <Sheet open={customerSheetOpen} onOpenChange={setCustomerSheetOpen}>
        <SheetContent
          side="right"
          size="md"
          tabletBehavior="bottom"
          className="w-full max-w-[32rem] p-0"
        >
          <div className="flex h-full flex-col p-5 sm:p-6">
            <SheetHeader className="border-b border-[var(--border-subtle)] pb-4 pr-10">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                <Users className="h-4 w-4" />
                Customer
              </div>
              <SheetTitle>Attach customer</SheetTitle>
              <SheetDescription>
                Search by name, phone, or email. Save a new customer without leaving checkout.
              </SheetDescription>
            </SheetHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4 pr-1">
              {/* Search */}
              <div className="flex items-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-muted)] px-3 py-2">
                <Search className="h-4 w-4 text-[var(--text-muted)]" />
                <Input
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="Search by name, phone, or email"
                  className="h-8 border-none bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                />
              </div>

              {/* Attached banner */}
              {selectedCustomer ? (
                <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <div>
                    <div className="text-sm font-semibold text-[var(--text-strong)]">
                      {selectedCustomer.name}
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {selectedCustomer.phone || selectedCustomer.email || "No contact"}
                    </div>
                  </div>
                  <PosStatusPill tone="success">{selectedCustomer.loyaltyPoints} pts</PosStatusPill>
                </div>
              ) : null}

              {/* Results */}
              {customerName.trim().length >= 2 ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                    <span>Matches</span>
                    {customerSearchLoading ? <span>Searching…</span> : null}
                  </div>
                  {customerSearchResults.length === 0 ? (
                    <p className="py-4 text-center text-sm text-[var(--text-muted)]">No match found</p>
                  ) : (
                    customerSearchResults.slice(0, 6).map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] px-3 py-2 text-left transition hover:bg-[var(--surface-muted)]"
                        onClick={() => {
                          selectCustomer(customer);
                          setCustomerSheetOpen(false);
                        }}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{customer.name}</div>
                          <div className="truncate text-xs text-[var(--text-muted)]">
                            {customer.phone || customer.email || "No contact"}
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                      </button>
                    ))
                  )}
                </div>
              ) : null}

              {/* Save new customer */}
              <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-muted)] p-3">
                <div className="text-sm font-semibold">Save new customer</div>
                <div className="mt-3 grid gap-2">
                  <Input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Name"
                    className="h-9 bg-white text-sm"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="Phone"
                      className="h-9 bg-white text-sm"
                    />
                    <Input
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="Email"
                      className="h-9 bg-white text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            <SheetFooter className="border-t border-[var(--border-subtle)] pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCustomerSheetOpen(false)}
              >
                Back
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => createCustomerMutation.mutate()}
                disabled={!customerName.trim() || createCustomerMutation.isPending}
              >
                <Save className="h-3.5 w-3.5" />
                Save
              </Button>
            </SheetFooter>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Adjustments dialog ─────────────────────────── */}
      <Dialog open={adjustmentsOpen} onOpenChange={setAdjustmentsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sale adjustments</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Order discount */}
            <div>
              <label className="text-xs font-semibold text-[var(--text-muted)]">Order discount</label>
              <NumField
                label="Amount"
                value={orderDiscountAmount}
                active={activeTarget?.type === "order_discount"}
                onActivate={() => setActiveTarget({ type: "order_discount" })}
                className="mt-1"
              />
            </div>

            {/* Loyalty redemption */}
            {selectedCustomer ? (
              <div>
                <label className="text-xs font-semibold text-[var(--text-muted)]">
                  Redeem points ({selectedCustomer.loyaltyPoints} available)
                </label>
                <NumField
                  label="Points"
                  value={loyaltyRedemptionPoints}
                  active={activeTarget?.type === "redeem_points"}
                  onActivate={() => setActiveTarget({ type: "redeem_points" })}
                  className="mt-1"
                />
              </div>
            ) : null}

            {/* Override reason */}
            {canOverride ? (
              <div>
                <label className="text-xs font-semibold text-[var(--text-muted)]">Override reason</label>
                <Input
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Reason for override"
                  className="mt-1 h-9 text-sm"
                />
                <PosStatusPill tone="warning" className="mt-1">Override allowed</PosStatusPill>
              </div>
            ) : null}

            {/* Promotion selector */}
            {promotions.length > 0 ? (
              <div>
                <label className="text-xs font-semibold text-[var(--text-muted)]">Promotion</label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedPromotionId("")}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                      !selectedPromotionId
                        ? "bg-[var(--action-primary-bg)] text-white"
                        : "bg-[var(--surface-muted)] text-[var(--text-muted)]",
                    )}
                  >
                    None
                  </button>
                  {promotions.map((promo) => (
                    <button
                      key={promo.id}
                      type="button"
                      onClick={() => setSelectedPromotionId(promo.id)}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                        selectedPromotionId === promo.id
                          ? "bg-[var(--action-primary-bg)] text-white"
                          : "bg-[var(--surface-muted)] text-[var(--text-muted)]",
                      )}
                    >
                      {promo.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustmentsOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Hold dialog ────────────────────────────────── */}
      <Dialog open={holdDialog} onOpenChange={setHoldDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hold current sale</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-muted)]">
              Park this cart so you can return to it later.
            </p>
            <Input
              value={holdLabel}
              onChange={(e) => setHoldLabel(e.target.value)}
              placeholder="Label (optional)"
              className="h-9"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHoldDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => holdCartMutation.mutate()}
              disabled={holdCartMutation.isPending}
            >
              Hold sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Sale completed dialog ──────────────────────── */}
      <Dialog
        open={Boolean(lastCompletedSale)}
        onOpenChange={(open) => !open && dismissCompletedSale()}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sale completed</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-mono text-lg font-semibold">{lastCompletedSale?.saleNo}</div>
                  <div className="mt-1 text-sm text-[var(--text-muted)]">
                    Total: {money(lastCompletedSale?.totalAmount ?? 0)}
                  </div>
                </div>
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <div className="mt-3 flex gap-4 text-sm">
                <span>
                  Change: <span className="font-mono font-semibold">{money(lastCompletedSale?.changeAmount ?? 0)}</span>
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={dismissCompletedSale}>
              Continue selling
            </Button>
            {whatsappHref ? (
              <Button asChild variant="outline">
                <a href={whatsappHref} target="_blank" rel="noreferrer">
                  WhatsApp
                </a>
              </Button>
            ) : null}
            <Button asChild>
              <Link href={getPosPortalHref("history", isPosHost)}>
                <Payments className="h-4 w-4" />
                History
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
