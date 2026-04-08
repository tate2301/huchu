"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { fetchSites } from "@/lib/api";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  bumpQueuedPosSaleRetry,
  loadQueuedPosSales,
  queuePosSale,
  removeQueuedPosSale,
  type PosSaleQueuePayload,
} from "@/lib/retail/pos-offline-queue";
import { calculateRetailCheckout } from "@/lib/retail/checkout";
import { getPosPortalHref } from "@/lib/retail/pos-host";
import type {
  CartItem,
  CurrentShift,
  PaymentRow,
  PosCatalogItem,
  Promotion,
} from "./pos-types";
import { getPaymentSummary, isManagerRole } from "./pos-utils";

type CompletedSale = {
  id: string;
  saleNo: string;
  customerName?: string | null;
  customerPhone?: string | null;
  totalAmount: number;
  changeAmount: number;
  postedAt: string;
  loyalty?: {
    pointsEarned: number;
    pointsBalance: number;
    tier: string;
  } | null;
};

type PosPortalStateValue = {
  search: string;
  setSearch: (value: string) => void;
  cart: CartItem[];
  customerName: string;
  setCustomerName: (value: string) => void;
  customerPhone: string;
  setCustomerPhone: (value: string) => void;
  customerEmail: string;
  setCustomerEmail: (value: string) => void;
  payments: PaymentRow[];
  setPayments: (value: PaymentRow[] | ((current: PaymentRow[]) => PaymentRow[])) => void;
  orderDiscountAmount: string;
  setOrderDiscountAmount: (value: string) => void;
  overrideReason: string;
  setOverrideReason: (value: string) => void;
  selectedPromotionId: string;
  setSelectedPromotionId: (value: string) => void;
  sites: Awaited<ReturnType<typeof fetchSites>>;
  currentShift: CurrentShift | null;
  currentShiftLoading: boolean;
  catalogItems: PosCatalogItem[];
  catalogLoading: boolean;
  promotions: Promotion[];
  isPosHost: boolean;
  addToCart: (item: PosCatalogItem) => void;
  updateQty: (catalogItemId: string, quantity: number) => void;
  updateItemPrice: (catalogItemId: string, unitPrice: number) => void;
  updateItemDiscount: (catalogItemId: string, discountAmount: number) => void;
  removeFromCart: (catalogItemId: string) => void;
  replaceCartFromHeld: (input: {
    items?: CartItem[];
    customerName?: string;
    orderDiscountAmount?: string;
    selectedPromotionId?: string;
  }) => void;
  clearCart: () => void;
  canOverride: boolean;
  activePromotion: Promotion | null;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  changeAmount: number;
  tenderedTotal: number;
  nonCashTotal: number;
  postSale: () => void;
  postSalePending: boolean;
  pendingOfflineSales: number;
  syncOfflineSales: () => void;
  syncOfflineSalesPending: boolean;
  lastCompletedSale: CompletedSale | null;
  dismissCompletedSale: () => void;
};

const PosPortalStateContext = createContext<PosPortalStateValue | null>(null);

