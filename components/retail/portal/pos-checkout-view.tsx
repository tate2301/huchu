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
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/components/ui/use-toast";
import { useOfflineRuntime } from "@/components/offline/offline-runtime";
import { lineDeposit } from "@/lib/retail/deposits";
import { createOfflineRetailCustomer } from "@/lib/retail/offline-runtime";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  ArrowRight,
  ArrowRightLeft,
  Badge,
  CheckCircle2,
  Checkroom,
  Clock,
  Coins,
  Grid3x3,
  History,
  Home,
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
  ShoppingBag,
  Sparkles,
  Storefront,
  User,
  Users,
  Wallet,
  X,
  Zap,
} from "@/lib/icons";
import { cn } from "@/lib/utils";
import { getPosPortalHref } from "@/lib/retail/pos-host";
import { enumLabel, fiscalStatusLabel, tenderLabel } from "@/lib/retail/words";
import { PosNumericKeypad } from "./pos-numeric-keypad";
import { applyPosKeypadAction, type PosKeypadAction } from "./pos-numeric-input";
import { PosEmptyState, PosStatusPill } from "./pos-primitives";
import { usePosPortalState } from "./pos-portal-state";
import type { PaymentRow, TenderType } from "./pos-types";
import { money } from "./pos-utils";
import { changeWords, splitChange, zigWords, type TillTender } from "@/lib/retail/payment-words";

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

function roundUp(value: number, step: number) {
  if (value <= 0) return 0;
  return Math.ceil(value / step) * step;
}

function TenderIcon({ type, className }: { type: TenderType; className?: string }) {
  const cls = cn("h-[1.1em] w-[1.1em]", className);
  switch (type) {
    case "CASH": return <Coins className={cls} />;
    case "CARD": return <QrCode className={cls} />;
    case "ECOCASH":
    case "INNBUCKS": return <Payments className={cls} />;
    case "TRANSFER":
    case "ON_ACCOUNT": return <ArrowRightLeft className={cls} />;
    case "VOUCHER": return <Zap className={cls} />;
  }
}

function getDefaultNumericTarget(
  activeTarget: CheckoutNumericTarget | null,
  cartLength: number,
): CheckoutNumericTarget | null {
  if (activeTarget) return activeTarget;
  if (cartLength > 0) {
    return { type: "tender_amount", index: 0 };
  }
  return null;
}

