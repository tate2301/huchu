"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SearchableSelect } from "@/app/gold/components/searchable-select";
import type { SearchableOption } from "@/app/gold/types";
import { FieldHelp } from "@/components/shared/field-help";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NumericCell } from "@/components/ui/numeric-cell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fetchSites } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Clock, Package, Payments, Plus, RefreshCcw, Trash2, Wallet, XCircle } from "@/lib/icons";
import { useReservedId } from "@/hooks/use-reserved-id";

type TenderType = "CASH" | "CARD" | "MOBILE_MONEY" | "TRANSFER" | "VOUCHER";

type PaymentRow = { tenderType: TenderType; amount: string; reference: string };
type CartItem = {
  id: string;
  name: string;
  catalogItemId: string;
  quantity: number;
  unitPrice: number;
  taxPercent: number;
};
type CurrentShift = {
  id: string;
  shiftNo: string;
  siteId: string;
  registerName: string;
  openingFloat: number;
  expectedCash: number;
  actorRole: string;
  netSalesValue: number;
  refundValue: number;
  site: { id: string; name: string; code: string } | null;
};
type PosCatalogItem = {
  id: string;
  name: string;
  unitPrice: number;
  compareAtPrice: number | null;
  taxPercent: number;
  sku: string;
  barcode: string | null;
  inventoryItem: { currentStock: number; unit: string } | null;
};
type Promotion = { id: string; name: string; promoCode: string; type: "PERCENT" | "AMOUNT" | "BUY_X_GET_Y" | "BUNDLE"; value: number };
type HeldCart = { id: string; holdNo: string; label: string | null; cartSnapshot: { items?: CartItem[]; customerName?: string } };
type SaleRow = {
  id: string;
  saleNo: string;
  saleType: string;
  status: string;
  postedAt: string;
  customerName: string | null;
  totalAmount: number;
  itemCount: number;
  tenderTypes: string[];
  overrideReason: string | null;
};
type SaleDetail = SaleRow & {
  notes: string | null;
  promotionCode: string | null;
  payments: Array<{ id: string; tenderType: string; amount: number; reference: string | null }>;
  lines: Array<{ id: string; itemName: string; quantity: number; unitPrice: number; lineTotal: number }>;
  reversals: Array<{ id: string; saleNo: string; saleType: string; totalAmount: number }>;
};

