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
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  Coins,
  History,
  Loader2,
  Minus,
  Package,
  Payments,
  Plus,
  QrCode,
  ReceiptLong,
  RefreshCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
  User,
  Users,
  Wallet,
  X,
  Zap,
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
    case "CASH": return "Cash";
    case "CARD": return "Card";
    case "MOBILE_MONEY": return "Mobile";
    case "TRANSFER": return "Transfer";
    case "VOUCHER": return "Voucher";
    default: return tenderType;
  }
}

function TenderIcon({ type, className }: { type: TenderType; className?: string }) {
  const cls = cn("h-[1.1em] w-[1.1em]", className);
  switch (type) {
    case "CASH": return <Coins className={cls} />;
    case "CARD": return <QrCode className={cls} />;
    case "MOBILE_MONEY": return <Payments className={cls} />;
    case "TRANSFER": return <ArrowRightLeft className={cls} />;
    case "VOUCHER": return <Zap className={cls} />;
  }
}

/* ─── Compact numeric field (inline editor) ──────────────────────── */

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
        "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-all duration-100",
        active
          ? "border-[var(--border-default)] bg-[color-mix(in_srgb,var(--action-primary-bg)_8%,var(--surface-base))] ring-2 ring-[var(--action-primary-bg)] ring-offset-1"
          : "border-[var(--border-default)] bg-[var(--surface-base)] hover:bg-[var(--surface-muted)]",
        className,
      )}
    >
      <span className="text-[11px] font-medium text-[var(--text-muted)]">{label}</span>
      <span className={cn(
        "font-mono text-sm font-bold",
        active ? "text-[var(--action-primary-bg)]" : "text-[var(--text-strong)]",
      )}>
        {value || "0"}
      </span>
    </button>
  );
}

/* ─── Tender type tab button ─────────────────────────────────────── */