function getCategoryIcon(category: string | null | undefined) {
  const normalized = (category ?? "").toLowerCase();
  if (
    normalized.includes("cloth") ||
    normalized.includes("wear") ||
    normalized.includes("fashion") ||
    normalized.includes("apparel")
  ) {
    return Checkroom;
  }
  if (
    normalized.includes("home") ||
    normalized.includes("house") ||
    normalized.includes("furniture")
  ) {
    return Home;
  }
  if (
    normalized.includes("shop") ||
    normalized.includes("store") ||
    normalized.includes("general")
  ) {
    return Storefront;
  }
  if (
    normalized.includes("beauty") ||
    normalized.includes("care") ||
    normalized.includes("cosmetic")
  ) {
    return Sparkles;
  }
  if (normalized.includes("bag") || normalized.includes("travel")) {
    return ShoppingBag;
  }
  if (normalized.includes("accessor") || normalized.includes("gift")) {
    return Badge;
  }
  return Package;
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

/* ─── Tender type grid button (token-driven, physical press) ────────── */

const TENDER_TOKEN_KEYS: Record<TenderType, string> = {
  CASH: "cash",
  CARD: "card",
  ECOCASH: "mobile",
  INNBUCKS: "mobile",
  TRANSFER: "transfer",
  ON_ACCOUNT: "transfer",
  VOUCHER: "voucher",
};

/** Before the till's context lands: cash in the sale's currency. */
const CASH_ONLY: TillTender[] = [{ tender: "CASH", currency: null, label: "Cash" }];

/** Whether a payment row is this tender: cash by its currency, the rest by type. */
function isTender(payment: PaymentRow, option: TillTender) {
  if (payment.tenderType !== option.tender) return false;
  return option.tender !== "CASH" || (payment.currency === "ZWG") === (option.currency === "ZWG");
}

/** A payment row's words: the till's own label for its tender ("Cash ZiG"). */
function paymentLabel(payment: PaymentRow, options: TillTender[]) {
  return options.find((option) => isTender(payment, option))?.label ?? tenderLabel(payment.tenderType);
}

/** What is due in the tender's own money: ZiG at today's rate. */
function dueIn(total: number, currency: PaymentRow["currency"], zigRate: number | null) {
  return currency === "ZWG" && zigRate ? (total * zigRate).toFixed(2) : total.toFixed(2);
}

function TenderButton({
  option,
  selected,
  onClick,
}: {
  option: TillTender;
  selected: boolean;
  onClick: () => void;
}) {
  const type = option.tender as TenderType;
  const key = TENDER_TOKEN_KEYS[type];
  const selectedStyle = {
    background: `var(--pos-tender-${key}-bg)`,
    borderColor: `var(--pos-tender-${key}-bg)`,
    boxShadow: `0 3px 0 var(--pos-tender-${key}-shadow)`,
    color: "#ffffff",
  };
  const idleStyle = {
    background: "var(--pos-tender-idle-bg)",
    borderColor: "var(--pos-tender-idle-border)",
    boxShadow: "0 3px 0 var(--pos-tender-idle-shadow)",
    color: "var(--pos-tender-idle-text)",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-center text-xs font-bold leading-tight transition-all duration-75 active:translate-y-[2px] active:shadow-none"
      style={selected ? selectedStyle : idleStyle}
    >
      <TenderIcon type={type} className="h-4 w-4" />
      {option.label}
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
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  /* ── Global POS state ────────────────────────── */
  const {
    search, setSearch,
    categories, selectedCategory, setSelectedCategory,
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
    addToCart, updateQty, updateItemPrice, updateItemDiscount, updateEmptiesBack, depositAmount,
    removeFromCart, clearCart,
    postSale, postSalePending,
    checkoutBaseBlockers,
    pendingOfflineSales, syncOfflineSales, syncOfflineSalesPending,
    requiredReferenceTenders, minReferenceLength,
    lastCompletedSale, dismissCompletedSale,
    needsIdCheck, checkId,
    till,
  } = usePosPortalState();
  // The tenders the shop takes, in the order Payments lists them, and today's ZiG rate (SET-05).
  const tenderOptions = till?.tenders ?? CASH_ONLY;
  const zigRate = till?.zig ? Number(till.zig.rate) : null;
  const change = splitChange(changeAmount, till?.zig ? { rate: Number(till.zig.rate), rounding: till.zig.rounding } : null);
  // The change the server recorded for the sale just rung, as it is handed back.
  const completedUsd = Number(lastCompletedSale?.changeUsd ?? lastCompletedSale?.changeAmount ?? 0);
  const completedZig = Number(lastCompletedSale?.changeZig ?? 0);

  /* ── Derived state ───────────────────────────── */

  const selectedLine = useMemo(
    () => cart.find((line) => line.catalogItemId === selectedLineId) ?? null,
    [cart, selectedLineId],
  );

  const selectedCustomer =
    customerSearchResults.find((c) => c.id === selectedCustomerId) ?? null;

  const selectedPromotion =
    promotions.find((p) => p.id === selectedPromotionId) ?? null;
  const categoryChips = useMemo(
    () => ["All", ...categories],
    [categories],
  );

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
        current.map((p, i) => (i === 0 ? { ...p, amount: dueIn(total, p.currency, zigRate) } : p)),
      );
    }
    if (cart.length === 0 && payments[0].amount.trim()) {
      // Cart cleared — reset dirty flag so the next sale gets auto-filled again.
      paymentUserEditedRef.current = false;
      setPayments((current) =>
        current.map((p, i) => (i === 0 ? { ...p, amount: "" } : p)),
      );
    }
  }, [cart.length, payments, setPayments, splitTenderMode, total, zigRate]);

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

  /* ── Keyboard shortcuts ─────────────────────── */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      if (isTyping) return;

      if (e.key === "/") {
        e.preventDefault();
        focusSearchInput();
      }
      if (e.key === "Escape") {
        if (search.trim()) {
          setSearch("");
          focusSearchInput();
        } else if (selectedLineId) {
          setSelectedLineId(null);
          setActiveTarget(null);
        }
      }

      if (/^[0-9.]$/.test(e.key)) {
        e.preventDefault();
        if (!activeTarget && cart.length > 0) {
          setActiveTarget({ type: "tender_amount", index: 0 });
        }
        paymentUserEditedRef.current = true;
        setPayments((current) => {
          const next = [...current];
          const targetIndex = 0;
          const base = next[targetIndex] ?? { tenderType: "CASH" as TenderType, amount: "", reference: "" };
          next[targetIndex] = {
            ...base,
            amount: applyPosKeypadAction(base.amount ?? "", { type: "digit", value: e.key }),
          };
          return next;
        });
      }

      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        if (!activeTarget && cart.length > 0) {
          setActiveTarget({ type: "tender_amount", index: 0 });
        }
        paymentUserEditedRef.current = true;
        setPayments((current) => {
          const next = [...current];
          const targetIndex = 0;
          const base = next[targetIndex] ?? { tenderType: "CASH" as TenderType, amount: "", reference: "" };
          next[targetIndex] = {
            ...base,
            amount: applyPosKeypadAction(base.amount ?? "", { type: "backspace" }),
          };
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTarget, cart.length, search, selectedLineId, setPayments, setSearch]);

  const blockers = useMemo(() => {
    const next = [...checkoutBaseBlockers];
    if (nonCashTotal > total + 0.01) next.push("Card, EcoCash and the other non-cash tenders come to more than the total");
    if (tenderedTotal < total - 0.01) next.push("Less than the total is tendered");
    if (hasMissingRequiredReference) next.push("A reference is missing");
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
      // eslint-disable-next-line react-hooks/immutability
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

  function handleKeypadAction(action: PosKeypadAction) {
    const nextTarget = getDefaultNumericTarget(activeTarget, cart.length);
    if (!nextTarget) return;
    if (!activeTarget) {
      setActiveTarget(nextTarget);
    }
    applyToTarget(nextTarget, action);
  }

  const handleCharge = () => {
    // A recalled basket with alcohol in it: the check is asked for here, and
    // the cashier charges again once it is done.
    if (needsIdCheck) {
      void checkId();
      return;
    }
    if (blockers.length) return;
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
    const numericTarget = getDefaultNumericTarget(activeTarget, cart.length);
    if (!numericTarget) return "Ready";
    if (numericTarget.type === "order_discount") return "Sale discount";
    if (numericTarget.type === "redeem_points") return "Loyalty points";
    if (numericTarget.type === "tender_amount")
      return tenderLabel(payments[numericTarget.index]?.tenderType ?? "CASH");
    if (numericTarget.type === "line_qty") return "Quantity";
    if (numericTarget.type === "line_price") return "Price";
    return "Discount";
  })();

  /**
   * What is currently in the field the keys are pointed at.
   *
   * The keypad is pinned to the bottom of the rail while the field it edits
   * scrolls with the basket, so the two can be a screen apart. This is read
   * from the same places `applyToTarget` writes to, and echoed beside the
   * target label. `null` means there is nothing to type into yet.
   */
  const activeTargetValue = (() => {
    const numericTarget = getDefaultNumericTarget(activeTarget, cart.length);
    if (!numericTarget) return null;
    if (numericTarget.type === "order_discount") return orderDiscountAmount;
    if (numericTarget.type === "redeem_points") return loyaltyRedemptionPoints;
    if (numericTarget.type === "tender_amount") return payments[numericTarget.index]?.amount ?? "";
    const line = selectedLine?.catalogItemId === numericTarget.lineId ? selectedLine : null;
    if (!line) return null;
    if (numericTarget.type === "line_qty") return String(line.quantity);
    if (numericTarget.type === "line_price") return String(line.unitPrice);
    return String(line.lineDiscountAmount ?? 0);
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
      toast({ title: "Customer created", variant: "success" });
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
        toast({ title: "Customer saved on this till", variant: "default" });
        return;
      }
      toast({ title: "That customer was not created", description: message, variant: "destructive" });
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
      toast({ title: "Sale held", variant: "success" });
      setHoldDialog(false);
      setHoldLabel("");
      clearCart();
      queryClient.invalidateQueries({ queryKey: ["retail-held-carts"] });
      router.push(getPosPortalHref("held", isPosHost));
    },
    onError: (error) =>
      toast({ title: "That sale was not held", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const updatePayment = (index: number, next: Partial<PaymentRow>) => {
    setPayments((current) =>
      current.map((entry, i) => (i === index ? { ...entry, ...next } : entry)),
    );
  };

  const addPaymentRow = () => {
    setPayments((current) => [...current, { tenderType: "CARD", amount: "", reference: "" }]);
  };

  /** Pick a tender for a payment row; one payment is the whole amount, in the tender's money. */
  const chooseTender = (index: number, option: TillTender) => {
    const currency = option.currency ?? undefined;
    updatePayment(index, {
      tenderType: option.tender as TenderType,
      currency,
      ...(splitTenderMode || cart.length === 0 ? {} : { amount: dueIn(total, currency, zigRate) }),
    });
  };
  const canCharge = cart.length > 0 && blockers.length === 0 && !postSalePending;

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
            autoFocus={typeof window === "undefined" || !window.matchMedia("(hover: none)").matches}
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
              aria-label="Clear the search"
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

        {/* The shift: its number when open, the way to open one when not. */}
        {currentShift ? (
          <span className="hidden shrink-0 font-mono text-[11px] font-semibold text-[var(--text-muted)] md:inline">
            {currentShift.shiftNo}
          </span>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 text-xs ring-1"
            style={{ background: "var(--pos-status-warning-bg)", borderColor: "var(--pos-status-warning-ring)", color: "var(--pos-status-warning-text)" }}
            asChild
          >
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
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold ring-1 transition-colors disabled:opacity-60"
            style={{ background: "var(--pos-status-warning-bg)", boxShadow: `inset 0 0 0 1px var(--pos-status-warning-ring)`, color: "var(--pos-status-warning-text)" }}
          >
            {syncOfflineSalesPending
              ? <RefreshCcw className="h-3 w-3 animate-spin" />
              : <RefreshCcw className="h-3 w-3" />}
            {pendingOfflineSales} waiting to send
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
        </div>
      </div>

      {/*
        ── Catalog + payment, side by side from tablet up ───────────────

        The columns used to be declared only at `xl`, which left every width
        between 768 and 1279 as a single-column grid: catalog first, payment
        rail — keypad included — stacked underneath and off the bottom of the
        screen. The till's actual device is a 1024×768 tablet, so that band was
        not an edge case, it was the shop floor. Two columns from `md`.

        320px is the narrowest the rail renders honestly: a four-across tender
        grid and a three-across keypad with 44px keys.
      */}
      <div className="hidden min-h-0 flex-1 overflow-hidden md:grid md:grid-cols-[minmax(0,1fr)_minmax(320px,0.95fr)] xl:grid-cols-[minmax(0,1.42fr)_minmax(360px,0.9fr)]">

        {/* ┄ Column 1 — Catalog ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ */}
        <div className="flex min-h-0 flex-col overflow-hidden border-r border-[var(--edge-subtle)] bg-[var(--surface-base)]">
          <div className="flex shrink-0 flex-wrap gap-2 border-b border-[var(--edge-subtle)] px-3 py-2">
            {categoryChips.map((category) => {
              const isAll = category === "All";
              const active = isAll ? !selectedCategory : selectedCategory === category;
              const CategoryIcon = isAll ? Grid3x3 : getCategoryIcon(category);
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setSelectedCategory(isAll ? null : category)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors",
                    active
                      ? "border-[var(--action-primary-bg)] bg-[color-mix(in_srgb,var(--action-primary-bg)_10%,white)] text-[var(--action-primary-bg)]"
                      : "border-[var(--border-default)] bg-[var(--surface-muted)] text-[var(--text-muted)] hover:border-[var(--action-primary-bg)] hover:text-[var(--text-strong)]",
                  )}
                >
                  <CategoryIcon className="h-3.5 w-3.5" />
                  {isAll ? category : enumLabel(category)}
                </button>
              );
            })}
          </div>

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
                No promotion
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
                Loading the products…
              </div>
            ) : catalogItems.length === 0 ? (
              <div className="flex min-h-[10rem] flex-col items-center justify-center gap-2 text-center">
                <Package className="h-8 w-8 text-[var(--text-muted)]" />
                <p className="text-sm font-medium text-[var(--text-muted)]">
                  {search
                    ? "No products match that search"
                    : selectedCategory
                      ? "No products match this filter"
                      : "No products yet"}
                </p>
                {(search || selectedCategory) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setSelectedCategory(null);
                    }}
                    className="text-xs text-[var(--action-primary-bg)] underline-offset-2 hover:underline"
                  >
                    Clear the filters
                  </button>
                )}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
                {catalogItems.map((item) => {
                  const inCart = cart.find((c) => c.catalogItemId === item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      // Hooks for `e2e/retail-workflows.spec.ts`, which rings a
                      // real sale through this grid. Named by product because
                      // "the third card" changes with the catalogue.
                      data-testid="pos-product"
                      data-product-name={item.name}
                      onClick={() => handleAddCatalogItem(item)}
                      disabled={!currentShift}
                      className={cn(
                        "group relative flex min-h-[14.5rem] flex-col overflow-hidden rounded-2xl border bg-[var(--surface-base)] text-left transition-all duration-100 active:scale-[0.97]",
                        inCart
                          ? "border-[color-mix(in_srgb,var(--action-primary-bg)_50%,var(--border-default))] bg-[color-mix(in_srgb,var(--action-primary-bg)_3%,var(--surface-base))] shadow-[0_0_0_1.5px_color-mix(in_srgb,var(--action-primary-bg)_30%,transparent),0_10px_20px_rgba(0,0,0,0.06)]"
                          : "border-[var(--border-default)] hover:border-[color-mix(in_srgb,var(--action-primary-bg)_40%,var(--border-default))] hover:shadow-[0_10px_20px_rgba(0,0,0,0.08)]",
                      )}
                    >
                      {/* Image / placeholder */}
                      <div className={cn(
                        "flex h-28 w-full shrink-0 items-center justify-center overflow-hidden rounded-b-none rounded-t-[0.95rem] transition-colors",
                        inCart
                          ? "bg-[color-mix(in_srgb,var(--action-primary-bg)_10%,var(--surface-muted))]"
                          : "bg-[var(--surface-muted)]",
                      )}>
                        {item.imageUrl ? (
                          <Image src={item.imageUrl} alt={item.name} width={60} height={60} className="h-full w-full object-cover" unoptimized />
                        ) : (
                          <Package className={cn("h-6 w-6", inCart ? "text-[var(--action-primary-bg)]" : "text-[var(--text-muted)]")} />
                        )}
                      </div>

                      {/* Info + price stacked */}
                      <div className="min-w-0 flex-1 p-3 pt-2.5">
                        <div className="line-clamp-2 text-[13px] font-semibold leading-[1.3] text-[var(--text-strong)]">
                          {item.name}
                        </div>
                        <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-[var(--text-muted)]">
                          {(() => {
                            const CategoryIcon = getCategoryIcon(item.category);
                            return <CategoryIcon className="h-3.5 w-3.5" />;
                          })()}
                          <span className="truncate">{item.category ? enumLabel(item.category) : "General"}</span>
                        </div>
                        <div className="mt-2 flex items-end justify-between gap-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {/* Stock draws nothing until it is an exception. */}
                            {item.inventoryItem && item.inventoryItem.currentStock <= 5 ? (
                              <span
                                className={cn(
                                  "rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                                  item.inventoryItem.currentStock <= 0
                                    ? "bg-red-50 text-red-700"
                                    : "bg-amber-50 text-amber-700",
                                )}
                              >
                                {item.inventoryItem.currentStock <= 0 ? "Out of stock" : "Low"}
                              </span>
                            ) : null}
                          </div>
                          <div className="shrink-0 text-right">
                            {item.compareAtPrice && item.compareAtPrice > item.unitPrice ? (
                              <div className="font-mono text-[10px] text-[var(--text-muted)] line-through">
                                {money(item.compareAtPrice)}
                              </div>
                            ) : null}
                            <div className={cn(
                              "font-mono text-[15px] font-black leading-none",
                              inCart ? "text-[var(--action-primary-bg)]" : "text-[var(--text-strong)]",
                            )}>
                              {money(item.unitPrice)}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* In-cart badge */}
                      {inCart ? (
                        <div className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--action-primary-bg)] px-1.5 text-[11px] font-black text-white shadow-[0_2px_8px_rgba(0,0,0,0.2)]">
                          ×{inCart.quantity % 1 === 0 ? inCart.quantity : inCart.quantity.toFixed(2)}
                        </div>
                      ) : (
                        <div className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--action-primary-bg)] text-white opacity-0 shadow-md transition-opacity duration-100 group-hover:opacity-100">
                          <Plus className="h-3.5 w-3.5" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ┄ Column 3 — Payment ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ */}
        <div className="flex min-h-0 flex-col overflow-hidden border-l border-[var(--edge-subtle)] bg-[var(--surface-base)] md:col-start-2">

          {/*
            Amount due header. Padding and type shrink on a short viewport for
            the same reason the keys do — on a 768px-tall tablet this header,
            the pinned keypad and the Charge button all have to fit at once,
            and the header is the part that can give without costing a tap.
          */}
          <div className={cn(
            "shrink-0 border-b border-[var(--edge-subtle)] px-4 pt-3 pb-3 text-center [@media(min-height:820px)]:pt-5 [@media(min-height:820px)]:pb-4",
            cart.length > 0
              ? "bg-gradient-to-b from-[color-mix(in_srgb,var(--action-primary-bg)_7%,var(--surface-base))] via-[color-mix(in_srgb,var(--action-primary-bg)_3%,var(--surface-base))] to-[var(--surface-base)]"
              : "bg-[var(--surface-base)]",
          )}>
            <div className="text-xs font-bold text-[var(--text-muted)]">
              Amount due
            </div>
            <div className={cn(
              "mt-1 font-mono font-black leading-none tracking-tight transition-all duration-150",
              total >= 10000
                ? "text-[2.2rem] [@media(min-height:820px)]:text-[2.6rem]"
                : total >= 1000
                  ? "text-[2.5rem] [@media(min-height:820px)]:text-[3rem]"
                  : "text-[2.9rem] [@media(min-height:820px)]:text-[3.5rem]",
              cart.length > 0 ? "text-[var(--text-strong)]" : "text-[var(--text-muted)]",
            )}>
              {money(total)}
            </div>

            {/* Change / balance indicators */}
            {changeAmount > 0 ? (
              <div
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-black ring-1"
                style={{ background: "var(--pos-change-bg)", color: "var(--pos-change-text)", boxShadow: `inset 0 0 0 1px var(--pos-status-success-ring)` }}
              >
                {changeWords(change)}
              </div>
            ) : tenderedTotal > 0 && tenderedTotal < total ? (
              <div
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ring-1"
                style={{ background: "var(--pos-due-bg)", color: "var(--pos-due-text)", boxShadow: `inset 0 0 0 1px var(--pos-status-warning-ring)` }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: "var(--pos-due-text)" }}
                />
                Still due {money(total - tenderedTotal)}
              </div>
            ) : tenderedTotal > 0 && cart.length > 0 ? (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-muted)] px-3 py-1 text-xs font-medium text-[var(--text-muted)]">
                Tendered <span className="font-mono font-semibold">{money(tenderedTotal)}</span>
              </div>
            ) : null}

            {/* Quick action pills */}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
              <button
                type="button"
                onClick={() => setAdjustmentsOpen(true)}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--border-default)] bg-[var(--surface-base)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-muted)] shadow-sm transition-all duration-100 hover:border-[var(--action-primary-bg)] hover:text-[var(--action-primary-bg)]"
              >
                <Sparkles className="h-3 w-3" />
                Discount
              </button>
              <button
                type="button"
                onClick={() => setSplitTenderMode(!splitTenderMode)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-sm transition-all duration-100",
                  splitTenderMode
                    ? "border-[var(--action-primary-bg)] bg-[color-mix(in_srgb,var(--action-primary-bg)_10%,var(--surface-base))] text-[var(--action-primary-bg)]"
                    : "border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-muted)] hover:border-[var(--action-primary-bg)] hover:text-[var(--action-primary-bg)]",
                )}
              >
                <Payments className="h-3 w-3" />
                {splitTenderMode ? "One payment" : "Split payment"}
              </button>
              <button
                type="button"
                onClick={() => setHoldDialog(true)}
                disabled={cart.length === 0 || !currentShift}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--border-default)] bg-[var(--surface-base)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-muted)] shadow-sm transition-all duration-100 hover:border-[var(--action-primary-bg)] hover:text-[var(--action-primary-bg)] disabled:opacity-40"
              >
                <ReceiptLong className="h-3 w-3" />
                Hold
              </button>
            </div>
          </div>

          {/* Scrollable payment section */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-3 px-3 pt-2 pb-3">
              <div className="flex items-center justify-between rounded-lg border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-3 py-2">
                <button
                  type="button"
                  onClick={() => setCustomerSheetOpen(true)}
                  className="inline-flex min-w-0 items-center gap-2 text-left"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--action-primary-bg)_12%,white)] text-[var(--action-primary-bg)]">
                    <User className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[var(--text-strong)]">
                      {selectedCustomer?.name ?? "Walk-in customer"}
                    </div>
                    {selectedCustomer?.phone || selectedCustomer?.email ? (
                      <div className="truncate text-[11px] text-[var(--text-muted)]">
                        {selectedCustomer.phone || selectedCustomer.email}
                      </div>
                    ) : null}
                  </div>
                </button>
                {cart.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      clearCart();
                    }}
                    className="rounded-full px-2 py-1 text-[11px] font-semibold text-[var(--text-muted)] transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    Clear the cart
                  </button>
                ) : null}
              </div>

              <div className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)]">
                <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--text-strong)]">Products</span>
                    <span className="rounded-full bg-[var(--surface-base)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-muted)]">
                      {cart.length}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">{money(subtotal)}</div>
                </div>
                {/*
                  No inner scroller. The rail's own scroll region is short once
                  the keypad is pinned, and a 15rem box inside it made two
                  nested scrollers a thumb had to guess between.
                */}
                <div>
                  {cart.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
                      <Payments className="h-7 w-7 text-[var(--text-muted)]" />
                      <p className="text-sm font-medium text-[var(--text-muted)]">No products yet</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-[var(--border-subtle)]">
                      {cart.map((item) => {
                        const lineTotal = item.quantity * item.unitPrice - (item.lineDiscountAmount ?? 0);
                        const isSelected = selectedLineId === item.catalogItemId;
                        return (
                          <div
                            key={`compact-${item.catalogItemId}`}
                            data-testid="pos-cart-line"
                            className={cn(
                              "grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 px-3 py-2.5",
                              isSelected ? "bg-[color-mix(in_srgb,var(--action-primary-bg)_5%,white)]" : "bg-transparent",
                            )}
                          >
                            <button
                              type="button"
                              className="min-w-0 text-left"
                              onClick={() => {
                                setSelectedLineId(item.catalogItemId);
                                setActiveTarget({ type: "line_qty", lineId: item.catalogItemId });
                              }}
                            >
                              <div className="truncate text-[13px] font-semibold text-[var(--text-strong)]">
                                {item.name}
                              </div>
                              <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                                <span className="font-mono">{money(item.unitPrice)}</span>
                                {item.lineDiscountAmount ? (
                                  <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 font-mono text-emerald-700">
                                    −{money(item.lineDiscountAmount)}
                                  </span>
                                ) : null}
                              </div>
                            </button>

                            <div className="flex items-center gap-1 rounded-full border border-[var(--border-default)] bg-[var(--surface-base)] px-1 py-1">
                              <button
                                type="button"
                                aria-label={`One fewer ${item.name}`}
                                onClick={() => {
                                  const next = item.quantity - 1;
                                  if (next <= 0) {
                                    removeFromCart(item.catalogItemId);
                                    if (selectedLineId === item.catalogItemId) {
                                      setSelectedLineId(null);
                                      setActiveTarget(null);
                                    }
                                    return;
                                  }
                                  updateQty(item.catalogItemId, next);
                                }}
                                className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-red-50 hover:text-red-600"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="min-w-[2rem] text-center font-mono text-[13px] font-bold text-[var(--text-strong)]">
                                {item.quantity % 1 === 0 ? item.quantity : item.quantity.toFixed(1)}
                              </span>
                              <button
                                type="button"
                                aria-label={`One more ${item.name}`}
                                onClick={() => updateQty(item.catalogItemId, item.quantity + 1)}
                                className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--action-primary-bg)_8%,white)] hover:text-[var(--action-primary-bg)]"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            <div className="flex items-center gap-1">
                              <div className="min-w-[4.3rem] text-right font-mono text-[13px] font-black text-[var(--text-strong)]">
                                {money(lineTotal)}
                              </div>
                              <button
                                type="button"
                                aria-label={`Remove ${item.name}`}
                                onClick={() => {
                                  removeFromCart(item.catalogItemId);
                                  if (selectedLineId === item.catalogItemId) {
                                    setSelectedLineId(null);
                                    setActiveTarget(null);
                                  }
                                }}
                                className="rounded-full p-1 text-[var(--text-muted)] transition-colors hover:bg-red-50 hover:text-red-600"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            {item.returnable && item.depositAmount ? (
                              <div className="col-span-3 flex items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
                                <span>
                                  Deposit <span className="font-mono">{money(item.depositAmount)}</span> a bottle
                                  {lineDeposit(item) > 0 ? (
                                    <span className="font-mono text-[var(--text-strong)]"> · {money(lineDeposit(item))}</span>
                                  ) : null}
                                </span>
                                <span className="flex items-center gap-1">
                                  Empties back
                                  <button
                                    type="button"
                                    aria-label={`One fewer empty for ${item.name}`}
                                    disabled={!item.emptiesBack}
                                    onClick={() => updateEmptiesBack(item.catalogItemId, (item.emptiesBack ?? 0) - 1)}
                                    className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border-default)] disabled:opacity-40"
                                  >
                                    <Minus className="h-3 w-3" />
                                  </button>
                                  <span className="min-w-[1.5rem] text-center font-mono font-bold text-[var(--text-strong)]">
                                    {item.emptiesBack ?? 0}
                                  </span>
                                  <button
                                    type="button"
                                    aria-label={`One more empty for ${item.name}`}
                                    disabled={(item.emptiesBack ?? 0) >= Math.floor(item.quantity)}
                                    onClick={() => updateEmptiesBack(item.catalogItemId, (item.emptiesBack ?? 0) + 1)}
                                    className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border-default)] disabled:opacity-40"
                                  >
                                    <Plus className="h-3 w-3" />
                                  </button>
                                </span>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="space-y-1 border-t border-[var(--border-subtle)] px-3 py-2.5 text-xs empty:hidden">
                  {discountAmount > 0 ? (
                    <div className="flex items-center justify-between text-emerald-700">
                      <span>Discount{selectedPromotion ? ` (${selectedPromotion.name})` : ""}</span>
                      <span className="font-mono">−{money(discountAmount)}</span>
                    </div>
                  ) : null}
                  {taxAmount > 0 ? (
                    <div className="flex items-center justify-between text-[var(--text-muted)]">
                      <span>VAT</span>
                      <span className="font-mono">{money(taxAmount)}</span>
                    </div>
                  ) : null}
                  {depositAmount > 0 ? (
                    <div className="flex items-center justify-between text-[var(--text-muted)]">
                      <span>Bottle deposits</span>
                      <span className="font-mono">{money(depositAmount)}</span>
                    </div>
                  ) : null}
                </div>
              </div>

              {payments.map((payment, index) => {
                const isActiveTender = activeTarget?.type === "tender_amount" && activeTarget.index === index;
                const needsRef = requiresReference(payment.tenderType, requiredReferenceTenders);
                const refMissing = needsRef && payment.amount.trim() !== "" && payment.reference.trim().length < minReferenceLength;

                return (
                  <div key={`payment-${index}`} className="space-y-1.5">
                    {splitTenderMode && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[var(--text-muted)]">
                          Payment {index + 1}
                        </span>
                        {payments.length > 1 && (
                          <button
                            type="button"
                            aria-label={`Remove payment ${index + 1}`}
                            onClick={() => setPayments((cur) => cur.filter((_, i) => i !== index))}
                            className="rounded-md p-0.5 text-[var(--text-muted)] transition-colors hover:bg-red-50 hover:text-red-500"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}

                    {/* Tender type grid */}
                    <div className="grid grid-cols-4 gap-1.5">
                      {tenderOptions.map((option) => (
                        <TenderButton
                          key={`${option.tender}:${option.currency ?? ""}`}
                          option={option}
                          selected={isTender(payment, option)}
                          onClick={() => chooseTender(index, option)}
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
                        {paymentLabel(payment, tenderOptions)}
                      </span>
                      <span>{payment.amount || "0.00"}</span>
                    </button>

                    {/* Reference field */}
                    {needsRef ? (
                      <div className="relative">
                        <Input
                          value={payment.reference}
                          onChange={(e) => updatePayment(index, { reference: e.target.value })}
                          placeholder={`Reference, ${minReferenceLength} characters or more`}
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
                  Add a payment
                </button>
              ) : null}
            </div>

          </div>

          {/*
            ── The keypad is pinned ─────────────────────────────────────

            It used to sit at the bottom of the scrolling payment section, so
            how far a cashier had to scroll to reach it depended on how many
            lines were in the basket. On the eighth beer of a round it was off
            the screen entirely.

            A till's number pad is not content. It is the input surface, and it
            has to be in the same place on every sale — the cashier's thumb
            should find it without their eyes leaving the customer. So the
            basket scrolls and everything below it stays put: keypad, then
            Charge, both `shrink-0`.
          */}
          <div
            data-testid="pos-keypad-pinned"
            className="shrink-0 border-t border-[var(--edge-subtle)] bg-[var(--surface-base)] px-3 pb-2 pt-2"
          >
            {/* What the keys are pointed at, what is in it, and how to empty it. */}
            <div className="mb-2 flex items-center gap-2">
              <span className="inline-flex shrink-0 items-center rounded-full bg-[color-mix(in_srgb,var(--action-primary-bg)_10%,var(--surface-base))] px-3 py-1 text-xs font-bold text-[var(--action-primary-bg)]">
                {activeTargetLabel}
              </span>
              {/*
                The field being typed into can now be scrolled out of sight
                above, so the pinned area has to echo its value. Without this
                the cashier is typing into somewhere they cannot see.
              */}
              <span className="min-w-0 flex-1 truncate font-mono text-sm font-black tabular-nums text-[var(--text-strong)]">
                {activeTargetValue === null ? "" : activeTargetValue || "0"}
              </span>
              {/*
                CLR out of the key grid — see `clear` on `PosNumericKeypad`. It
                kept a whole row to itself, and a destructive key under the
                digits is one a thumb catches on the way to `0`.
              */}
              <button
                type="button"
                onClick={() => handleKeypadAction({ type: "clear" })}
                disabled={activeTargetValue === null}
                className="shrink-0 rounded-full border border-[var(--border-default)] px-2.5 py-1 text-xs font-black text-[var(--text-muted)] transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
              >
                Clear the amount
              </button>
            </div>

            {/* Quick-cash presets */}
            {keypadPresets.length > 0 &&
            getDefaultNumericTarget(activeTarget, cart.length)?.type === "tender_amount" ? (
              <div className="mb-2 flex flex-wrap items-center justify-center gap-1.5">
                {keypadPresets.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    data-testid="pos-cash-preset"
                    onClick={() => handleKeypadAction({ type: "preset", value: p.value })}
                    className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 hover:border-emerald-300"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            ) : null}

            <PosNumericKeypad onAction={handleKeypadAction} clear={false} />
          </div>

          {/* Validation + Charge button — fixed at bottom */}
          <div className="shrink-0 border-t border-[var(--edge-subtle)] bg-[var(--surface-base)] px-3 py-3">

            <button
              type="button"
              data-testid="pos-charge"
              onClick={handleCharge}
              disabled={!canCharge}
              className={cn(
                "relative flex h-[3.75rem] w-full items-center justify-center gap-2.5 overflow-hidden rounded-2xl text-[15px] font-black text-white transition-all duration-150 active:scale-[0.98]",
                canCharge
                  ? "bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-[0_6px_24px_rgba(16,185,129,0.45)] hover:shadow-[0_8px_28px_rgba(16,185,129,0.5)]"
                  : "cursor-not-allowed bg-[var(--surface-muted)] text-[var(--text-muted)] shadow-none",
              )}
            >
              {/* Subtle shine overlay */}
              {canCharge && !postSalePending && (
                <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-t from-transparent to-white/[0.08]" />
              )}
              {postSalePending ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Charging…
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

      {/* ── Mobile layout (< md) ────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:hidden">
        {/* Mobile catalog — full width, 2-col grid */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--surface-base)]">
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {categoryChips.map((category) => {
                const isAll = category === "All";
                const active = isAll ? !selectedCategory : selectedCategory === category;
                const CategoryIcon = isAll ? Grid3x3 : getCategoryIcon(category);
                return (
                  <button
                    key={`mobile-${category}`}
                    type="button"
                    onClick={() => setSelectedCategory(isAll ? null : category)}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors",
                      active
                        ? "border-[var(--action-primary-bg)] bg-[color-mix(in_srgb,var(--action-primary-bg)_10%,white)] text-[var(--action-primary-bg)]"
                        : "border-[var(--border-default)] bg-[var(--surface-muted)] text-[var(--text-muted)]",
                    )}
                  >
                    <CategoryIcon className="h-3.5 w-3.5" />
                    {isAll ? category : enumLabel(category)}
                  </button>
                );
              })}
            </div>

            {catalogItems.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface-muted)]">
                  <Search className="h-7 w-7 text-[var(--text-muted)]" />
                </div>
                <p className="text-sm font-medium text-[var(--text-muted)]">
                  {search ? "No products match that search" : "No products yet"}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {catalogItems.map((item) => {
                  const inCart = cart.find((c) => c.catalogItemId === item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleAddCatalogItem(item)}
                      disabled={!currentShift}
                      className={cn(
                        "group relative flex flex-col gap-2 rounded-xl border p-2.5 text-left transition-all duration-100 active:scale-[0.97]",
                        inCart
                          ? "border-[color-mix(in_srgb,var(--action-primary-bg)_50%,var(--border-default))] bg-[color-mix(in_srgb,var(--action-primary-bg)_3%,var(--surface-base))]"
                          : "border-[var(--border-default)] bg-[var(--surface-base)]",
                      )}
                    >
                      {item.imageUrl ? (
                        <div className="flex h-20 w-full items-center justify-center overflow-hidden rounded-lg bg-[var(--surface-muted)]">
                          <Image src={item.imageUrl} alt={item.name} width={80} height={80} className="h-full w-full object-cover" unoptimized />
                        </div>
                      ) : (
                        <div className="flex h-20 w-full items-center justify-center rounded-lg bg-[var(--surface-muted)]">
                          <Package className="h-8 w-8 text-[var(--text-muted)]" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="line-clamp-2 text-xs font-semibold leading-tight text-[var(--text-strong)]">
                          {item.name}
                        </div>
                        <div className="mt-1 font-mono text-sm font-bold text-[var(--text-strong)]">
                          {money(item.unitPrice)}
                        </div>
                      </div>
                      {inCart ? (
                        <div className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--action-primary-bg)] px-1 text-[10px] font-black text-white">
                          {inCart.quantity % 1 === 0 ? inCart.quantity : inCart.quantity.toFixed(1)}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile cart FAB */}
      <button
        type="button"
        aria-label="Open the cart"
        onClick={() => setMobileCartOpen(true)}
        className="fixed right-4 bottom-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--action-primary-bg)] text-white shadow-lg transition-transform active:scale-95 md:hidden"
      >
        <Wallet className="h-6 w-6" />
        {cart.length > 0 ? (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {cart.length}
          </span>
        ) : null}
      </button>

      {/* Mobile cart + payment sheet */}
      <Sheet open={mobileCartOpen} onOpenChange={setMobileCartOpen}>
        {/* Portalled out of the terminal, so it carries the terminal's tokens (the tender colours) itself. */}
        <SheetContent side="bottom" size="lg" className="pos-terminal h-[92dvh] p-0">
          <div className="flex h-full flex-col">
            <SheetHeader className="shrink-0 border-b border-[var(--edge-subtle)] px-4 py-3">
              <SheetTitle className="flex items-center justify-between">
                <span>Cart</span>
                {cart.length > 0 ? (
                  <span className="rounded-full bg-[var(--action-primary-bg)] px-2 py-0.5 text-xs font-bold text-white">
                    {cart.length}
                  </span>
                ) : null}
              </SheetTitle>
            </SheetHeader>

            {/* Cart items */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-muted)]">
                    <Payments className="h-6 w-6 text-[var(--text-muted)]" />
                  </div>
                  <p className="text-sm font-medium text-[var(--text-muted)]">No products yet</p>
                </div>
              ) : (
                <div className="divide-y divide-[var(--edge-subtle)]">
                  {cart.map((item) => (
                    <div key={item.catalogItemId} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-[var(--text-strong)]">{item.name}</div>
                        <div className="text-xs text-[var(--text-muted)]">{money(item.unitPrice)} × {item.quantity}</div>
                      </div>
                      <div className="font-mono text-sm font-bold">{money(item.quantity * item.unitPrice - (item.lineDiscountAmount ?? 0))}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Payment summary */}
            {cart.length > 0 ? (
              <div className="shrink-0 border-t border-[var(--edge-subtle)] bg-[var(--surface-base)] p-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Total</span>
                  <span className="font-mono text-2xl font-black text-[var(--text-strong)]">{money(total)}</span>
                </div>

                {/* Tender buttons */}
                {/* Every tender the shop takes; the grid wraps. */}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {tenderOptions.map((option) => {
                    const type = option.tender as TenderType;
                    const tKey = TENDER_TOKEN_KEYS[type];
                    const isSelected = payments[0] ? isTender(payments[0], option) : false;
                    const currency = option.currency ?? undefined;
                    return (
                      <button
                        key={`${option.tender}:${option.currency ?? ""}`}
                        type="button"
                        onClick={() => {
                          setPayments([{ tenderType: type, currency, amount: dueIn(total, currency, zigRate), reference: "" }]);
                          setActiveTarget({ type: "tender_amount", index: 0 });
                        }}
                        className="flex h-14 items-center justify-center gap-2 rounded-xl border font-semibold transition-all duration-75 active:translate-y-[2px] active:shadow-none"
                        style={
                          isSelected
                            ? { background: `var(--pos-tender-${tKey}-bg)`, borderColor: `var(--pos-tender-${tKey}-bg)`, boxShadow: `0 3px 0 var(--pos-tender-${tKey}-shadow)`, color: "#ffffff" }
                            : { background: "var(--pos-tender-idle-bg)", borderColor: "var(--pos-tender-idle-border)", boxShadow: "0 3px 0 var(--pos-tender-idle-shadow)", color: "var(--pos-tender-idle-text)" }
                        }
                      >
                        <TenderIcon type={type} />
                        <span className="text-sm">{option.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Charge button */}
                <button
                  type="button"
                  onClick={() => { setMobileCartOpen(false); handleCharge(); }}
                  disabled={postSalePending || total <= 0 || cart.length === 0}
                  className={cn(
                    "mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-black text-white transition-all duration-150 active:scale-[0.98]",
                    postSalePending || total <= 0 || cart.length === 0
                      ? "bg-[var(--text-muted)] opacity-60"
                      : "bg-[var(--action-primary-bg)] shadow-[0_8px_24px_rgba(0,0,0,0.18)] hover:shadow-[0_12px_32px_rgba(0,0,0,0.22)]",
                  )}
                >
                  {postSalePending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Zap className="h-5 w-5" />
                  )}
                  {postSalePending ? "Charging…" : `Charge ${money(total)}`}
                </button>
              </div>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      {/* ════════════════════════════════════════════════════
         DIALOGS & SHEETS
         ════════════════════════════════════════════════════ */}

      {/* ── Customer sheet ──────────────────────────────── */}
      <Sheet open={customerSheetOpen} onOpenChange={setCustomerSheetOpen}>
        <SheetContent
          side="right"
          size="md"
          tabletBehavior="bottom"
          aria-describedby={undefined}
          className="w-full max-w-[32rem] p-0"
        >
          <div className="flex h-full flex-col p-5 sm:p-6">
            <SheetHeader className="border-b border-[var(--border-subtle)] pb-4 pr-10">
              <SheetTitle className="flex items-center gap-2">
                <Users className="h-4 w-4 text-[var(--text-muted)]" />
                Customer
              </SheetTitle>
            </SheetHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4 pr-1">
              {/* Search */}
              <div className="flex items-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-muted)] px-3 py-2 transition-all focus-within:ring-2 focus-within:ring-[var(--action-primary-bg)] focus-within:ring-offset-1">
                <Search className="h-4 w-4 text-[var(--text-muted)]" />
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Name, phone or email"
                  aria-label="Search the customers"
                  className="h-8 border-none bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                />
              </div>

              {/* Attached banner */}
              {selectedCustomer ? (
                <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <div>
                    <div className="text-sm font-bold text-[var(--text-strong)]">{selectedCustomer.name}</div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {selectedCustomer.phone || selectedCustomer.email || "Not on file"}
                    </div>
                  </div>
                  <PosStatusPill tone="neutral">
                    {selectedCustomer.loyaltyPoints} points
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
                    <p className="py-4 text-center text-sm text-[var(--text-muted)]">No customers match that search</p>
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
                              {c.phone || c.email || "Not on file"}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[var(--text-muted)]">{c.loyaltyPoints} points</span>
                          <ArrowRight className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                        </div>
                      </button>
                    ))
                  )}
                </div>
              ) : null}

              {/* Save new customer */}
              <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-muted)] p-4">
                <div className="text-sm font-bold text-[var(--text-strong)]">New customer</div>
                <div className="mt-3 grid gap-2">
                  <Input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Full name"
                    aria-label="Full name"
                    className="h-9 bg-[var(--surface-base)] text-sm"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="Phone"
                      aria-label="Phone"
                      className="h-9 bg-[var(--surface-base)] text-sm"
                    />
                    <Input
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="Email"
                      aria-label="Email"
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
                Create customer
              </Button>
            </SheetFooter>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Adjustments dialog ──────────────────────────── */}
      <Dialog open={adjustmentsOpen} onOpenChange={setAdjustmentsOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Discount</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            {/* Order discount */}
            <div>
              <label className="text-xs font-bold text-[var(--text-muted)]">Sale discount</label>
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
                  aria-label="Override reason"
                  className="mt-1.5 h-9 text-sm"
                />
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
            <Button onClick={() => setAdjustmentsOpen(false)}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Hold dialog ─────────────────────────────────── */}
      <Dialog open={holdDialog} onOpenChange={setHoldDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Hold the sale</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 py-1">
            <label htmlFor="pos-hold-label" className="text-xs font-bold text-[var(--text-muted)]">
              Name (optional)
            </label>
            <Input
              id="pos-hold-label"
              value={holdLabel}
              onChange={(e) => setHoldLabel(e.target.value)}
              placeholder="Table 4"
              className="h-9"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHoldDialog(false)}>Cancel</Button>
            <Button onClick={() => holdCartMutation.mutate()} disabled={holdCartMutation.isPending}>
              {holdCartMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ReceiptLong className="h-4 w-4" />}
              Hold the sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Line editor sheet ───────────────────────────── */}
      <Sheet open={Boolean(selectedLine)} onOpenChange={(open) => !open && (setSelectedLineId(null), setActiveTarget(null))}>
        <SheetContent side="bottom" aria-describedby={undefined} className="h-auto max-h-[40vh] p-0">
          <div className="flex flex-col p-4 sm:p-5">
            <SheetHeader className="pb-3">
              <div className="flex items-center justify-between">
                <SheetTitle className="text-base">{selectedLine?.name}</SheetTitle>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => { setSelectedLineId(null); setActiveTarget(null); }}
                  className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-strong)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </SheetHeader>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <NumField
                label="Quantity"
                value={String(selectedLine?.quantity ?? 0)}
                active={activeTarget?.type === "line_qty" && activeTarget.lineId === selectedLine?.catalogItemId}
                onActivate={() => setActiveTarget({ type: "line_qty", lineId: selectedLine?.catalogItemId ?? "" })}
              />
              <NumField
                label="Price"
                value={String(selectedLine?.unitPrice ?? 0)}
                active={activeTarget?.type === "line_price" && activeTarget.lineId === selectedLine?.catalogItemId}
                onActivate={() => setActiveTarget({ type: "line_price", lineId: selectedLine?.catalogItemId ?? "" })}
              />
              <NumField
                label="Discount"
                value={String(selectedLine?.lineDiscountAmount ?? 0)}
                active={activeTarget?.type === "line_discount" && activeTarget.lineId === selectedLine?.catalogItemId}
                onActivate={() => setActiveTarget({ type: "line_discount", lineId: selectedLine?.catalogItemId ?? "" })}
              />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Sale completed ──────────────────────────────── */}
      <Dialog open={Boolean(lastCompletedSale)} onOpenChange={(open) => !open && dismissCompletedSale()}>
        <DialogContent data-testid="pos-sale-complete" className="sm:max-w-[22rem] p-0 overflow-hidden">
          {/* Change amount — the MOST important thing a cashier needs */}
          {completedUsd > 0 || completedZig > 0 ? (
            <div className="bg-gradient-to-br from-emerald-600 via-emerald-500 to-emerald-600 px-6 pt-8 pb-7 text-center text-white">
              <div className="text-[11px] font-bold text-emerald-200">
                Change due
              </div>
              <div className="mt-1 font-mono text-[4.5rem] font-black leading-none tracking-tight">
                {completedUsd > 0 ? money(completedUsd) : zigWords(completedZig)}
              </div>
              {completedUsd > 0 && completedZig > 0 ? (
                <div className="mt-2 font-mono text-2xl font-black">and {zigWords(completedZig)}</div>
              ) : null}
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold text-emerald-100">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {lastCompletedSale?.saleNo}
              </div>
            </div>
          ) : (
            <div className="bg-gradient-to-br from-emerald-600 to-emerald-500 px-6 pt-7 pb-6 text-center text-white">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/20 ring-4 ring-white/25">
                <CheckCircle2 className="h-6 w-6 text-white" />
              </div>
              <div className="text-[11px] font-bold text-emerald-100">
                Sale complete
              </div>
              <div className="mt-0.5 font-mono text-lg font-black">
                {lastCompletedSale?.saleNo}
              </div>
              <div className="mt-1 font-mono text-2xl font-black text-white/90">
                {money(Number(lastCompletedSale?.totalAmount ?? 0) + Number(lastCompletedSale?.depositAmount ?? 0))}
              </div>
            </div>
          )}

          {/* Secondary info */}
          <div className="px-5 py-4 space-y-3">
            {/*
              Where the sale stands with ZIMRA, decided when it was posted. A
              fiscalised sale shows its number; a sale the shop does not
              fiscalise (SKIPPED, or no answer at all) draws nothing.
            */}
            {lastCompletedSale?.fiscal && lastCompletedSale.fiscal.status !== "SKIPPED" ? (
              <div
                data-testid="pos-sale-fiscal"
                className="flex items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-sm"
                style={
                  lastCompletedSale.fiscal.status === "FAILED"
                    ? {
                        background: "var(--pos-status-warning-bg)",
                        color: "var(--pos-status-warning-text)",
                      }
                    : { background: "var(--surface-muted)", color: "var(--text-muted)" }
                }
              >
                <span className="font-semibold">
                  {fiscalStatusLabel(lastCompletedSale.fiscal.status)}
                </span>
                {lastCompletedSale.fiscal.status === "SUCCESS" &&
                lastCompletedSale.fiscal.fiscalNumber ? (
                  <span className="truncate font-mono text-[13px] font-bold text-[var(--text-strong)]">
                    {lastCompletedSale.fiscal.fiscalNumber}
                  </span>
                ) : null}
              </div>
            ) : null}
            <div className="flex items-center justify-between rounded-xl bg-[var(--surface-muted)] px-4 py-3">
              <div>
                <div className="text-[11px] text-[var(--text-muted)]">Total charged</div>
                <div className="font-mono text-base font-black text-[var(--text-strong)]">
                  {money(Number(lastCompletedSale?.totalAmount ?? 0) + Number(lastCompletedSale?.depositAmount ?? 0))}
                </div>
                {Number(lastCompletedSale?.depositAmount ?? 0) > 0 ? (
                  <div className="text-[11px] text-[var(--text-muted)]">
                    including bottle deposits{" "}
                    <span className="font-mono">{money(Number(lastCompletedSale?.depositAmount))}</span>
                  </div>
                ) : null}
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

          <DialogFooter className="px-5 pb-5 gap-2">
            <Button variant="outline" size="sm" onClick={dismissCompletedSale} className="flex-1 h-11 text-sm font-semibold">
              Next sale
            </Button>
            <Button size="sm" className="flex-1 h-11 text-sm font-semibold" asChild>
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