function money(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function isManagerRole(role: string | null | undefined) {
  return role === "SUPERADMIN" || role === "MANAGER" || role === "SHOP_MANAGER";
}

function getPaymentSummary(payments: PaymentRow[], total: number) {
  const parsed = payments.map((payment) => ({ ...payment, amountValue: Number(payment.amount || "0") }));
  const nonCashTotal = round(parsed.filter((payment) => payment.tenderType !== "CASH").reduce((sum, payment) => sum + payment.amountValue, 0));
  const cashTotal = round(parsed.filter((payment) => payment.tenderType === "CASH").reduce((sum, payment) => sum + payment.amountValue, 0));
  const tenderedTotal = round(parsed.reduce((sum, payment) => sum + payment.amountValue, 0));
  const cashDue = round(Math.max(total - nonCashTotal, 0));
  const changeAmount = round(Math.max(cashTotal - cashDue, 0));
  return { parsed, nonCashTotal, tenderedTotal, changeAmount };
}

export function PosPortalContent({ initialView = "checkout" }: { initialView?: "checkout" | "history" }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [panel, setPanel] = useState<"checkout" | "history" | "held">(initialView);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [payments, setPayments] = useState<PaymentRow[]>([{ tenderType: "CASH", amount: "", reference: "" }]);
  const [orderDiscountAmount, setOrderDiscountAmount] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [selectedPromotionId, setSelectedPromotionId] = useState("");
  const [openShiftDialog, setOpenShiftDialog] = useState(false);
  const [closeShiftDialog, setCloseShiftDialog] = useState(false);
  const [holdDialog, setHoldDialog] = useState(false);
  const [saleDialog, setSaleDialog] = useState(false);
  const [refundDialog, setRefundDialog] = useState(false);
  const [voidDialog, setVoidDialog] = useState(false);
  const [openingFloat, setOpeningFloat] = useState("0");
  const [registerName, setRegisterName] = useState("");
  const [registerCode, setRegisterCode] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [holdLabel, setHoldLabel] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [refundNotes, setRefundNotes] = useState("");
  const [refundAmounts, setRefundAmounts] = useState<Record<string, string>>({});
  const [refundPayments, setRefundPayments] = useState<PaymentRow[]>([{ tenderType: "CASH", amount: "", reference: "" }]);
  const [voidReason, setVoidReason] = useState("");
  const [voidNotes, setVoidNotes] = useState("");

  const sitesQuery = useQuery({ queryKey: ["pos-sites"], queryFn: fetchSites });
  const currentShiftQuery = useQuery({
    queryKey: ["retail-current-shift"],
    queryFn: () => fetchJson<{ data: CurrentShift | null }>("/api/v2/retail/pos/current-shift"),
  });
  const currentShift = currentShiftQuery.data?.data ?? null;
  const siteId = currentShift?.siteId || selectedSiteId;
  const catalogQuery = useQuery({
    queryKey: ["retail-pos-catalog", siteId, search],
    queryFn: () => fetchJson<{ data: PosCatalogItem[] }>(`/api/v2/retail/pos/catalog?siteId=${encodeURIComponent(siteId)}&search=${encodeURIComponent(search)}`),
    enabled: Boolean(siteId),
  });
  const heldCartsQuery = useQuery({
    queryKey: ["retail-held-carts", currentShift?.id],
    queryFn: () => fetchJson<{ data: HeldCart[] }>(`/api/v2/retail/pos/held-carts?shiftId=${encodeURIComponent(currentShift?.id ?? "")}`),
    enabled: Boolean(currentShift?.id),
  });
  const promotionsQuery = useQuery({
    queryKey: ["retail-pos-promotions"],
    queryFn: () => fetchJson<{ data: Promotion[] }>("/api/v2/retail/promotions?status=ACTIVE"),
    enabled: Boolean(siteId),
  });
  const salesQuery = useQuery({
    queryKey: ["retail-pos-sales", currentShift?.id],
    queryFn: () => fetchJson<{ data: SaleRow[] }>(`/api/v2/retail/pos/sales?shiftId=${encodeURIComponent(currentShift?.id ?? "")}&limit=30`),
    enabled: Boolean(currentShift?.id),
  });
  const saleDetailQuery = useQuery({
    queryKey: ["retail-pos-sale-detail", selectedSaleId],
    queryFn: () => fetchJson<{ data: SaleDetail }>(`/api/v2/retail/pos/sales/${selectedSaleId}`),
    enabled: Boolean(selectedSaleId),
  });

  const { reservedId: shiftNo, isReserving: reservingShiftNo, error: reserveShiftError } = useReservedId({
    entity: "RETAIL_SHIFT",
    enabled: openShiftDialog && Boolean(selectedSiteId),
    siteId: selectedSiteId || undefined,
  });

  const siteOptions = useMemo<SearchableOption[]>(
    () => (sitesQuery.data ?? []).map((site) => ({ value: site.id, label: site.name, meta: site.code })),
    [sitesQuery.data],
  );
  const activePromotion = useMemo(
    () => (promotionsQuery.data?.data ?? []).find((promotion) => promotion.id === selectedPromotionId) ?? null,
    [promotionsQuery.data?.data, selectedPromotionId],
  );
  const canOverride = isManagerRole(currentShift?.actorRole);
  const subtotal = round(cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
  const promotionDiscount = activePromotion ? (activePromotion.type === "PERCENT" ? round((subtotal * activePromotion.value) / 100) : activePromotion.type === "AMOUNT" ? round(Math.min(activePromotion.value, subtotal)) : 0) : 0;
  const orderDiscountValue = round(Number(orderDiscountAmount || "0"));
  const taxAmount = round(cart.reduce((sum, item) => sum + item.unitPrice * item.quantity * (item.taxPercent / 100), 0));
  const total = round(Math.max(subtotal - orderDiscountValue - promotionDiscount, 0) + taxAmount);
  const paymentSummary = useMemo(() => getPaymentSummary(payments, total), [payments, total]);
  const selectedSale = saleDetailQuery.data?.data ?? null;
  const refundTotal = round((selectedSale?.lines ?? []).reduce((sum, line) => {
    const quantity = Number(refundAmounts[line.id] || "0");
    if (quantity <= 0 || line.quantity <= 0) return sum;
    return sum + Math.abs(line.lineTotal) * (quantity / line.quantity);
  }, 0));
  const refundPaymentSummary = useMemo(() => getPaymentSummary(refundPayments, refundTotal), [refundPayments, refundTotal]);

  const openShiftMutation = useMutation({
    mutationFn: () => fetchJson("/api/v2/retail/shifts", {
      method: "POST",
      body: JSON.stringify({
        shiftNo: shiftNo || undefined,
        siteId: selectedSiteId,
        registerName,
        registerCode: registerCode.trim() || undefined,
        openingFloat: Number(openingFloat || 0),
      }),
    }),
    onSuccess: () => {
      toast({ title: "Shift opened", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
      setOpenShiftDialog(false);
      setOpeningFloat("0");
      setRegisterName("");
      setRegisterCode("");
    },
    onError: (error) => toast({ title: "Unable to open shift", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const closeShiftMutation = useMutation({
    mutationFn: () => fetchJson(`/api/v2/retail/shifts/${currentShift?.id}/close`, {
      method: "POST",
      body: JSON.stringify({ countedCash: Number(countedCash || 0), notes: closeNotes.trim() || undefined }),
    }),
    onSuccess: () => {
      toast({ title: "Shift closed", variant: "success" });
      setCloseShiftDialog(false);
      setCart([]);
      setPayments([{ tenderType: "CASH", amount: "", reference: "" }]);
      queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
      queryClient.invalidateQueries({ queryKey: ["retail-pos-sales"] });
    },
    onError: (error) => toast({ title: "Unable to close shift", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const holdCartMutation = useMutation({
    mutationFn: () => fetchJson("/api/v2/retail/pos/held-carts", {
      method: "POST",
      body: JSON.stringify({
        shiftId: currentShift?.id,
        label: holdLabel.trim() || undefined,
        cartSnapshot: { items: cart, customerName },
      }),
    }),
    onSuccess: () => {
      toast({ title: "Cart held", variant: "success" });
      setHoldDialog(false);
      setHoldLabel("");
      setCart([]);
      setCustomerName("");
      setPayments([{ tenderType: "CASH", amount: "", reference: "" }]);
      queryClient.invalidateQueries({ queryKey: ["retail-held-carts"] });
      setPanel("held");
    },
    onError: (error) => toast({ title: "Unable to hold cart", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const saleMutation = useMutation({
    mutationFn: () => fetchJson("/api/v2/retail/pos/sales", {
      method: "POST",
      body: JSON.stringify({
        shiftId: currentShift?.id,
        siteId,
        customerName: customerName.trim() || undefined,
        discountAmount: orderDiscountValue || undefined,
        overrideReason: overrideReason.trim() || undefined,
        promotionId: selectedPromotionId || undefined,
        items: cart.map((item) => ({ catalogItemId: item.catalogItemId, quantity: item.quantity })),
        payments: paymentSummary.parsed.map((payment) => ({ tenderType: payment.tenderType, amount: payment.amountValue, reference: payment.reference.trim() || undefined })),
      }),
    }),
    onSuccess: () => {
      toast({ title: "Sale posted", variant: "success" });
      setCart([]);
      setCustomerName("");
      setPayments([{ tenderType: "CASH", amount: "", reference: "" }]);
      setOrderDiscountAmount("");
      setOverrideReason("");
      setSelectedPromotionId("");
      queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
      queryClient.invalidateQueries({ queryKey: ["retail-pos-catalog"] });
      queryClient.invalidateQueries({ queryKey: ["retail-pos-sales"] });
      setPanel("history");
    },
    onError: (error) => toast({ title: "Unable to post sale", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const refundMutation = useMutation({
    mutationFn: () => fetchJson(`/api/v2/retail/pos/sales/${selectedSale?.id}/refund`, {
      method: "POST",
      body: JSON.stringify({
        shiftId: currentShift?.id,
        reason: refundReason.trim(),
        notes: refundNotes.trim() || undefined,
        lines: (selectedSale?.lines ?? []).map((line) => ({
          saleLineId: line.id,
          quantity: Number(refundAmounts[line.id] || "0"),
        })).filter((line) => line.quantity > 0),
        payments: refundPaymentSummary.parsed.filter((payment) => payment.amountValue > 0).map((payment) => ({
          tenderType: payment.tenderType,
          amount: payment.amountValue,
          reference: payment.reference.trim() || undefined,
        })),
      }),
    }),
    onSuccess: () => {
      toast({ title: "Refund posted", variant: "success" });
      setRefundDialog(false);
      setSaleDialog(false);
      setRefundReason("");
      setRefundNotes("");
      setRefundAmounts({});
      setRefundPayments([{ tenderType: "CASH", amount: "", reference: "" }]);
      queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
      queryClient.invalidateQueries({ queryKey: ["retail-pos-sales"] });
    },
    onError: (error) => toast({ title: "Unable to post refund", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const voidMutation = useMutation({
    mutationFn: () => fetchJson(`/api/v2/retail/pos/sales/${selectedSale?.id}/void`, {
      method: "POST",
      body: JSON.stringify({ shiftId: currentShift?.id, reason: voidReason.trim(), notes: voidNotes.trim() || undefined }),
    }),
    onSuccess: () => {
      toast({ title: "Sale voided", variant: "success" });
      setVoidDialog(false);
      setSaleDialog(false);
      setVoidReason("");
      setVoidNotes("");
      queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
      queryClient.invalidateQueries({ queryKey: ["retail-pos-sales"] });
    },
    onError: (error) => toast({ title: "Unable to void sale", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const recallCart = async (heldCart: HeldCart) => {
    setCart((heldCart.cartSnapshot.items ?? []).map((item) => ({ ...item })));
    setCustomerName(heldCart.cartSnapshot.customerName ?? "");
    setPayments([{ tenderType: "CASH", amount: "", reference: "" }]);
    setPanel("checkout");
    await fetchJson(`/api/v2/retail/pos/held-carts/${heldCart.id}/recall`, { method: "POST" });
    queryClient.invalidateQueries({ queryKey: ["retail-held-carts"] });
  };

  const addToCart = (item: PosCatalogItem) => {
    setCart((current) => {
      const existing = current.find((entry) => entry.catalogItemId === item.id);
      if (existing) {
        return current.map((entry) => entry.catalogItemId === item.id ? { ...entry, quantity: entry.quantity + 1 } : entry);
      }
      return [...current, { id: item.id, name: item.name, catalogItemId: item.id, quantity: 1, unitPrice: item.unitPrice, taxPercent: item.taxPercent }];
    });
  };

  const updateQty = (catalogItemId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart((current) => current.filter((entry) => entry.catalogItemId !== catalogItemId));
      return;
    }
    setCart((current) => current.map((entry) => entry.catalogItemId === catalogItemId ? { ...entry, quantity } : entry));
  };

  const variancePreview = round(Number(countedCash || "0") - (currentShift?.expectedCash ?? 0));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--surface-muted)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <div className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-base)] px-3 py-1.5">
            <Clock className="h-4 w-4" />
            <span>{currentShift ? currentShift.shiftNo : "No open shift"}</span>
          </div>
          {currentShift ? (
            <>
              <div>{currentShift.site?.name ?? "Site"}</div>
              <div className="text-[var(--text-muted)]">{currentShift.registerName}</div>
              <div className="font-mono text-[var(--text-muted)]">{money(currentShift.netSalesValue)}</div>
            </>
          ) : null}
        </div>
        {!currentShift ? (
          <Button size="sm" onClick={() => setOpenShiftDialog(true)}>Open shift</Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setHoldDialog(true)} disabled={cart.length === 0}>Hold</Button>
            <Button size="sm" variant="outline" onClick={() => setCloseShiftDialog(true)}>Close shift</Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_430px]">
        <section className="space-y-3">
          <div className="flex items-center gap-2 rounded-2xl bg-[var(--surface-muted)] px-3 py-2">
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Scan code or search item" className="border-none bg-transparent px-0 shadow-none focus-visible:ring-0" />
          </div>
          {(promotionsQuery.data?.data ?? []).length > 0 ? (
            <div className="flex gap-2 overflow-auto pb-1">
              <button type="button" onClick={() => setSelectedPromotionId("")} className={`rounded-full px-3 py-1.5 text-xs ${selectedPromotionId ? "bg-[var(--surface-muted)] text-[var(--text-muted)]" : "bg-[#d1a45a] text-[#2b1f0d]"}`}>No promotion</button>
              {(promotionsQuery.data?.data ?? []).map((promotion) => (
                <button key={promotion.id} type="button" onClick={() => setSelectedPromotionId(promotion.id)} className={`rounded-full px-3 py-1.5 text-xs ${selectedPromotionId === promotion.id ? "bg-[#d1a45a] text-[#2b1f0d]" : "bg-[var(--surface-muted)] text-[var(--text-muted)]"}`}>{promotion.name}</button>
              ))}
            </div>
          ) : null}
          <div className="h-[calc(100vh-18rem)] overflow-auto rounded-2xl bg-[var(--surface-muted)] p-3">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {(catalogQuery.data?.data ?? []).map((item) => (
                <button key={item.id} type="button" onClick={() => addToCart(item)} className="rounded-2xl bg-[var(--surface-base)] p-3 text-left transition-transform duration-150 hover:-translate-y-0.5 active:scale-[0.99]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-[var(--text-strong)]">{item.name}</div>
                      <div className="mt-1 text-xs text-[var(--text-muted)]">{(item.inventoryItem?.currentStock ?? 0).toFixed(2)} {item.inventoryItem?.unit ?? ""}</div>
                      <div className="mt-1 text-xs text-[var(--text-muted)]">{item.barcode ?? item.sku}</div>
                    </div>
                    <Package className="h-4 w-4 text-[var(--text-muted)]" />
                  </div>
                  <div className="mt-4 flex items-end gap-2">
                    <div className="font-mono text-lg font-semibold text-[var(--text-strong)]">{money(item.unitPrice)}</div>
                    {item.compareAtPrice && item.compareAtPrice > item.unitPrice ? <div className="font-mono text-xs text-[var(--text-muted)] line-through">{money(item.compareAtPrice)}</div> : null}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-[var(--surface-muted)] p-2">
            {["checkout", "history", "held"].map((item) => (
              <button key={item} type="button" onClick={() => setPanel(item as "checkout" | "history" | "held")} className={`rounded-xl px-3 py-2 text-sm ${panel === item ? "bg-[var(--surface-base)] text-[var(--text-strong)]" : "text-[var(--text-muted)]"}`}>{item === "checkout" ? "Checkout" : item === "history" ? "History" : "Held"}</button>
            ))}
          </div>

          {panel === "checkout" ? (
            <>
              <div className="rounded-2xl bg-[var(--surface-muted)] px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium">Current cart</div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-base)] px-3 py-1.5 text-xs"><Payments className="h-4 w-4" />{cart.reduce((sum, item) => sum + item.quantity, 0)} items</div>
                </div>
                <div className="mt-3 space-y-3">
                  <Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Customer" />
                  <div className="h-[320px] overflow-auto">
                    <div className="space-y-2 pr-1">
                      {cart.length === 0 ? <div className="rounded-2xl bg-[var(--surface-base)] px-3 py-8 text-center text-sm text-[var(--text-muted)]">Add items to start checkout.</div> : cart.map((item) => (
                        <div key={item.catalogItemId} className="rounded-2xl bg-[var(--surface-base)] px-3 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div><div className="font-medium">{item.name}</div><div className="text-xs text-[var(--text-muted)]">{money(item.unitPrice)} each</div></div>
                            <NumericCell>{money(item.unitPrice * item.quantity)}</NumericCell>
                          </div>
                          <div className="mt-3 flex items-center gap-2">
                            <Button size="sm" variant="outline" className="h-10 w-10 px-0" onClick={() => updateQty(item.catalogItemId, item.quantity - 1)}>-</Button>
                            <Input value={String(item.quantity)} onChange={(event) => updateQty(item.catalogItemId, Number(event.target.value || "0"))} inputMode="decimal" className="h-10 text-center" />
                            <Button size="sm" variant="outline" className="h-10 w-10 px-0" onClick={() => updateQty(item.catalogItemId, item.quantity + 1)}>+</Button>
                            <Button size="sm" variant="outline" className="ml-auto" onClick={() => updateQty(item.catalogItemId, 0)}>Remove</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-[var(--surface-muted)] px-4 py-4">
                <div className="grid gap-2 text-sm">
                  <div className="flex items-center justify-between gap-3"><span>Subtotal</span><span className="font-mono">{money(subtotal)}</span></div>
                  {promotionDiscount > 0 ? <div className="flex items-center justify-between gap-3"><span>Promotion</span><span className="font-mono">{money(promotionDiscount)}</span></div> : null}
                  {orderDiscountValue > 0 ? <div className="flex items-center justify-between gap-3"><span>Order discount</span><span className="font-mono">{money(orderDiscountValue)}</span></div> : null}
                  <div className="flex items-center justify-between gap-3"><span>Tax</span><span className="font-mono">{money(taxAmount)}</span></div>
                  <div className="flex items-center justify-between gap-3 text-base font-semibold"><span>Total</span><span className="font-mono">{money(total)}</span></div>
                </div>
                {canOverride ? (
                  <div className="mt-4 grid gap-3">
                    <Input value={orderDiscountAmount} onChange={(event) => setOrderDiscountAmount(event.target.value)} inputMode="decimal" placeholder="Order discount" className="h-11" />
                    <Textarea value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} rows={2} placeholder="Override reason" />
                  </div>
                ) : null}
                <div className="mt-4 space-y-3">
                  {payments.map((payment, index) => (
                    <div key={`${payment.tenderType}-${index}`} className="grid gap-2 md:grid-cols-[1fr_110px_1fr_auto]">
                      <Select value={payment.tenderType} onValueChange={(value) => setPayments((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, tenderType: value as TenderType } : entry))}>
                        <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="CASH">Cash</SelectItem><SelectItem value="CARD">Card</SelectItem><SelectItem value="MOBILE_MONEY">Mobile money</SelectItem><SelectItem value="TRANSFER">Transfer</SelectItem><SelectItem value="VOUCHER">Voucher</SelectItem></SelectContent>
                      </Select>
                      <Input value={payment.amount} onChange={(event) => setPayments((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, amount: event.target.value } : entry))} inputMode="decimal" placeholder="Amount" className="h-11" />
                      <Input value={payment.reference} onChange={(event) => setPayments((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, reference: event.target.value } : entry))} placeholder="Reference" className="h-11" />
                      <Button type="button" variant="outline" className="h-11 px-3" onClick={() => setPayments((current) => current.filter((_, paymentIndex) => paymentIndex !== index))} disabled={payments.length === 1}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" className="w-full" onClick={() => setPayments((current) => [...current, { tenderType: "CARD", amount: "", reference: "" }])}><Plus className="h-4 w-4" />Add tender</Button>
                  <div className="flex items-center justify-between gap-3 text-sm"><span>Change</span><span className="font-mono">{money(paymentSummary.changeAmount)}</span></div>
                  <Button className="h-12 text-base" onClick={() => saleMutation.mutate()} disabled={!currentShift || cart.length === 0 || paymentSummary.nonCashTotal > total || paymentSummary.tenderedTotal < total || saleMutation.isPending}><Wallet className="h-4 w-4" />Complete sale</Button>
                </div>
              </div>
            </>
          ) : null}

          {panel === "history" ? <div className="rounded-2xl bg-[var(--surface-muted)] px-4 py-4"><div className="flex items-center justify-between gap-3"><div className="text-sm font-medium">Recent transactions</div><Button size="sm" variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["retail-pos-sales"] })}><RefreshCcw className="h-4 w-4" />Refresh</Button></div><div className="mt-3 space-y-2">{(salesQuery.data?.data ?? []).length === 0 ? <div className="rounded-2xl bg-[var(--surface-base)] px-3 py-8 text-center text-sm text-[var(--text-muted)]">No transactions yet.</div> : (salesQuery.data?.data ?? []).map((sale) => <button key={sale.id} type="button" onClick={() => { setSelectedSaleId(sale.id); setSaleDialog(true); }} className="flex w-full items-center justify-between gap-3 rounded-2xl bg-[var(--surface-base)] px-3 py-3 text-left"><div><div className="font-mono font-semibold">{sale.saleNo}</div><div className="text-xs text-[var(--text-muted)]">{sale.saleType} · {sale.customerName ?? "Walk-in"} · {sale.itemCount} items</div></div><div className="text-right"><div className="font-mono text-sm font-semibold">{money(sale.totalAmount)}</div><div className="text-xs text-[var(--text-muted)]">{new Date(sale.postedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div></div></button>)}</div></div> : null}

          {panel === "held" ? <div className="rounded-2xl bg-[var(--surface-muted)] px-4 py-4"><div className="text-sm font-medium">Held carts</div><div className="mt-3 space-y-2">{(heldCartsQuery.data?.data ?? []).slice(0, 12).map((heldCart) => <button key={heldCart.id} type="button" onClick={() => recallCart(heldCart)} className="flex w-full items-center justify-between gap-3 rounded-2xl bg-[var(--surface-base)] px-3 py-3 text-left"><div><div className="font-medium">{heldCart.label || heldCart.holdNo}</div><div className="font-mono text-xs text-[var(--text-muted)]">{heldCart.holdNo}</div></div><span className="text-xs text-[var(--text-muted)]">{(heldCart.cartSnapshot.items?.length ?? 0)} lines</span></button>)}</div></div> : null}
        </section>
      </div>

      <Dialog open={openShiftDialog} onOpenChange={setOpenShiftDialog}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Open shift</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-semibold">Shift number</label>
              <Input value={shiftNo} readOnly disabled={reservingShiftNo} />
              <FieldHelp error={reserveShiftError ?? undefined} hint={reserveShiftError ? undefined : "Generated automatically."} />
            </div>
            <SearchableSelect label="Site" value={selectedSiteId} options={siteOptions} placeholder="Select site" onValueChange={setSelectedSiteId} />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><label className="block text-sm font-semibold">Register name</label><Input value={registerName} onChange={(event) => setRegisterName(event.target.value)} placeholder="Front till" /></div>
              <div className="space-y-2"><label className="block text-sm font-semibold">Register code</label><Input value={registerCode} onChange={(event) => setRegisterCode(event.target.value)} placeholder="Optional" /></div>
            </div>
            <div className="space-y-2"><label className="block text-sm font-semibold">Opening float</label><Input value={openingFloat} onChange={(event) => setOpeningFloat(event.target.value)} inputMode="decimal" /></div>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpenShiftDialog(false)}>Cancel</Button><Button type="button" onClick={() => openShiftMutation.mutate()} disabled={openShiftMutation.isPending || !selectedSiteId || !registerName}>Open shift</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={holdDialog} onOpenChange={setHoldDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Hold cart</DialogTitle></DialogHeader>
          <div className="space-y-2"><label className="block text-sm font-semibold">Label</label><Input value={holdLabel} onChange={(event) => setHoldLabel(event.target.value)} placeholder="Counter pickup" /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setHoldDialog(false)}>Cancel</Button><Button type="button" onClick={() => holdCartMutation.mutate()} disabled={holdCartMutation.isPending}>Hold</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={closeShiftDialog} onOpenChange={setCloseShiftDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{currentShift?.shiftNo ?? "Close shift"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3 text-sm"><div className="flex items-center justify-between gap-3"><span>Opening float</span><span className="font-mono">{money(currentShift?.openingFloat ?? 0)}</span></div></div>
              <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3 text-sm"><div className="flex items-center justify-between gap-3"><span>Expected cash</span><span className="font-mono">{money(currentShift?.expectedCash ?? 0)}</span></div></div>
              <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3 text-sm"><div className="flex items-center justify-between gap-3"><span>Net sales</span><span className="font-mono">{money(currentShift?.netSalesValue ?? 0)}</span></div></div>
              <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3 text-sm"><div className="flex items-center justify-between gap-3"><span>Refunds</span><span className="font-mono">{money(currentShift?.refundValue ?? 0)}</span></div></div>
            </div>
            <div className="space-y-2"><label className="block text-sm font-semibold">Counted cash</label><Input value={countedCash} onChange={(event) => setCountedCash(event.target.value)} inputMode="decimal" /></div>
            <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3 text-sm"><div className="flex items-center justify-between gap-3"><span>Variance</span><span className="font-mono">{money(variancePreview)}</span></div></div>
            <div className="space-y-2"><label className="block text-sm font-semibold">Notes</label><Textarea value={closeNotes} onChange={(event) => setCloseNotes(event.target.value)} rows={3} /></div>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setCloseShiftDialog(false)}>Cancel</Button><Button type="button" onClick={() => closeShiftMutation.mutate()} disabled={closeShiftMutation.isPending}>Close shift</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={saleDialog} onOpenChange={(open) => { setSaleDialog(open); if (!open) setSelectedSaleId(null); }}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader><DialogTitle>{selectedSale?.saleNo ?? "Transaction"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Type</div><div className="mt-2 text-sm font-medium">{selectedSale?.saleType ?? "-"}</div></div>
              <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Total</div><div className="mt-2 font-mono text-sm font-semibold">{money(selectedSale?.totalAmount ?? 0)}</div></div>
              <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Promotion</div><div className="mt-2 text-sm font-medium">{selectedSale?.promotionCode ?? "-"}</div></div>
              <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Status</div><div className="mt-2 text-sm font-medium">{selectedSale?.status ?? "-"}</div></div>
            </div>
            {selectedSale?.overrideReason || selectedSale?.notes ? <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3 text-sm text-[var(--text-muted)]">{selectedSale?.overrideReason ? <div>Override: {selectedSale.overrideReason}</div> : null}{selectedSale?.notes ? <div>Notes: {selectedSale.notes}</div> : null}</div> : null}
            <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3"><div className="text-sm font-medium">Lines</div><div className="mt-3 space-y-2">{(selectedSale?.lines ?? []).map((line) => <div key={line.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--surface-base)] px-3 py-3 text-sm"><div><div className="font-medium">{line.itemName}</div><div className="text-xs text-[var(--text-muted)]">{line.quantity.toFixed(2)} x {money(line.unitPrice)}</div></div><NumericCell>{money(line.lineTotal)}</NumericCell></div>)}</div></div>
            <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3"><div className="text-sm font-medium">Payments</div><div className="mt-3 space-y-2">{(selectedSale?.payments ?? []).map((payment) => <div key={payment.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--surface-base)] px-3 py-3 text-sm"><div><div className="font-medium">{payment.tenderType.replaceAll("_", " ")}</div><div className="text-xs text-[var(--text-muted)]">{payment.reference ?? "No reference"}</div></div><NumericCell>{money(payment.amount)}</NumericCell></div>)}</div></div>
            {(selectedSale?.reversals ?? []).length > 0 ? <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3"><div className="text-sm font-medium">Reversals</div><div className="mt-3 space-y-2">{selectedSale?.reversals.map((reversal) => <div key={reversal.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--surface-base)] px-3 py-3 text-sm"><div><div className="font-medium">{reversal.saleNo}</div><div className="text-xs text-[var(--text-muted)]">{reversal.saleType}</div></div><NumericCell>{money(reversal.totalAmount)}</NumericCell></div>)}</div></div> : null}
            {canOverride && currentShift && selectedSale?.saleType === "SALE" && selectedSale.status === "POSTED" ? <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => { const next = (selectedSale?.lines ?? []).reduce<Record<string, string>>((acc, line) => { acc[line.id] = String(line.quantity); return acc; }, {}); setRefundAmounts(next); setRefundReason(""); setRefundNotes(""); setRefundPayments([{ tenderType: "CASH", amount: String(Math.abs(selectedSale.totalAmount)), reference: "" }]); setRefundDialog(true); }}><RefreshCcw className="h-4 w-4" />Refund</Button><Button type="button" variant="outline" onClick={() => { setVoidReason(""); setVoidNotes(""); setVoidDialog(true); }} disabled={(selectedSale.reversals ?? []).length > 0}><XCircle className="h-4 w-4" />Void sale</Button></div> : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={refundDialog} onOpenChange={setRefundDialog}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader><DialogTitle>Refund {selectedSale?.saleNo}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">{(selectedSale?.lines ?? []).map((line) => <div key={line.id} className="grid gap-2 rounded-2xl bg-[var(--surface-muted)] px-3 py-3 md:grid-cols-[minmax(0,1fr)_130px_120px]"><div><div className="font-medium">{line.itemName}</div><div className="text-xs text-[var(--text-muted)]">{line.quantity.toFixed(2)} x {money(line.unitPrice)}</div></div><Input value={refundAmounts[line.id] ?? ""} onChange={(event) => setRefundAmounts((current) => ({ ...current, [line.id]: event.target.value }))} inputMode="decimal" className="h-10" placeholder="Qty" /><div className="flex items-center justify-end font-mono text-sm">{money(round(Math.abs(line.lineTotal) * (Number(refundAmounts[line.id] || "0") / (line.quantity || 1))))}</div></div>)}</div>
            <Input value={refundReason} onChange={(event) => setRefundReason(event.target.value)} placeholder="Reason" />
            <Textarea value={refundNotes} onChange={(event) => setRefundNotes(event.target.value)} rows={2} placeholder="Notes" />
            {refundPayments.map((payment, index) => <div key={`${payment.tenderType}-${index}`} className="grid gap-2 md:grid-cols-[1fr_110px_1fr_auto]"><Select value={payment.tenderType} onValueChange={(value) => setRefundPayments((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, tenderType: value as TenderType } : entry))}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CASH">Cash</SelectItem><SelectItem value="CARD">Card</SelectItem><SelectItem value="MOBILE_MONEY">Mobile money</SelectItem><SelectItem value="TRANSFER">Transfer</SelectItem><SelectItem value="VOUCHER">Voucher</SelectItem></SelectContent></Select><Input value={payment.amount} onChange={(event) => setRefundPayments((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, amount: event.target.value } : entry))} inputMode="decimal" className="h-11" placeholder="Amount" /><Input value={payment.reference} onChange={(event) => setRefundPayments((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, reference: event.target.value } : entry))} className="h-11" placeholder="Reference" /><Button type="button" variant="outline" className="h-11 px-3" onClick={() => setRefundPayments((current) => current.filter((_, paymentIndex) => paymentIndex !== index))} disabled={refundPayments.length === 1}><Trash2 className="h-4 w-4" /></Button></div>)}
            <Button type="button" variant="outline" className="w-full" onClick={() => setRefundPayments((current) => [...current, { tenderType: "CARD", amount: "", reference: "" }])}><Plus className="h-4 w-4" />Add tender</Button>
            <div className="flex items-center justify-between gap-3 text-sm"><span>Refund total</span><span className="font-mono">{money(refundTotal)}</span></div>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setRefundDialog(false)}>Cancel</Button><Button type="button" onClick={() => refundMutation.mutate()} disabled={refundMutation.isPending || refundTotal <= 0 || !refundReason.trim() || Math.abs(refundPaymentSummary.tenderedTotal - refundTotal) > 0.01}>Post refund</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={voidDialog} onOpenChange={setVoidDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Void sale</DialogTitle></DialogHeader>
          <div className="space-y-3"><Input value={voidReason} onChange={(event) => setVoidReason(event.target.value)} placeholder="Reason" /><Textarea value={voidNotes} onChange={(event) => setVoidNotes(event.target.value)} rows={3} placeholder="Notes" /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setVoidDialog(false)}>Cancel</Button><Button type="button" variant="destructive" onClick={() => voidMutation.mutate()} disabled={voidMutation.isPending || !voidReason.trim()}>Void sale</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
