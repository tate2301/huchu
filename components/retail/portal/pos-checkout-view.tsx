"use client";

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
} from "@/lib/icons";
import { getPosPortalHref } from "@/lib/retail/pos-host";
import { PosFocusedEditorDrawer } from "./pos-focused-editor-drawer";
import { PosInlineValidationBanner } from "./pos-inline-validation-banner";
import { PosNumericField } from "./pos-numeric-field";
import { PosNumericKeypad } from "./pos-numeric-keypad";
import { applyPosKeypadAction, type PosKeypadAction } from "./pos-numeric-input";
import {
  PosEmptyState,
  PosMetricCard,
  PosPanel,
  PosPanelHeader,
  PosStatusPill,
} from "./pos-primitives";
import { usePosPortalState } from "./pos-portal-state";
import type { PaymentRow, TenderType } from "./pos-types";
import { money } from "./pos-utils";

type CheckoutNumericTarget =
  | { type: "line_qty"; lineId: string }
  | { type: "line_price"; lineId: string }
  | { type: "line_discount"; lineId: string }
  | { type: "order_discount" }
  | { type: "tender_amount"; index: number }
  | { type: "redeem_points" };

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

export function PosCheckoutView() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { tenantKey } = useOfflineRuntime();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [holdDialog, setHoldDialog] = useState(false);
  const [holdLabel, setHoldLabel] = useState("");
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [activeTarget, setActiveTarget] = useState<CheckoutNumericTarget | null>(null);
  const [customerSheetOpen, setCustomerSheetOpen] = useState(false);

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
    queuedOfflineSales,
    retryOfflineSale,
    removeOfflineSale,
    syncOfflineSales,
    syncOfflineSalesPending,
    requiredReferenceTenders,
    minReferenceLength,
    lastCompletedSale,
    dismissCompletedSale,
  } = usePosPortalState();

  const selectedLine = useMemo(
    () => cart.find((line) => line.catalogItemId === selectedLineId) ?? null,
    [cart, selectedLineId],
  );

  const focusSearchInput = () => {
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  };

  const handleAddCatalogItem = (item: (typeof catalogItems)[number]) => {
    addToCart(item);
    setSearch("");
    focusSearchInput();
  };

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

  const hasMissingRequiredReference = payments.some(
    (payment) =>
      requiresReference(payment.tenderType, requiredReferenceTenders) &&
      payment.amount.trim() !== "" &&
      payment.reference.trim().length < minReferenceLength,
  );

  const selectedCustomer =
    customerSearchResults.find((customer) => customer.id === selectedCustomerId) ?? null;

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
    return [
      { label: `Due ${money(total)}`, value: exact },
      { label: `Round ${money(Number(round5))}`, value: round5 },
      { label: `Round ${money(Number(round10))}`, value: round10 },
    ];
  }, [total]);

  const activeTargetLabel = (() => {
    if (!activeTarget) return "Tap a field to use the keypad";
    if (activeTarget.type === "order_discount") return "Editing order discount";
    if (activeTarget.type === "redeem_points") return "Editing loyalty points";
    if (activeTarget.type === "tender_amount") {
      return `Editing ${tenderLabel(
        payments[activeTarget.index]?.tenderType ?? "CASH",
      )} amount`;
    }
    if (activeTarget.type === "line_qty") return "Editing quantity";
    if (activeTarget.type === "line_price") return "Editing unit price";
    return "Editing line discount";
  })();

  const selectedPromotion =
    promotions.find((promotion) => promotion.id === selectedPromotionId) ?? null;
  const lineCountLabel = `${cart.length} line${cart.length === 1 ? "" : "s"}`;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PosPanel>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              Counter checkout
            </p>
            <h1 className="mt-1 text-[1.8rem] font-semibold tracking-[-0.04em] text-[var(--text-strong)]">
              Sell fast, fix exceptions later
            </h1>
            <p className="mt-2 max-w-[58ch] text-sm leading-6 text-[var(--text-muted)]">
              Keep the cashier focused on item lookup, cart review, and payment.
              Customer lookup, held carts, and sync issues stay close, but out of
              the way.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {currentShift ? (
              <>
                <Button variant="outline" className="min-h-11" asChild>
                  <Link href={getPosPortalHref("held", isPosHost)}>
                    <ReceiptLong className="h-4 w-4" />
                    Held carts
                  </Link>
                </Button>
                <Button
                  className="min-h-11"
                  onClick={() => setHoldDialog(true)}
                  disabled={cart.length === 0}
                >
                  Hold current sale
                </Button>
              </>
            ) : (
              <Button className="min-h-11" asChild>
                <Link href={getPosPortalHref("shift", isPosHost)}>Open shift</Link>
              </Button>
            )}
          </div>
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-4">
          <PosMetricCard
            icon={Clock}
            label="Shift"
            value={currentShift ? currentShift.shiftNo : "No open shift"}
            meta={
              currentShift
                ? `${currentShift.site?.name ?? "Site"} / ${currentShift.registerName}`
                : "Open a drawer before selling"
            }
            tone={currentShift ? "brand" : "warning"}
          />
          <PosMetricCard
            icon={Package}
            label="Basket"
            value={lineCountLabel}
            meta={
              cart.length > 0
                ? `${cart.reduce((sum, item) => sum + item.quantity, 0).toFixed(2)} units in cart`
                : "Scan or search to start"
            }
            tone={cart.length > 0 ? "success" : "neutral"}
          />
          <PosMetricCard
            icon={Wallet}
            label="Amount due"
            value={money(total)}
            meta={
              discountAmount > 0
                ? `${money(discountAmount)} discount applied`
                : "No sale discounts yet"
            }
            tone={total > 0 ? "brand" : "neutral"}
          />
          <PosMetricCard
            icon={Payments}
            label="Offline queue"
            value={String(pendingOfflineSales)}
            meta={
              pendingOfflineSales > 0
                ? "Queued sales need sync"
                : "All offline sales are synced"
            }
            tone={pendingOfflineSales > 0 ? "warning" : "success"}
          />
        </div>
      </PosPanel>

      {pendingOfflineSales > 0 ? (
        <PosPanel className="border-amber-200 bg-[color-mix(in_srgb,var(--status-warning-bg)_88%,white)]">
          <PosPanelHeader
            eyebrow="Offline"
            title="Queued sales are waiting to sync"
            description="Keep selling. Retry or clean up the queue without blocking the active checkout."
            actions={
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={syncOfflineSales}
                disabled={syncOfflineSalesPending}
              >
                <RefreshCcw className="h-4 w-4" />
                Sync now
              </Button>
            }
          />
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {queuedOfflineSales.slice(0, 4).map((entry) => (
              <div
                key={entry.operationId}
                className="rounded-[1.15rem] border border-amber-200 bg-white/80 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-sm font-semibold text-[var(--text-strong)]">
                      {entry.payload.saleNo}
                    </div>
                    <div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-amber-900/80">
                      {entry.status} / retry {entry.retryCount}
                    </div>
                  </div>
                  <PosStatusPill tone="warning">Queued</PosStatusPill>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-10 flex-1"
                    onClick={() => retryOfflineSale(entry.operationId)}
                    disabled={syncOfflineSalesPending}
                  >
                    Retry
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-10"
                    onClick={() => removeOfflineSale(entry.operationId)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </PosPanel>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.95fr)_minmax(320px,0.9fr)]">
        <PosPanel className="flex min-h-0 flex-col">
          <PosPanelHeader
            eyebrow="Find items"
            title="Search or scan"
            description="The fastest path stays first: scan a barcode, hit Enter, and keep moving."
            actions={
              selectedPromotion ? (
                <PosStatusPill tone="brand">
                  Promo: {selectedPromotion.name}
                </PosStatusPill>
              ) : null
            }
          />

          <div className="rounded-[1.25rem] border border-[var(--border-default)] bg-[var(--surface-muted)] p-3">
            <div className="flex items-center gap-3 rounded-[1rem] border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--action-primary-bg)]">
                <Search className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  <QrCode className="h-4 w-4" />
                  Scanner-ready lookup
                </div>
                <Input
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
                  placeholder="Scan barcode or search item"
                  className="mt-1 h-11 border-none bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
                />
              </div>
              <div className="hidden rounded-full bg-[var(--surface-muted)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)] md:block">
                Enter adds top match
              </div>
            </div>

            {promotions.length > 0 ? (
              <div className="mt-3 flex gap-2 overflow-auto pb-1">
                <button
                  type="button"
                  onClick={() => setSelectedPromotionId("")}
                  className={
                    selectedPromotionId
                      ? "rounded-full border border-[var(--border-default)] bg-white px-3 py-2 text-xs font-medium text-[var(--text-muted)]"
                      : "rounded-full border border-[var(--action-primary-bg)] bg-[var(--action-primary-bg)] px-3 py-2 text-xs font-semibold text-white"
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
                        ? "rounded-full border border-[var(--action-primary-bg)] bg-[var(--action-primary-bg)] px-3 py-2 text-xs font-semibold text-white"
                        : "rounded-full border border-[var(--border-default)] bg-white px-3 py-2 text-xs font-medium text-[var(--text-muted)]"
                    }
                  >
                    {promotion.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
            {!currentShift ? (
              <PosEmptyState
                icon={Clock}
                title="Open a shift before selling"
                description="Catalog search and checkout stay disabled until this register has an open shift."
                action={
                  <Button asChild>
                    <Link href={getPosPortalHref("shift", isPosHost)}>
                      Open shift
                    </Link>
                  </Button>
                }
              />
            ) : catalogLoading ? (
              <PosEmptyState
                icon={RefreshCcw}
                title="Loading catalog"
                description="We're getting your sellable items ready for this register."
              />
            ) : catalogItems.length === 0 ? (
              <PosEmptyState
                icon={Package}
                title="No items match this search"
                description="Try a barcode, SKU, or a shorter product name to pull items into the sale quickly."
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {catalogItems.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleAddCatalogItem(item)}
                    disabled={!currentShift}
                    className="group rounded-[1.3rem] border border-[var(--border-default)] bg-[var(--surface-muted)] p-4 text-left transition duration-150 hover:-translate-y-[1px] hover:border-[color-mix(in_srgb,var(--action-primary-bg)_25%,var(--border-default))] hover:bg-white disabled:opacity-60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                          Match {index + 1}
                        </div>
                        <div className="mt-1 line-clamp-2 text-base font-semibold leading-6 text-[var(--text-strong)]">
                          {item.name}
                        </div>
                      </div>
                      <div className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--action-primary-bg)] shadow-[0_8px_18px_rgba(15,23,42,0.05)] group-hover:bg-[var(--action-primary-bg)] group-hover:text-white">
                        Add
                      </div>
                    </div>
                    <div className="mt-4 flex items-end justify-between gap-3">
                      <div>
                        <div className="font-mono text-lg font-semibold text-[var(--text-strong)]">
                          {money(item.unitPrice)}
                        </div>
                        <div className="mt-1 font-mono text-[11px] text-[var(--text-muted)]">
                          {item.barcode || item.sku}
                        </div>
                      </div>
                      <div className="text-right text-xs leading-5 text-[var(--text-muted)]">
                        {item.inventoryItem
                          ? `${item.inventoryItem.currentStock.toFixed(2)} ${item.inventoryItem.unit}`
                          : "No stock"}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </PosPanel>

        <PosPanel className="flex min-h-0 flex-col">
          <PosPanelHeader
            eyebrow="Current sale"
            title="Cart review"
            description="Tap any line to change quantity, price, or discount without losing checkout pace."
            actions={
              cart.length > 0 ? (
                <Button variant="outline" size="sm" onClick={clearCart}>
                  Clear cart
                </Button>
              ) : null
            }
          />

          {selectedCustomer ? (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-[1.15rem] border border-[color-mix(in_srgb,var(--action-primary-bg)_15%,var(--border-default))] bg-[color-mix(in_srgb,var(--action-primary-bg)_6%,white)] px-3 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--action-primary-bg)]">
                  <User className="h-4 w-4" />
                  Attached customer
                </div>
                <div className="mt-1 truncate text-sm font-semibold text-[var(--text-strong)]">
                  {selectedCustomer.name}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCustomerSheetOpen(true)}
              >
                Change
              </Button>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {cart.length === 0 ? (
              <PosEmptyState
                icon={Package}
                title="Cart is empty"
                description="Scan or search for items on the left. As soon as something lands here, the payment lane will be ready."
              />
            ) : (
              <div className="space-y-3">
                {cart.map((item) => {
                  const isSelected = selectedLineId === item.catalogItemId;
                  return (
                    <button
                      key={item.catalogItemId}
                      type="button"
                      onClick={() => {
                        setSelectedLineId(item.catalogItemId);
                        setActiveTarget({
                          type: "line_qty",
                          lineId: item.catalogItemId,
                        });
                      }}
                      className={
                        isSelected
                          ? "w-full rounded-[1.3rem] border border-[var(--action-primary-bg)] bg-[color-mix(in_srgb,var(--action-primary-bg)_6%,white)] p-4 text-left shadow-[0_10px_24px_rgba(37,99,235,0.08)]"
                          : "w-full rounded-[1.3rem] border border-[var(--border-default)] bg-[var(--surface-muted)] p-4 text-left"
                      }
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-base font-semibold text-[var(--text-strong)]">
                            {item.name}
                          </div>
                          <div className="mt-1 font-mono text-xs text-[var(--text-muted)]">
                            {item.quantity.toFixed(2)} x {money(item.unitPrice)}
                          </div>
                          {item.lineDiscountAmount ? (
                            <div className="mt-2">
                              <PosStatusPill tone="success">
                                Line discount {money(item.lineDiscountAmount)}
                              </PosStatusPill>
                            </div>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <div className="font-mono text-base font-semibold text-[var(--text-strong)]">
                              {money(
                                item.quantity * item.unitPrice -
                                  (item.lineDiscountAmount ?? 0),
                              )}
                            </div>
                            <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                              Tap to edit
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="min-h-11 min-w-11"
                            onClick={(event) => {
                              event.stopPropagation();
                              removeFromCart(item.catalogItemId);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[1.15rem] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Subtotal
              </div>
              <div className="mt-2 font-mono text-lg font-semibold text-[var(--text-strong)]">
                {money(subtotal)}
              </div>
            </div>
            <div className="rounded-[1.15rem] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Discount
              </div>
              <div className="mt-2 font-mono text-lg font-semibold text-[var(--text-strong)]">
                {money(discountAmount)}
              </div>
            </div>
            <div className="rounded-[1.15rem] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Tax
              </div>
              <div className="mt-2 font-mono text-lg font-semibold text-[var(--text-strong)]">
                {money(taxAmount)}
              </div>
            </div>
          </div>

          <PosFocusedEditorDrawer
            open={Boolean(selectedLine)}
            title={selectedLine?.name ?? "Line editor"}
            onClose={() => {
              setSelectedLineId(null);
              setActiveTarget(null);
            }}
          >
            {selectedLine ? (
              <div className="grid gap-2">
                <PosNumericField
                  label="Quantity"
                  value={String(selectedLine.quantity)}
                  active={
                    activeTarget?.type === "line_qty" &&
                    activeTarget.lineId === selectedLine.catalogItemId
                  }
                  onActivate={() =>
                    setActiveTarget({
                      type: "line_qty",
                      lineId: selectedLine.catalogItemId,
                    })
                  }
                />
                <PosNumericField
                  label="Unit price"
                  value={String(selectedLine.unitPrice)}
                  active={
                    activeTarget?.type === "line_price" &&
                    activeTarget.lineId === selectedLine.catalogItemId
                  }
                  onActivate={() =>
                    setActiveTarget({
                      type: "line_price",
                      lineId: selectedLine.catalogItemId,
                    })
                  }
                />
                <PosNumericField
                  label="Line discount"
                  value={String(selectedLine.lineDiscountAmount ?? 0)}
                  active={
                    activeTarget?.type === "line_discount" &&
                    activeTarget.lineId === selectedLine.catalogItemId
                  }
                  onActivate={() =>
                    setActiveTarget({
                      type: "line_discount",
                      lineId: selectedLine.catalogItemId,
                    })
                  }
                />
              </div>
            ) : null}
          </PosFocusedEditorDrawer>
        </PosPanel>

        <PosPanel className="flex min-h-0 flex-col">
          <PosPanelHeader
            eyebrow="Collect payment"
            title="Finish sale"
            description="Customer lookup, order adjustments, tenders, and the pay action all stay in one final lane."
            actions={
              selectedCustomer ? (
                <PosStatusPill tone="success">
                  {selectedCustomer.loyaltyPoints} pts
                </PosStatusPill>
              ) : (
                <PosStatusPill tone="neutral">Walk-in</PosStatusPill>
              )
            }
          />

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="space-y-4">
              <div className="rounded-[1.25rem] border border-[var(--border-default)] bg-[var(--surface-muted)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                      Customer
                    </div>
                    <div className="mt-1 text-sm font-semibold text-[var(--text-strong)]">
                      {selectedCustomer?.name ||
                        (customerName.trim() ? customerName : "Walk-in")}
                    </div>
                    <div className="mt-1 text-xs text-[var(--text-muted)]">
                      {selectedCustomer
                        ? "Attached to this sale"
                        : "Attach a customer only if it helps complete this sale faster"}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={() => setCustomerSheetOpen(true)}
                  >
                    <Users className="h-4 w-4" />
                    {selectedCustomer ? "Change" : "Attach customer"}
                  </Button>
                </div>
              </div>

              <div className="rounded-[1.25rem] border border-[var(--border-default)] bg-[var(--surface-muted)] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Sale total
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div>
                    <div className="font-mono text-[2rem] font-semibold tracking-[-0.04em] text-[var(--text-strong)]">
                      {money(total)}
                    </div>
                    <div className="mt-1 text-xs text-[var(--text-muted)]">
                      {lineCountLabel} · {money(subtotal)} before tax and discounts
                    </div>
                  </div>
                  <Sparkles className="h-8 w-8 text-[var(--action-primary-bg)]" />
                </div>
                <div className="mt-4 grid gap-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[var(--text-muted)]">Subtotal</span>
                    <span className="font-mono text-[var(--text-strong)]">
                      {money(subtotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[var(--text-muted)]">Discounts</span>
                    <span className="font-mono text-[var(--text-strong)]">
                      {money(discountAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[var(--text-muted)]">Tax</span>
                    <span className="font-mono text-[var(--text-strong)]">
                      {money(taxAmount)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-[1.25rem] border border-[var(--border-default)] bg-[var(--surface-muted)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                      Adjustments
                    </div>
                    <div className="mt-1 text-sm font-semibold text-[var(--text-strong)]">
                      Keep overrides explicit
                    </div>
                  </div>
                  {canOverride ? (
                    <PosStatusPill tone="warning">Override allowed</PosStatusPill>
                  ) : null}
                </div>
                <PosNumericField
                  label="Order discount"
                  value={orderDiscountAmount}
                  active={activeTarget?.type === "order_discount"}
                  onActivate={() => setActiveTarget({ type: "order_discount" })}
                />
                {selectedCustomer ? (
                  <PosNumericField
                    label={`Redeem points (${selectedCustomer.loyaltyPoints} available)`}
                    value={loyaltyRedemptionPoints}
                    active={activeTarget?.type === "redeem_points"}
                    onActivate={() => setActiveTarget({ type: "redeem_points" })}
                  />
                ) : null}
                {canOverride ? (
                  <Input
                    value={overrideReason}
                    onChange={(event) => setOverrideReason(event.target.value)}
                    className="h-11 bg-white"
                    placeholder="Override reason"
                  />
                ) : null}
              </div>

              <div className="space-y-3 rounded-[1.25rem] border border-[var(--border-default)] bg-[var(--surface-muted)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                      Tender
                    </div>
                    <div className="mt-1 text-sm font-semibold text-[var(--text-strong)]">
                      Collect payment without leaving the lane
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setSplitTenderMode(!splitTenderMode)}
                  >
                    {splitTenderMode ? "Single tender" : "Split tender"}
                  </Button>
                </div>

                {payments.map((payment, index) => (
                  <div
                    key={`${payment.tenderType}-${index}`}
                    className="rounded-[1.1rem] border border-[var(--border-subtle)] bg-white p-3 shadow-[0_8px_20px_rgba(15,23,42,0.04)]"
                  >
                    <div className="grid gap-3">
                      <Select
                        value={payment.tenderType}
                        onValueChange={(value) =>
                          updatePayment(index, { tenderType: value as TenderType })
                        }
                      >
                        <SelectTrigger className="h-11 bg-[var(--surface-base)]">
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
                          activeTarget?.type === "tender_amount" &&
                          activeTarget.index === index
                        }
                        onActivate={() =>
                          setActiveTarget({ type: "tender_amount", index })
                        }
                      />
                      <Input
                        value={payment.reference}
                        onChange={(event) =>
                          updatePayment(index, { reference: event.target.value })
                        }
                        placeholder={
                          requiresReference(
                            payment.tenderType,
                            requiredReferenceTenders,
                          )
                            ? `Reference (min ${minReferenceLength})`
                            : "Reference"
                        }
                        className="h-11 bg-[var(--surface-base)]"
                      />
                      {splitTenderMode && payments.length > 1 ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-10"
                          onClick={() =>
                            setPayments((current) =>
                              current.filter(
                                (_, paymentIndex) => paymentIndex !== index,
                              ),
                            )
                          }
                        >
                          Remove tender
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}

                {splitTenderMode ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 w-full"
                    onClick={addPaymentRow}
                  >
                    Add tender
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-3 border-t border-[var(--border-subtle)] pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.15rem] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Tendered
                </div>
                <div className="mt-2 font-mono text-lg font-semibold text-[var(--text-strong)]">
                  {money(tenderedTotal)}
                </div>
              </div>
              <div className="rounded-[1.15rem] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Change
                </div>
                <div className="mt-2 font-mono text-lg font-semibold text-[var(--text-strong)]">
                  {money(changeAmount)}
                </div>
              </div>
            </div>
            <div className="rounded-[1.15rem] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Keypad focus
              </div>
              <div className="mt-1 text-sm font-medium text-[var(--text-strong)]">
                {activeTargetLabel}
              </div>
            </div>
            <PosInlineValidationBanner messages={blockers} />
            <Button
              className="h-14 text-base font-semibold"
              onClick={handleCharge}
              disabled={postSalePending}
            >
              <Wallet className="h-4 w-4" />
              Charge {money(total)}
            </Button>
            <PosNumericKeypad
              title="Numeric keypad"
              onAction={handleKeypadAction}
              presets={keypadPresets}
            />
          </div>
        </PosPanel>
      </div>

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
                Customer utility
              </div>
              <SheetTitle>Attach customer</SheetTitle>
              <SheetDescription>
                Search by name, phone, or email, or save a new customer without
                leaving checkout.
              </SheetDescription>
              <p className="text-sm leading-6 text-[var(--text-muted)]">
                Search by name, phone, or email. If there is no match, save a new
                customer and get back to payment.
              </p>
            </SheetHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-5 pr-1">
              <div className="rounded-[1.2rem] border border-[var(--border-default)] bg-[var(--surface-muted)] p-3">
                <div className="flex items-center gap-3 rounded-[1rem] border border-[var(--border-subtle)] bg-white px-3 py-3">
                  <Search className="h-5 w-5 text-[var(--text-muted)]" />
                  <Input
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    placeholder="Search by name, phone, or email"
                    className="h-10 border-none bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-10"
                    onClick={() => {
                      setCustomerName("Walk-in");
                      setCustomerPhone("");
                      setCustomerEmail("");
                      setCustomerSheetOpen(false);
                    }}
                  >
                    Walk-in
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-10"
                    onClick={() => {
                      setCustomerName("");
                      setCustomerPhone("");
                      setCustomerEmail("");
                    }}
                  >
                    Clear fields
                  </Button>
                </div>
              </div>

              {selectedCustomer ? (
                <div className="rounded-[1.2rem] border border-[color-mix(in_srgb,var(--status-success-border)_80%,white)] bg-[color-mix(in_srgb,var(--status-success-bg)_72%,white)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--status-success-text)]">
                        Attached now
                      </div>
                      <div className="mt-1 text-base font-semibold text-[var(--text-strong)]">
                        {selectedCustomer.name}
                      </div>
                      <div className="mt-1 text-sm text-[var(--text-muted)]">
                        {selectedCustomer.phone ||
                          selectedCustomer.email ||
                          "Customer details ready"}
                      </div>
                    </div>
                    <PosStatusPill tone="success">
                      {selectedCustomer.loyaltyPoints} pts
                    </PosStatusPill>
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-[var(--text-strong)]">
                    Matches
                  </div>
                  {customerSearchLoading ? (
                    <PosStatusPill tone="neutral">Searching</PosStatusPill>
                  ) : null}
                </div>
                {customerName.trim().length < 2 ? (
                  <PosEmptyState
                    icon={User}
                    title="Start with a name, phone, or email"
                    description="We only search once there is enough signal to return useful customer matches."
                    className="min-h-[12rem]"
                  />
                ) : customerSearchResults.length === 0 ? (
                  <PosEmptyState
                    icon={Users}
                    title="No customer match yet"
                    description="You can continue as walk-in or save a new customer below if this sale needs one."
                    className="min-h-[12rem]"
                  />
                ) : (
                  <div className="space-y-2">
                    {customerSearchResults.slice(0, 6).map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        className="flex w-full items-center justify-between gap-3 rounded-[1.15rem] border border-[var(--border-default)] bg-[var(--surface-muted)] px-4 py-3 text-left transition hover:border-[color-mix(in_srgb,var(--action-primary-bg)_25%,var(--border-default))] hover:bg-white"
                        onClick={() => {
                          selectCustomer(customer);
                          setCustomerSheetOpen(false);
                        }}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-[var(--text-strong)]">
                            {customer.name}
                          </div>
                          <div className="mt-1 truncate text-xs text-[var(--text-muted)]">
                            {customer.phone || customer.email || "No contact details"}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <PosStatusPill tone="brand">
                            {customer.loyaltyPoints} pts
                          </PosStatusPill>
                          <ArrowRight className="h-4 w-4 text-[var(--text-muted)]" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-[1.2rem] border border-[var(--border-default)] bg-[var(--surface-muted)] p-4">
                <div className="text-sm font-semibold text-[var(--text-strong)]">
                  Save customer
                </div>
                <div className="mt-1 text-sm text-[var(--text-muted)]">
                  Save only if this sale needs a reusable customer record.
                </div>
                <div className="mt-4 grid gap-3">
                  <Input
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    placeholder="Customer name"
                    className="h-11 bg-white"
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      value={customerPhone}
                      onChange={(event) => setCustomerPhone(event.target.value)}
                      placeholder="Phone"
                      className="h-11 bg-white"
                    />
                    <Input
                      value={customerEmail}
                      onChange={(event) => setCustomerEmail(event.target.value)}
                      placeholder="Email"
                      className="h-11 bg-white"
                    />
                  </div>
                </div>
              </div>
            </div>

            <SheetFooter className="border-t border-[var(--border-subtle)] pt-4">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => setCustomerSheetOpen(false)}
              >
                Back to sale
              </Button>
              <Button
                type="button"
                className="min-h-11"
                onClick={() => createCustomerMutation.mutate()}
                disabled={!customerName.trim() || createCustomerMutation.isPending}
              >
                <Save className="h-4 w-4" />
                Save customer
              </Button>
            </SheetFooter>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={holdDialog} onOpenChange={setHoldDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hold current sale</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-[1.1rem] border border-[var(--border-default)] bg-[var(--surface-muted)] p-3 text-sm text-[var(--text-muted)]">
              Park this cart so the cashier can return to it without rebuilding the
              basket.
            </div>
            <div>
              <label className="block text-sm font-semibold text-[var(--text-strong)]">
                Label
              </label>
              <Input
                value={holdLabel}
                onChange={(event) => setHoldLabel(event.target.value)}
                placeholder="Counter pickup"
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setHoldDialog(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => holdCartMutation.mutate()}
              disabled={holdCartMutation.isPending}
            >
              Hold sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(lastCompletedSale)}
        onOpenChange={(open) => !open && dismissCompletedSale()}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Sale completed</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-[1.35rem] border border-[color-mix(in_srgb,var(--status-success-border)_80%,white)] bg-[color-mix(in_srgb,var(--status-success-bg)_78%,white)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--status-success-text)]">
                    Receipt ready
                  </div>
                  <div className="mt-2 font-mono text-xl font-semibold text-[var(--text-strong)]">
                    {lastCompletedSale?.saleNo}
                  </div>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[var(--status-success-text)] shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[1rem] bg-white/80 px-3 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    Total
                  </div>
                  <div className="mt-2 font-mono text-lg font-semibold text-[var(--text-strong)]">
                    {money(lastCompletedSale?.totalAmount ?? 0)}
                  </div>
                </div>
                <div className="rounded-[1rem] bg-white/80 px-3 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    Change
                  </div>
                  <div className="mt-2 font-mono text-lg font-semibold text-[var(--text-strong)]">
                    {money(lastCompletedSale?.changeAmount ?? 0)}
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-[1.1rem] border border-[var(--border-default)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--text-muted)]">
              The fastest next step is to continue selling. History stays
              available if this receipt needs follow-up.
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