function createQueuedSaleNo() {
  return `RSL-${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

export function PosPortalProvider({
  children,
  isPosHost = false,
}: PropsWithChildren<{ isPosHost?: boolean }>) {
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [payments, setPayments] = useState<PaymentRow[]>([
    { tenderType: "CASH", amount: "", reference: "" },
  ]);
  const [orderDiscountAmount, setOrderDiscountAmount] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [selectedPromotionId, setSelectedPromotionId] = useState("");
  const [lastCompletedSale, setLastCompletedSale] = useState<CompletedSale | null>(null);
  const [pendingOfflineSales, setPendingOfflineSales] = useState(0);
  const [syncOfflineSalesPending, setSyncOfflineSalesPending] = useState(false);

  const sitesQuery = useQuery({ queryKey: ["pos-sites"], queryFn: fetchSites });
  const currentShiftQuery = useQuery({
    queryKey: ["retail-current-shift"],
    queryFn: () =>
      fetchJson<{ data: CurrentShift | null }>("/api/v2/retail/pos/current-shift"),
  });
  const currentShift = currentShiftQuery.data?.data ?? null;
  const siteId = currentShift?.siteId ?? "";

  const catalogQuery = useQuery({
    queryKey: ["retail-pos-catalog", siteId, search],
    queryFn: () =>
      fetchJson<{ data: PosCatalogItem[] }>(
        `/api/v2/retail/pos/catalog?siteId=${encodeURIComponent(siteId)}&search=${encodeURIComponent(search)}`,
      ),
    enabled: Boolean(siteId),
  });
  const promotionsQuery = useQuery({
    queryKey: ["retail-pos-promotions"],
    queryFn: () =>
      fetchJson<{ data: Promotion[] }>("/api/v2/retail/promotions?status=ACTIVE&pos=1"),
    enabled: Boolean(siteId),
  });

  const activePromotion = useMemo(
    () =>
      (promotionsQuery.data?.data ?? []).find(
        (promotion) => promotion.id === selectedPromotionId,
      ) ?? null,
    [promotionsQuery.data?.data, selectedPromotionId],
  );

  const checkout = useMemo(
    () =>
      calculateRetailCheckout({
        lines: cart.map((item) => ({
          id: item.catalogItemId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxPercent: item.taxPercent,
          lineDiscountAmount: item.lineDiscountAmount ?? 0,
        })),
        orderDiscountAmount: Number(orderDiscountAmount || "0"),
        promotion: activePromotion
          ? {
              id: activePromotion.id,
              type: activePromotion.type,
              value: activePromotion.value,
            }
          : null,
      }),
    [activePromotion, cart, orderDiscountAmount],
  );

  const paymentSummary = useMemo(
    () => getPaymentSummary(payments, checkout.total),
    [payments, checkout.total],
  );

  const addToCart = (item: PosCatalogItem) => {
    setCart((current) => {
      const existing = current.find((entry) => entry.catalogItemId === item.id);
      if (existing) {
        return current.map((entry) =>
          entry.catalogItemId === item.id
            ? { ...entry, quantity: entry.quantity + 1 }
            : entry,
        );
      }
      return [
        ...current,
        {
          id: item.id,
          name: item.name,
          catalogItemId: item.id,
          quantity: 1,
          unitPrice: item.unitPrice,
          taxPercent: item.taxPercent,
          compareAtPrice: item.compareAtPrice,
          lineDiscountAmount: 0,
        },
      ];
    });
  };

  const clearCart = () => {
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerEmail("");
    setPayments([{ tenderType: "CASH", amount: "", reference: "" }]);
    setOrderDiscountAmount("");
    setOverrideReason("");
    setSelectedPromotionId("");
  };

  const refreshOfflineCount = () => {
    setPendingOfflineSales(loadQueuedPosSales().length);
  };

  const buildSalePayload = (): PosSaleQueuePayload | null => {
    if (!currentShift?.id || !siteId) return null;
    return {
      saleNo: createQueuedSaleNo(),
      shiftId: currentShift.id,
      siteId,
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      customerEmail: customerEmail.trim() || undefined,
      discountAmount: Number(orderDiscountAmount || "0") || undefined,
      overrideReason: overrideReason.trim() || undefined,
      promotionId: selectedPromotionId || undefined,
      items: cart.map((item) => ({
        catalogItemId: item.catalogItemId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.lineDiscountAmount ?? 0,
      })),
      payments: paymentSummary.parsed.map((payment) => ({
        tenderType: payment.tenderType,
        amount: payment.amountValue,
        reference: payment.reference.trim() || undefined,
      })),
    };
  };

  const syncOfflineSales = async () => {
    setSyncOfflineSalesPending(true);
    try {
      const queue = loadQueuedPosSales();
      if (queue.length === 0) return;

      let synced = 0;
      let failed = 0;
      for (const entry of queue) {
        try {
          await fetchJson<CompletedSale>("/api/v2/retail/pos/sales", {
            method: "POST",
            body: JSON.stringify(entry.payload),
          });
          removeQueuedPosSale(entry.id);
          synced += 1;
        } catch (error) {
          failed += 1;
          bumpQueuedPosSaleRetry(entry.id);
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
            removeQueuedPosSale(entry.id);
          }
        }
      }
      refreshOfflineCount();
      if (synced > 0) {
        toast({
          title: "Offline sales synced",
          description: `${synced} queued sale${synced === 1 ? "" : "s"} posted.`,
          variant: "success",
        });
        queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
        queryClient.invalidateQueries({ queryKey: ["retail-pos-catalog"] });
        queryClient.invalidateQueries({ queryKey: ["retail-pos-sales"] });
      }
      if (failed > 0) {
        toast({
          title: "Some offline sales are still pending",
          description: `${failed} item${failed === 1 ? "" : "s"} will retry on next sync.`,
          variant: "warning",
        });
      }
    } finally {
      setSyncOfflineSalesPending(false);
    }
  };

  useEffect(() => {
    refreshOfflineCount();
    const onOnline = () => {
      void syncOfflineSales();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saleMutation = useMutation({
    mutationFn: (payload: PosSaleQueuePayload) =>
      fetchJson<CompletedSale>("/api/v2/retail/pos/sales", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      setLastCompletedSale(data);
      clearCart();
      queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
      queryClient.invalidateQueries({ queryKey: ["retail-pos-catalog"] });
      queryClient.invalidateQueries({ queryKey: ["retail-pos-sales"] });
      queryClient.invalidateQueries({ queryKey: ["retail-held-carts"] });
      router.prefetch(getPosPortalHref("history", isPosHost));
    },
    onError: (error, payload) => {
      const message = getApiErrorMessage(error);
      const isNetworkError =
        !(error instanceof ApiError) &&
        /network|failed to fetch|load failed/i.test(message);

      if (isNetworkError || (typeof navigator !== "undefined" && !navigator.onLine)) {
        queuePosSale(payload);
        refreshOfflineCount();
        clearCart();
        toast({
          title: "Sale queued offline",
          description: "This sale will auto-sync when the connection is back.",
          variant: "warning",
        });
        return;
      }

      toast({
        title: "Unable to post sale",
        description: message,
        variant: "destructive",
      });
    },
  });

  const value: PosPortalStateValue = {
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
    sites: sitesQuery.data ?? [],
    isPosHost,
    currentShift,
    currentShiftLoading: currentShiftQuery.isLoading,
    catalogItems: catalogQuery.data?.data ?? [],
    catalogLoading: catalogQuery.isLoading,
    promotions: promotionsQuery.data?.data ?? [],
    addToCart,
    updateQty: (catalogItemId, quantity) => {
      setCart((current) =>
        quantity <= 0
          ? current.filter((entry) => entry.catalogItemId !== catalogItemId)
          : current.map((entry) =>
              entry.catalogItemId === catalogItemId
                ? { ...entry, quantity }
                : entry,
            ),
      );
    },
    updateItemPrice: (catalogItemId, unitPrice) => {
      setCart((current) =>
        current.map((entry) =>
          entry.catalogItemId === catalogItemId ? { ...entry, unitPrice } : entry,
        ),
      );
    },
    updateItemDiscount: (catalogItemId, discountAmount) => {
      setCart((current) =>
        current.map((entry) =>
          entry.catalogItemId === catalogItemId
            ? { ...entry, lineDiscountAmount: discountAmount }
            : entry,
        ),
      );
    },
    removeFromCart: (catalogItemId) => {
      setCart((current) =>
        current.filter((entry) => entry.catalogItemId !== catalogItemId),
      );
    },
    replaceCartFromHeld: (input) => {
      setCart((input.items ?? []).map((item) => ({ ...item })));
      setCustomerName(input.customerName ?? "");
      setCustomerPhone("");
      setCustomerEmail("");
      setPayments([{ tenderType: "CASH", amount: "", reference: "" }]);
      setOrderDiscountAmount(input.orderDiscountAmount ?? "");
      setSelectedPromotionId(input.selectedPromotionId ?? "");
    },
    clearCart,
    canOverride: isManagerRole(currentShift?.actorRole),
    activePromotion,
    subtotal: checkout.subtotal,
    discountAmount: checkout.discountAmount,
    taxAmount: checkout.taxAmount,
    total: checkout.total,
    changeAmount: paymentSummary.changeAmount,
    tenderedTotal: paymentSummary.tenderedTotal,
    nonCashTotal: paymentSummary.nonCashTotal,
    postSale: () => {
      const payload = buildSalePayload();
      if (!payload) return;
      saleMutation.mutate(payload);
    },
    postSalePending: saleMutation.isPending,
    pendingOfflineSales,
    syncOfflineSales: () => {
      void syncOfflineSales();
    },
    syncOfflineSalesPending,
    lastCompletedSale,
    dismissCompletedSale: () => setLastCompletedSale(null),
  };

  return (
    <PosPortalStateContext.Provider value={value}>
      {children}
    </PosPortalStateContext.Provider>
  );
}

export function usePosPortalState() {
  const context = useContext(PosPortalStateContext);
  if (!context) {
    throw new Error("usePosPortalState must be used within PosPortalProvider");
  }
  return context;
}