function TenderTab({
  type,
  selected,
  onClick,
}: {
  type: TenderType;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 flex-col items-center gap-1 rounded-lg border py-2 text-[10px] font-semibold uppercase tracking-wide transition-all duration-100 active:scale-[0.96]",
        selected
          ? "border-[var(--action-primary-bg)] bg-[var(--action-primary-bg)] text-white shadow-sm"
          : "border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-muted)] hover:border-[var(--action-primary-bg)] hover:text-[var(--action-primary-bg)]",
      )}
    >
      <TenderIcon type={type} className="h-4 w-4" />
      {tenderLabel(type)}
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

  /* ── Local state ─────────────────────────────── */
  const [holdDialog, setHoldDialog] = useState(false);
  const [holdLabel, setHoldLabel] = useState("");
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [activeTarget, setActiveTarget] = useState<CheckoutNumericTarget | null>(null);
  const [customerSheetOpen, setCustomerSheetOpen] = useState(false);
  const [adjustmentsOpen, setAdjustmentsOpen] = useState(false);

  /* ── Global POS state ────────────────────────── */
  const {
    search, setSearch,
    cart,
    customerName, setCustomerName,
    selectedCustomerId, selectCustomer,
    customerSearchResults, customerSearchLoading,
    customerPhone, setCustomerPhone,
    customerEmail, setCustomerEmail,
    loyaltyRedemptionPoints, setLoyaltyRedemptionPoints,
    payments, setPayments,
    splitTenderMode, setSplitTenderMode,
    orderDiscountAmount, setOrderDiscountAmount,
    overrideReason, setOverrideReason,
    selectedPromotionId, setSelectedPromotionId,
    currentShift, isPosHost,
    catalogItems, catalogLoading,
    promotions, canOverride,
    subtotal, discountAmount, taxAmount, total,
    changeAmount, tenderedTotal, nonCashTotal,
    addToCart, updateQty, updateItemPrice, updateItemDiscount,
    removeFromCart, clearCart,
    postSale, postSalePending,
    checkoutBaseBlockers,
    pendingOfflineSales, syncOfflineSales, syncOfflineSalesPending,
    requiredReferenceTenders, minReferenceLength,
    lastCompletedSale, dismissCompletedSale,
  } = usePosPortalState();

  /* ── Derived state ───────────────────────────── */

  const selectedLine = useMemo(
    () => cart.find((line) => line.catalogItemId === selectedLineId) ?? null,
    [cart, selectedLineId],
  );

  const selectedCustomer =
    customerSearchResults.find((c) => c.id === selectedCustomerId) ?? null;

  const selectedPromotion =
    promotions.find((p) => p.id === selectedPromotionId) ?? null;

  /* ── Focus helper ────────────────────────────── */

  const focusSearchInput = () => {
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  };

  const handleAddCatalogItem = (item: (typeof catalogItems)[number]) => {
    addToCart(item);
    if (activeTarget === null && selectedLineId === null) {
      setActiveTarget({ type: "tender_amount", index: 0 });
    }
    setSearch("");
    focusSearchInput();
  };

  /* ── Payment sync ────────────────────────────── */

  useEffect(() => {
    if (splitTenderMode) return;
    if (payments.length !== 1) {
      const base = payments[0] ?? { tenderType: "CASH" as TenderType, amount: "", reference: "" };
      setPayments([{ ...base }]);
      return;
    }
    // Auto-fill only when the user has NOT manually edited the field.
    // This lets backspace reach "" without immediately bouncing back to the total.
    if (cart.length > 0 && !payments[0].amount.trim() && !paymentUserEditedRef.current) {
      setPayments((current) =>
        current.map((p, i) => (i === 0 ? { ...p, amount: total.toFixed(2) } : p)),
      );
    }
    if (cart.length === 0 && payments[0].amount.trim()) {
      // Cart cleared — reset dirty flag so the next sale gets auto-filled again.
      paymentUserEditedRef.current = false;
      setPayments((current) =>
        current.map((p, i) => (i === 0 ? { ...p, amount: "" } : p)),
      );
    }
  }, [cart.length, payments, setPayments, splitTenderMode, total]);

  // Tracks whether the user has manually touched the payment amount via the
  // keypad. When true we stop auto-filling empty amounts so backspacing to ""
  // doesn't immediately reset back to the sale total.
  const paymentUserEditedRef = useRef(false);

  const prevCartLengthRef = useRef(cart.length);
  useEffect(() => {
    const wasEmpty = prevCartLengthRef.current === 0;
    prevCartLengthRef.current = cart.length;
    if (wasEmpty && cart.length > 0 && activeTarget === null && selectedLineId === null) {
      requestAnimationFrame(() => setActiveTarget({ type: "tender_amount", index: 0 }));
    }
  }, [cart.length, activeTarget, selectedLineId]);

  const hasMissingRequiredReference = payments.some(
    (p) =>
      requiresReference(p.tenderType, requiredReferenceTenders) &&
      p.amount.trim() !== "" &&
      p.reference.trim().length < minReferenceLength,
  );

  const blockers = useMemo(() => {
    const next = [...checkoutBaseBlockers];
    if (nonCashTotal > total + 0.01) next.push("Non-cash tenders cannot exceed sale total.");
    if (tenderedTotal < total - 0.01) next.push("Tendered amount is below the sale total.");
    if (hasMissingRequiredReference) next.push("Required tender references are incomplete.");
    return next;
  }, [checkoutBaseBlockers, hasMissingRequiredReference, nonCashTotal, tenderedTotal, total]);

  /* ── Keypad ──────────────────────────────────── */

  const applyToTarget = (target: CheckoutNumericTarget, action: PosKeypadAction) => {
    if (target.type === "order_discount") {
      setOrderDiscountAmount(applyPosKeypadAction(orderDiscountAmount, action));
      return;
    }
    if (target.type === "redeem_points") {
      setLoyaltyRedemptionPoints(
        applyPosKeypadAction(loyaltyRedemptionPoints, action, { allowDecimal: false, maxDecimals: 0 }),
      );
      return;
    }
    if (target.type === "tender_amount") {
      paymentUserEditedRef.current = true;
      const nextValue = applyPosKeypadAction(payments[target.index]?.amount ?? "", action);
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
      if (Number.isFinite(parsed) && parsed > 0) updateQty(target.lineId, parsed);
      return;
    }
    if (target.type === "line_price") {
      const currentValue = String(
        selectedLine?.catalogItemId === target.lineId ? selectedLine.unitPrice : 0,
      );
      const nextValue = applyPosKeypadAction(currentValue, action);
      const parsed = Number(nextValue || "0");
      if (Number.isFinite(parsed) && parsed >= 0) updateItemPrice(target.lineId, parsed);
      return;
    }
    const currentValue = String(
      selectedLine?.catalogItemId === target.lineId ? selectedLine.lineDiscountAmount ?? 0 : 0,
    );
    const nextValue = applyPosKeypadAction(currentValue, action);
    const parsed = Number(nextValue || "0");
    if (Number.isFinite(parsed) && parsed >= 0) updateItemDiscount(target.lineId, parsed);
  };

  const handleKeypadAction = (action: PosKeypadAction) => {
    if (!activeTarget) return;
    applyToTarget(activeTarget, action);
  };

  const handleCharge = () => {
    if (blockers.length) {
      toast({ title: "Fix checkout blockers", description: blockers[0], variant: "default" });
      const firstTenderIndex = payments.findIndex((p) => Number(p.amount || "0") <= 0);
      if (firstTenderIndex >= 0) setActiveTarget({ type: "tender_amount", index: firstTenderIndex });
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
      if (!seen.has(round5)) { seen.add(round5); result.push({ label: money(Number(round5)), value: round5 }); }
      if (!seen.has(round10)) { seen.add(round10); result.push({ label: money(Number(round10)), value: round10 }); }
    }
    return result;
  }, [total]);

  const activeTargetLabel = (() => {
    if (!activeTarget) return "Select a field";
    if (activeTarget.type === "order_discount") return "Order discount";
    if (activeTarget.type === "redeem_points") return "Loyalty points";
    if (activeTarget.type === "tender_amount")
      return `${tenderLabel(payments[activeTarget.index]?.tenderType ?? "CASH")} amount`;
    if (activeTarget.type === "line_qty") return "Qty";
    if (activeTarget.type === "line_price") return "Price";
    return "Line discount";
  })();

  /* ── Mutations ───────────────────────────────── */

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
      selectCustomer({ id: payload.data.id, name: payload.data.name, phone: payload.data.phone, email: payload.data.email, loyaltyPoints: 0, loyaltyTier: "BRONZE" });
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
        toast({ title: "Customer queued offline", description: "Will sync when back online.", variant: "default" });
        return;
      }
      toast({ title: "Unable to save customer", description: message, variant: "destructive" });
    },
  });

  const holdCartMutation = useMutation({
    mutationFn: () =>
      fetchJson("/api/v2/retail/pos/held-carts", {
        method: "POST",
        body: JSON.stringify({
          shiftId: currentShift?.id,
          label: holdLabel.trim() || undefined,
          cartSnapshot: { items: cart, customerName, orderDiscountAmount, selectedPromotionId },
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
      toast({ title: "Unable to hold cart", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const updatePayment = (index: number, next: Partial<PaymentRow>) => {
    setPayments((current) =>
      current.map((entry, i) => (i === index ? { ...entry, ...next } : entry)),
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
    ].filter(Boolean).join("\n");
    const encoded = encodeURIComponent(message);
    const phone = normalizeWhatsappPhone(lastCompletedSale.customerPhone);
    return phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  })();

  const TENDER_TYPES: TenderType[] = ["CASH", "CARD", "MOBILE_MONEY", "TRANSFER", "VOUCHER"];

  /* ═══════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════ */

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--surface-muted)]">

      {/* ── Top bar ─────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--edge-subtle)] bg-[var(--surface-base)] px-3 py-2">
        {/* Search */}
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-muted)] px-2.5 py-1.5 transition-all duration-100 focus-within:ring-2 focus-within:ring-[var(--action-primary-bg)] focus-within:ring-offset-1">
          <Search className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
          <input
            ref={searchInputRef}
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || catalogItems.length === 0) return;
              e.preventDefault();
              handleAddCatalogItem(catalogItems[0]);
            }}
            placeholder="Scan barcode or search…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]"
          />
          {search ? (
            <button
              type="button"
              onClick={() => { setSearch(""); focusSearchInput(); }}
              className="shrink-0 rounded-md p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-base)] hover:text-[var(--text-strong)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <span className="hidden shrink-0 rounded bg-[var(--surface-base)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)] shadow-sm sm:inline">
              ↵
            </span>
          )}
        </div>

        {/* Shift badge */}
        {currentShift ? (
          <span className="hidden shrink-0 items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 md:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {currentShift.shiftNo}
          </span>
        ) : (
          <Button size="sm" variant="outline" className="shrink-0 border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 text-xs" asChild>
            <Link href={getPosPortalHref("shift", isPosHost)}>
              <Clock className="h-3.5 w-3.5" />
              Open shift
            </Link>
          </Button>
        )}

        {/* Offline sync */}
        {pendingOfflineSales > 0 ? (
          <button
            type="button"
            onClick={syncOfflineSales}
            disabled={syncOfflineSalesPending}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-60"
          >
            {syncOfflineSalesPending
              ? <RefreshCcw className="h-3 w-3 animate-spin" />
              : <RefreshCcw className="h-3 w-3" />}
            {pendingOfflineSales} queued
          </button>
        ) : null}

        {/* Quick nav */}
        <div className="hidden shrink-0 items-center gap-1 md:flex">
          <Button
            size="sm" variant="ghost"
            className="h-8 gap-1.5 px-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-strong)]"
            onClick={() => setHoldDialog(true)}
            disabled={cart.length === 0 || !currentShift}
          >
            <ReceiptLong className="h-3.5 w-3.5" />
            Hold
          </Button>
          <Button size="sm" variant="ghost" className="h-8 gap-1.5 px-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-strong)]" asChild>
            <Link href={getPosPortalHref("held", isPosHost)}>
              <History className="h-3.5 w-3.5" />
              Recall
            </Link>
          </Button>
        </div>
      </div>

      {/* ── Three-column layout ─────────────────────────── */}
      <div className="grid min-h-0 flex-1 overflow-hidden xl:grid-cols-[minmax(0,1.15fr)_minmax(260px,0.85fr)_minmax(300px,0.8fr)]">

        {/* ┄ Column 1 — Catalog ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ */}
        <div className="flex min-h-0 flex-col overflow-hidden border-r border-[var(--edge-subtle)] bg-[var(--surface-base)]">
          {/* Promo pills */}
          {promotions.length > 0 ? (
            <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-[var(--edge-subtle)] px-3 py-2">
              <button
                type="button"
                onClick={() => setSelectedPromotionId("")}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors",
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
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors",
                    selectedPromotionId === promo.id
                      ? "bg-[var(--action-primary-bg)] text-white"
                      : "bg-[var(--surface-muted)] text-[var(--text-muted)] hover:bg-[var(--surface-base)]",
                  )}
                >
                  <Sparkles className="h-3 w-3" />
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
                description="Start a shift to unlock the register and begin selling."
                action={
                  <Button size="sm" asChild>
                    <Link href={getPosPortalHref("shift", isPosHost)}>Open shift</Link>
                  </Button>
                }
                className="min-h-[10rem]"
              />
            ) : catalogLoading ? (
              <div className="flex min-h-[10rem] items-center justify-center gap-2 text-sm text-[var(--text-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading catalog…
              </div>
            ) : catalogItems.length === 0 ? (
              <div className="flex min-h-[10rem] flex-col items-center justify-center gap-2 text-center">
                <Package className="h-8 w-8 text-[var(--text-muted)]" />
                <p className="text-sm font-medium text-[var(--text-muted)]">
                  {search ? "No items match" : "Search to find items"}
                </p>
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="text-xs text-[var(--action-primary-bg)] underline-offset-2 hover:underline"
                  >
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {catalogItems.map((item) => {
                  const inCart = cart.find((c) => c.catalogItemId === item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleAddCatalogItem(item)}
                      disabled={!currentShift}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-xl border bg-[var(--surface-base)] p-2.5 text-left transition-all duration-100 active:scale-[0.97]",
                        inCart
                          ? "border-[color-mix(in_srgb,var(--action-primary-bg)_40%,var(--border-default))] shadow-[0_0_0_1px_color-mix(in_srgb,var(--action-primary-bg)_20%,transparent)]"
                          : "border-[var(--border-default)] hover:border-[color-mix(in_srgb,var(--action-primary-bg)_30%,var(--border-default))] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]",
                      )}
                    >
                      {/* Image / placeholder */}
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--surface-muted)]">
                        {item.imageUrl ? (
                          <Image src={item.imageUrl} alt={item.name} width={44} height={44} className="h-full w-full object-cover" unoptimized />
                        ) : (
                          <Package className="h-5 w-5 text-[var(--text-muted)]" />
                        )}
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-1 text-[13px] font-semibold leading-tight text-[var(--text-strong)]">
                          {item.name}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          {item.inventoryItem && (
                            <span className={cn(
                              "rounded px-1 py-0 text-[10px] font-semibold",
                              item.inventoryItem.currentStock <= 5
                                ? "bg-amber-50 text-amber-700"
                                : "bg-emerald-50 text-emerald-700",
                            )}>
                              {item.inventoryItem.currentStock.toFixed(0)} {item.inventoryItem.unit}
                            </span>
                          )}
                          {item.barcode || item.sku ? (
                            <span className="font-mono text-[10px] text-[var(--text-muted)]">
                              {item.barcode || item.sku}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {/* Price */}
                      <div className="shrink-0 text-right">
                        {item.compareAtPrice && item.compareAtPrice > item.unitPrice ? (
                          <div className="font-mono text-[10px] text-[var(--text-muted)] line-through">
                            {money(item.compareAtPrice)}
                          </div>
                        ) : null}
                        <div className="font-mono text-sm font-bold text-[var(--text-strong)]">
                          {money(item.unitPrice)}
                        </div>
                      </div>

                      {/* In-cart badge */}
                      {inCart ? (
                        <div className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--action-primary-bg)] px-1 text-[10px] font-bold text-white shadow-sm">
                          {inCart.quantity}
                        </div>
                      ) : (
                        <div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--action-primary-bg)] text-white opacity-0 shadow-sm transition-opacity duration-100 group-hover:opacity-100">
                          <Plus className="h-3 w-3" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ┄ Column 2 — Cart ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ */}
        <div className="flex min-h-0 flex-col overflow-hidden border-r border-[var(--edge-subtle)] bg-[var(--surface-base)]">
          {/* Cart header */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--edge-subtle)] px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[var(--text-strong)]">Sale</span>
              {cart.length > 0 ? (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--action-primary-bg)] px-1.5 text-[10px] font-bold text-white">
                  {cart.length}
                </span>
              ) : null}
              {selectedCustomer ? (
                <button
                  type="button"
                  onClick={() => setCustomerSheetOpen(true)}
                  className="flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--action-primary-bg)_10%,var(--surface-base))] px-2 py-0.5 text-[10px] font-semibold text-[var(--action-primary-bg)] transition-colors hover:bg-[color-mix(in_srgb,var(--action-primary-bg)_18%,var(--surface-base))]"
                >
                  <User className="h-3 w-3" />
                  {selectedCustomer.name}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setCustomerSheetOpen(true)}
                  className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-strong)]"
                >
                  <User className="h-3 w-3" />
                  Walk-in
                </button>
              )}
            </div>
            {cart.length > 0 ? (
              <button
                type="button"
                onClick={() => { paymentUserEditedRef.current = false; clearCart(); }}
                className="rounded-md px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)] transition-colors hover:bg-red-50 hover:text-red-600"
              >
                Clear
              </button>
            ) : null}
          </div>

          {/* Cart items */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-muted)]">
                  <Payments className="h-6 w-6 text-[var(--text-muted)]" />
                </div>
                <p className="text-sm font-medium text-[var(--text-muted)]">No items yet</p>
                <p className="text-xs text-[var(--text-muted)]">Search or scan to add</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--edge-subtle)]">
                {cart.map((item) => {
                  const isSelected = selectedLineId === item.catalogItemId;
                  const lineTotal = item.quantity * item.unitPrice - (item.lineDiscountAmount ?? 0);
                  return (
                    <div
                      key={item.catalogItemId}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2.5 transition-colors duration-100",
                        isSelected
                          ? "border-l-[3px] border-l-[var(--action-primary-bg)] bg-[color-mix(in_srgb,var(--action-primary-bg)_5%,var(--surface-base))]"
                          : "border-l-[3px] border-l-transparent hover:bg-[var(--surface-muted)]",
                      )}
                    >
                      {/* Item info — clickable to select */}
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => {
                          setSelectedLineId(item.catalogItemId);
                          setActiveTarget({ type: "line_qty", lineId: item.catalogItemId });
                        }}
                      >
                        <div className="truncate text-[13px] font-semibold text-[var(--text-strong)]">
                          {item.name}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                          <span className="font-mono">{money(item.unitPrice)}</span>
                          {item.lineDiscountAmount ? (
                            <span className="font-mono text-emerald-600">−{money(item.lineDiscountAmount)}</span>
                          ) : null}
                        </div>
                      </button>

                      {/* Qty controls */}
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            const next = item.quantity - 1;
                            if (next <= 0) {
                              removeFromCart(item.catalogItemId);
                              if (selectedLineId === item.catalogItemId) {
                                setSelectedLineId(null);
                                setActiveTarget(null);
                              }
                            } else {
                              updateQty(item.catalogItemId, next);
                            }
                          }}
                          className="flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-muted)] transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500 active:scale-[0.9]"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedLineId(item.catalogItemId);
                            setActiveTarget({ type: "line_qty", lineId: item.catalogItemId });
                          }}
                          className={cn(
                            "h-6 min-w-[2rem] rounded-md border px-1.5 font-mono text-xs font-bold transition-colors",
                            isSelected && activeTarget?.type === "line_qty"
                              ? "border-[var(--action-primary-bg)] bg-[color-mix(in_srgb,var(--action-primary-bg)_8%,white)] text-[var(--action-primary-bg)]"
                              : "border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-strong)] hover:border-[var(--action-primary-bg)]",
                          )}
                        >
                          {item.quantity % 1 === 0 ? item.quantity : item.quantity.toFixed(2)}
                        </button>
                        <button
                          type="button"
                          onClick={() => updateQty(item.catalogItemId, item.quantity + 1)}
                          className="flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-muted)] transition-colors hover:border-[var(--action-primary-bg)] hover:bg-[color-mix(in_srgb,var(--action-primary-bg)_6%,white)] hover:text-[var(--action-primary-bg)] active:scale-[0.9]"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>

                      {/* Line total */}
                      <div className="shrink-0 w-16 text-right">
                        <div className="font-mono text-[13px] font-bold text-[var(--text-strong)]">
                          {money(lineTotal)}
                        </div>
                      </div>

                      {/* Remove */}
                      <button
                        type="button"
                        onClick={() => {
                          removeFromCart(item.catalogItemId);
                          if (selectedLineId === item.catalogItemId) {
                            setSelectedLineId(null);
                            setActiveTarget(null);
                          }
                        }}
                        className="shrink-0 rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-red-50 hover:text-red-500"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Line editor (when line is selected) */}
          {selectedLine ? (
            <div className="shrink-0 border-t border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-3 py-2.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  {selectedLine.name}
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
          <div className="shrink-0 border-t border-[var(--edge-subtle)] bg-[var(--surface-base)] px-3 py-2.5">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span>{cart.length} item{cart.length !== 1 ? "s" : ""}</span>
                <span className="font-mono">{money(subtotal)}</span>
              </div>
              {discountAmount > 0 ? (
                <div className="flex items-center justify-between text-xs text-emerald-600">
                  <span>Discount{selectedPromotion ? ` (${selectedPromotion.name})` : ""}</span>
                  <span className="font-mono">−{money(discountAmount)}</span>
                </div>
              ) : null}
              {taxAmount > 0 ? (
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span>Tax</span>
                  <span className="font-mono">{money(taxAmount)}</span>
                </div>
              ) : null}
            </div>
            <div className="mt-2 flex items-baseline justify-between border-t border-[var(--edge-subtle)] pt-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Total</span>
              <span className="font-mono text-xl font-black text-[var(--text-strong)]">{money(total)}</span>
            </div>
          </div>
        </div>

        {/* ┄ Column 3 — Payment ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ */}
        <div className="flex min-h-0 flex-col overflow-hidden bg-[var(--surface-base)]">

          {/* Amount due header */}
          <div className={cn(
            "shrink-0 px-4 pt-4 pb-3 text-center",
            cart.length > 0
              ? "bg-[color-mix(in_srgb,var(--action-primary-bg)_4%,var(--surface-base))]"
              : "",
          )}>
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">
              Amount Due
            </div>
            <div className={cn(
              "mt-0.5 font-mono font-black leading-none tracking-tight transition-all duration-150",
              total >= 10000 ? "text-3xl" : total >= 1000 ? "text-4xl" : "text-[2.75rem]",
              cart.length > 0 ? "text-[var(--text-strong)]" : "text-[var(--text-muted)]",
            )}>
              {money(total)}
            </div>

            {changeAmount > 0 ? (
              <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-700">
                Change: {money(changeAmount)}
              </div>
            ) : tenderedTotal > 0 && tenderedTotal < total ? (
              <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                Still due: {money(total - tenderedTotal)}
              </div>
            ) : tenderedTotal > 0 ? (
              <div className="mt-1.5 text-xs text-[var(--text-muted)]">
                Tendered: <span className="font-mono font-semibold">{money(tenderedTotal)}</span>
              </div>
            ) : null}

            {/* Quick action pills */}
            <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
              <button
                type="button"
                onClick={() => setAdjustmentsOpen(true)}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--border-default)] bg-[var(--surface-base)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)] transition-all duration-100 hover:border-[var(--action-primary-bg)] hover:text-[var(--action-primary-bg)]"
              >
                <Sparkles className="h-3 w-3" />
                Adjust
              </button>
              <button
                type="button"
                onClick={() => setSplitTenderMode(!splitTenderMode)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all duration-100",
                  splitTenderMode
                    ? "border-[var(--action-primary-bg)] bg-[color-mix(in_srgb,var(--action-primary-bg)_8%,var(--surface-base))] text-[var(--action-primary-bg)]"
                    : "border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-muted)] hover:border-[var(--action-primary-bg)] hover:text-[var(--action-primary-bg)]",
                )}
              >
                <Payments className="h-3 w-3" />
                {splitTenderMode ? "Single pay" : "Split"}
              </button>
              <button
                type="button"
                onClick={() => setHoldDialog(true)}
                disabled={cart.length === 0 || !currentShift}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--border-default)] bg-[var(--surface-base)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)] transition-all duration-100 hover:border-[var(--action-primary-bg)] hover:text-[var(--action-primary-bg)] disabled:opacity-40"
              >
                <ReceiptLong className="h-3 w-3" />
                Hold
              </button>
            </div>
          </div>

          {/* Scrollable payment section */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-3 px-3 pt-2 pb-3">
              {payments.map((payment, index) => {
                const isActiveTender = activeTarget?.type === "tender_amount" && activeTarget.index === index;
                const needsRef = requiresReference(payment.tenderType, requiredReferenceTenders);
                const refMissing = needsRef && payment.amount.trim() !== "" && payment.reference.trim().length < minReferenceLength;

                return (
                  <div key={`payment-${index}`} className="space-y-1.5">
                    {splitTenderMode && (
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                          Payment {index + 1}
                        </span>
                        {payments.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setPayments((cur) => cur.filter((_, i) => i !== index))}
                            className="rounded-md p-0.5 text-[var(--text-muted)] transition-colors hover:bg-red-50 hover:text-red-500"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}

                    {/* Tender type tabs */}
                    <div className="flex gap-1">
                      {TENDER_TYPES.map((type) => (
                        <TenderTab
                          key={type}
                          type={type}
                          selected={payment.tenderType === type}
                          onClick={() => updatePayment(index, { tenderType: type })}
                        />
                      ))}
                    </div>

                    {/* Amount display / input */}
                    <button
                      type="button"
                      onClick={() => setActiveTarget({ type: "tender_amount", index })}
                      className={cn(
                        "flex h-12 w-full items-center justify-between rounded-xl border px-4 font-mono text-xl font-black transition-all duration-100",
                        isActiveTender
                          ? "border-[var(--border-default)] bg-[color-mix(in_srgb,var(--action-primary-bg)_5%,white)] text-[var(--action-primary-bg)] ring-2 ring-[var(--action-primary-bg)] ring-offset-1"
                          : "border-[var(--border-default)] bg-[var(--surface-muted)] text-[var(--text-strong)]",
                      )}
                    >
                      <span className="text-[13px] font-semibold text-[var(--text-muted)] opacity-70">
                        {tenderLabel(payment.tenderType)}
                      </span>
                      <span>{payment.amount || "0.00"}</span>
                    </button>

                    {/* Reference field */}
                    {needsRef ? (
                      <div className="relative">
                        <Input
                          value={payment.reference}
                          onChange={(e) => updatePayment(index, { reference: e.target.value })}
                          placeholder={`Reference (min ${minReferenceLength} chars)`}
                          className={cn(
                            "h-9 text-sm",
                            refMissing ? "border-amber-300 bg-amber-50 focus-visible:ring-amber-400" : "",
                          )}
                        />
                        {refMissing && (
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-amber-600">
                            Required
                          </span>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {splitTenderMode ? (
                <button
                  type="button"
                  onClick={addPaymentRow}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--border-default)] py-2.5 text-[11px] font-semibold text-[var(--text-muted)] transition-colors hover:border-[var(--action-primary-bg)] hover:bg-[color-mix(in_srgb,var(--action-primary-bg)_4%,var(--surface-base))] hover:text-[var(--action-primary-bg)]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add payment method
                </button>
              ) : null}
            </div>

            {/* Keypad area */}
            <div className="px-3 pb-3">
              {/* Active target label */}
              <div className="mb-2 flex items-center justify-center">
                <span className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--action-primary-bg)_8%,var(--surface-base))] px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--action-primary-bg)]">
                  {activeTargetLabel}
                </span>
              </div>
              <PosNumericKeypad onAction={handleKeypadAction} presets={keypadPresets} />
            </div>
          </div>

          {/* Validation + Charge button — fixed at bottom */}
          <div className="shrink-0 space-y-2 border-t border-[var(--edge-subtle)] bg-[var(--surface-base)] px-3 py-3">
            <PosInlineValidationBanner messages={blockers} />

            <button
              type="button"
              onClick={handleCharge}
              disabled={postSalePending || cart.length === 0}
              className={cn(
                "relative flex h-14 w-full items-center justify-center gap-2.5 overflow-hidden rounded-xl text-[15px] font-black text-white shadow-lg transition-all duration-150 active:scale-[0.98]",
                cart.length === 0
                  ? "cursor-not-allowed bg-[var(--surface-muted)] text-[var(--text-muted)] shadow-none"
                  : blockers.length > 0
                    ? "bg-amber-400 hover:bg-amber-500 shadow-amber-200"
                    : postSalePending
                      ? "cursor-wait bg-emerald-600 opacity-80"
                      : "bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 hover:shadow-[0_4px_16px_rgba(16,185,129,0.4)]",
              )}
            >
              {postSalePending ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Processing…
                </>
              ) : blockers.length > 0 ? (
                <>
                  <Sparkles className="h-5 w-5" />
                  Fix {blockers.length} issue{blockers.length > 1 ? "s" : ""}
                </>
              ) : (
                <>
                  <Wallet className="h-5 w-5" />
                  Charge {money(total)}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════
         DIALOGS & SHEETS
         ════════════════════════════════════════════════════ */}

      {/* ── Customer sheet ──────────────────────────────── */}
      <Sheet open={customerSheetOpen} onOpenChange={setCustomerSheetOpen}>
        <SheetContent side="right" size="md" tabletBehavior="bottom" className="w-full max-w-[32rem] p-0">
          <div className="flex h-full flex-col p-5 sm:p-6">
            <SheetHeader className="border-b border-[var(--border-subtle)] pb-4 pr-10">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                <Users className="h-4 w-4" />
                Customer
              </div>
              <SheetTitle>Attach customer</SheetTitle>
              <SheetDescription>
                Search by name, phone, or email. Save new customers without leaving checkout.
              </SheetDescription>
            </SheetHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4 pr-1">
              {/* Search */}
              <div className="flex items-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-muted)] px-3 py-2 transition-all focus-within:ring-2 focus-within:ring-[var(--action-primary-bg)] focus-within:ring-offset-1">
                <Search className="h-4 w-4 text-[var(--text-muted)]" />
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Search by name, phone, or email"
                  className="h-8 border-none bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                />
              </div>

              {/* Attached banner */}
              {selectedCustomer ? (
                <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <div>
                    <div className="text-sm font-bold text-[var(--text-strong)]">{selectedCustomer.name}</div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {selectedCustomer.phone || selectedCustomer.email || "No contact"}
                    </div>
                  </div>
                  <PosStatusPill tone="success">
                    {selectedCustomer.loyaltyPoints} pts
                  </PosStatusPill>
                </div>
              ) : null}

              {/* Search results */}
              {customerName.trim().length >= 2 ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                    <span className="font-semibold">Matches</span>
                    {customerSearchLoading ? <span>Searching…</span> : null}
                  </div>
                  {customerSearchResults.length === 0 && !customerSearchLoading ? (
                    <p className="py-4 text-center text-sm text-[var(--text-muted)]">No match — save below</p>
                  ) : (
                    customerSearchResults.slice(0, 6).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] px-3 py-2.5 text-left transition-colors hover:border-[var(--action-primary-bg)] hover:bg-[color-mix(in_srgb,var(--action-primary-bg)_4%,var(--surface-base))]"
                        onClick={() => { selectCustomer(c); setCustomerSheetOpen(false); }}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--action-primary-bg)_12%,var(--surface-base))] text-[var(--action-primary-bg)]">
                            <User className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">{c.name}</div>
                            <div className="truncate text-xs text-[var(--text-muted)]">
                              {c.phone || c.email || "No contact"}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[var(--text-muted)]">{c.loyaltyPoints} pts</span>
                          <ArrowRight className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                        </div>
                      </button>
                    ))
                  )}
                </div>
              ) : null}

              {/* Save new customer */}
              <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-muted)] p-4">
                <div className="text-sm font-bold text-[var(--text-strong)]">Save new customer</div>
                <div className="mt-3 grid gap-2">
                  <Input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Full name"
                    className="h-9 bg-[var(--surface-base)] text-sm"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="Phone"
                      className="h-9 bg-[var(--surface-base)] text-sm"
                    />
                    <Input
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="Email"
                      className="h-9 bg-[var(--surface-base)] text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            <SheetFooter className="border-t border-[var(--border-subtle)] pt-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setCustomerSheetOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => createCustomerMutation.mutate()}
                disabled={!customerName.trim() || createCustomerMutation.isPending}
              >
                <Save className="h-3.5 w-3.5" />
                Save customer
              </Button>
            </SheetFooter>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Adjustments dialog ──────────────────────────── */}
      <Dialog open={adjustmentsOpen} onOpenChange={setAdjustmentsOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Sale adjustments</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            {/* Order discount */}
            <div>
              <label className="text-xs font-bold text-[var(--text-muted)]">Order discount</label>
              <NumField
                label="Amount"
                value={orderDiscountAmount}
                active={activeTarget?.type === "order_discount"}
                onActivate={() => { setActiveTarget({ type: "order_discount" }); setAdjustmentsOpen(false); }}
                className="mt-1.5"
              />
            </div>

            {/* Loyalty redemption */}
            {selectedCustomer ? (
              <div>
                <label className="text-xs font-bold text-[var(--text-muted)]">
                  Redeem points
                  <span className="ml-1.5 rounded-full bg-[color-mix(in_srgb,var(--action-primary-bg)_10%,var(--surface-base))] px-2 py-0.5 text-[var(--action-primary-bg)]">
                    {selectedCustomer.loyaltyPoints} available
                  </span>
                </label>
                <NumField
                  label="Points"
                  value={loyaltyRedemptionPoints}
                  active={activeTarget?.type === "redeem_points"}
                  onActivate={() => { setActiveTarget({ type: "redeem_points" }); setAdjustmentsOpen(false); }}
                  className="mt-1.5"
                />
              </div>
            ) : null}

            {/* Override reason (managers only) */}
            {canOverride ? (
              <div>
                <label className="text-xs font-bold text-[var(--text-muted)]">Override reason</label>
                <Input
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Reason for price/discount override"
                  className="mt-1.5 h-9 text-sm"
                />
                <PosStatusPill tone="warning" className="mt-1.5">Manager override enabled</PosStatusPill>
              </div>
            ) : null}

            {/* Promotion */}
            {promotions.length > 0 ? (
              <div>
                <label className="text-xs font-bold text-[var(--text-muted)]">Promotion</label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedPromotionId("")}
                    className={cn(
                      "rounded-full px-3 py-1 text-[11px] font-semibold transition-colors",
                      !selectedPromotionId
                        ? "bg-[var(--action-primary-bg)] text-white"
                        : "bg-[var(--surface-muted)] text-[var(--text-muted)] hover:bg-[var(--surface-base)]",
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
                        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors",
                        selectedPromotionId === promo.id
                          ? "bg-[var(--action-primary-bg)] text-white"
                          : "bg-[var(--surface-muted)] text-[var(--text-muted)] hover:bg-[var(--surface-base)]",
                      )}
                    >
                      <Sparkles className="h-3 w-3" />
                      {promo.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button onClick={() => setAdjustmentsOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Hold dialog ─────────────────────────────────── */}
      <Dialog open={holdDialog} onOpenChange={setHoldDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Hold current sale</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-[var(--text-muted)]">
              Park this cart and come back to it later from the Held screen.
            </p>
            <Input
              value={holdLabel}
              onChange={(e) => setHoldLabel(e.target.value)}
              placeholder="Label (optional — e.g. Table 4)"
              className="h-9"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHoldDialog(false)}>Cancel</Button>
            <Button onClick={() => holdCartMutation.mutate()} disabled={holdCartMutation.isPending}>
              {holdCartMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ReceiptLong className="h-4 w-4" />}
              Hold sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Sale completed ──────────────────────────────── */}
      <Dialog open={Boolean(lastCompletedSale)} onOpenChange={(open) => !open && dismissCompletedSale()}>
        <DialogContent className="sm:max-w-sm p-0 overflow-hidden">
          {/* Success header */}
          <div className="bg-gradient-to-br from-emerald-600 to-emerald-500 px-6 pt-8 pb-6 text-center text-white">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/20 ring-4 ring-white/30">
              <CheckCircle2 className="h-8 w-8 text-white" />
            </div>
            <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-emerald-100">
              Sale complete
            </div>
            <div className="mt-1 font-mono text-xl font-black">
              {lastCompletedSale?.saleNo}
            </div>
          </div>

          {/* Details */}
          <div className="px-6 py-5 space-y-4">
            {/* Change — the most important number for a cashier */}
            <div className="text-center">
              <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">
                Change due
              </div>
              <div className={cn(
                "font-mono font-black leading-none mt-1",
                (lastCompletedSale?.changeAmount ?? 0) > 0
                  ? "text-5xl text-emerald-600"
                  : "text-3xl text-[var(--text-muted)]",
              )}>
                {money(lastCompletedSale?.changeAmount ?? 0)}
              </div>
            </div>

            {/* Secondary info */}
            <div className="flex items-center justify-between rounded-xl bg-[var(--surface-muted)] px-4 py-3">
              <div>
                <div className="text-[11px] text-[var(--text-muted)]">Total charged</div>
                <div className="font-mono text-base font-bold text-[var(--text-strong)]">
                  {money(lastCompletedSale?.totalAmount ?? 0)}
                </div>
              </div>
              {lastCompletedSale?.customerName ? (
                <div className="text-right">
                  <div className="text-[11px] text-[var(--text-muted)]">Customer</div>
                  <div className="text-sm font-semibold text-[var(--text-strong)]">
                    {lastCompletedSale.customerName}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <DialogFooter className="px-6 pb-5 gap-2">
            <Button variant="outline" size="sm" onClick={dismissCompletedSale} className="flex-1">
              Next sale
            </Button>
            {whatsappHref ? (
              <Button variant="outline" size="sm" className="flex-1 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" asChild>
                <a href={whatsappHref} target="_blank" rel="noreferrer">WhatsApp</a>
              </Button>
            ) : null}
            <Button size="sm" className="flex-1" asChild>
              <Link href={getPosPortalHref("history", isPosHost)}>
                <History className="h-4 w-4" />
                History
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
