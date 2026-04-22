"use client";

import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOfflineRuntime } from "@/components/providers/offline-provider";
import { useToast } from "@/components/ui/use-toast";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  type PosSaleQueuePayload,
} from "@/lib/retail/pos-offline-queue";
import {
  isOfflineRetailCustomerId,
  listOfflineRetailOperations,
  queueOfflineRetailSale,
  searchOfflineRetailCustomers,
} from "@/lib/retail/offline-runtime";
import { calculateRetailCheckout } from "@/lib/retail/checkout";
import { getPosPortalHref } from "@/lib/retail/pos-host";
import {
  removeOfflineOperation,
  resetOfflineOperationToQueued,
} from "@/lib/offline/outbox";
import type { OfflineOutboxOperation } from "@/lib/offline/types";
import type {
  CartItem,
  CurrentShift,
  PaymentRow,
  PosCatalogItem,
  PosSite,
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
    pointsRedeemed?: number;
    pointsBalance: number;
    tier: string;
  } | null;
};

type CustomerLookupResult = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  loyaltyPoints: number;
  loyaltyTier: string;
};

type TenderPolicyPayload = {
  data: {
    requiredReferenceTenders: Array<PaymentRow["tenderType"]>;
    minReferenceLength: number;
  };
};

type PosQueuedSale = OfflineOutboxOperation<PosSaleQueuePayload>;

type PosPortalStateValue = {
  search: string;
  setSearch: (value: string) => void;
  cart: CartItem[];
  customerName: string;
  setCustomerName: (value: string) => void;
  selectedCustomerId: string | null;
  selectCustomer: (customer: CustomerLookupResult) => void;
  customerSearchResults: CustomerLookupResult[];
  customerSearchLoading: boolean;
  customerPhone: string;
  setCustomerPhone: (value: string) => void;
  customerEmail: string;
  setCustomerEmail: (value: string) => void;
  loyaltyRedemptionPoints: string;
  setLoyaltyRedemptionPoints: (value: string) => void;
  payments: PaymentRow[];
  setPayments: (value: PaymentRow[] | ((current: PaymentRow[]) => PaymentRow[])) => void;
  splitTenderMode: boolean;
  setSplitTenderMode: (value: boolean) => void;
  orderDiscountAmount: string;
  setOrderDiscountAmount: (value: string) => void;
  overrideReason: string;
  setOverrideReason: (value: string) => void;
  selectedPromotionId: string;
  setSelectedPromotionId: (value: string) => void;
  sites: PosSite[];
  defaultSiteId: string | null;
  defaultRegisterId: string | null;
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
  checkoutBaseBlockers: string[];
  pendingOfflineSales: number;
  queuedOfflineSales: PosQueuedSale[];
  retryOfflineSale: (id: string) => void;
  removeOfflineSale: (id: string) => void;
  syncOfflineSales: () => void;
  syncOfflineSalesPending: boolean;
  requiredReferenceTenders: Array<PaymentRow["tenderType"]>;
  minReferenceLength: number;
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
  const { syncNow, tenantKey } = useOfflineRuntime();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [loyaltyRedemptionPoints, setLoyaltyRedemptionPoints] = useState("");
  const [payments, setPayments] = useState<PaymentRow[]>([
    { tenderType: "CASH", amount: "", reference: "" },
  ]);
  const [splitTenderMode, setSplitTenderMode] = useState(false);
  const [orderDiscountAmount, setOrderDiscountAmount] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [selectedPromotionId, setSelectedPromotionId] = useState("");
  const [lastCompletedSale, setLastCompletedSale] = useState<CompletedSale | null>(null);
  const [pendingOfflineSales, setPendingOfflineSales] = useState(0);
  const [queuedOfflineSales, setQueuedOfflineSales] = useState<PosQueuedSale[]>([]);
  const [syncOfflineSalesPending, setSyncOfflineSalesPending] = useState(false);
  const [offlineCustomerResults, setOfflineCustomerResults] = useState<CustomerLookupResult[]>([]);

  const posContextQuery = useQuery({
    queryKey: ["pos-context"],
    queryFn: () =>
      fetchJson<{
        data: {
          defaultSiteId: string | null;
          defaultRegisterId: string | null;
          sites: PosSite[];
        };
      }>("/api/v2/retail/pos/context"),
  });
  const currentShiftQuery = useQuery({
    queryKey: ["retail-current-shift"],
    queryFn: () =>
      fetchJson<{ data: CurrentShift | null }>("/api/v2/retail/pos/current-shift"),
  });
  const currentShift = currentShiftQuery.data?.data ?? null;
  const siteId = currentShift?.siteId ?? "";
  const hasSeenOpenShiftRef = useRef(false);

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
  const tenderPolicyQuery = useQuery({
    queryKey: ["retail-pos-tender-policy"],
    queryFn: () =>
      fetchJson<TenderPolicyPayload>("/api/v2/retail/setup/tender-policy"),
  });
  const customerSearchQuery = useQuery({
    queryKey: ["retail-pos-customer-search", customerName],
    queryFn: () =>
      fetchJson<{ data: CustomerLookupResult[] }>(
        `/api/v2/retail/customers/search?q=${encodeURIComponent(customerName.trim())}&limit=8`,
      ),
    enabled: customerName.trim().length >= 2,
    staleTime: 15_000,
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
    setSelectedCustomerId(null);
    setCustomerPhone("");
    setCustomerEmail("");
    setLoyaltyRedemptionPoints("");
    setPayments([{ tenderType: "CASH", amount: "", reference: "" }]);
    setSplitTenderMode(false);
    setOrderDiscountAmount("");
    setOverrideReason("");
    setSelectedPromotionId("");
  };

  const refreshOfflineQueue = useCallback(async () => {
    if (!tenantKey) {
      setQueuedOfflineSales([]);
      setPendingOfflineSales(0);
      return;
    }
    const queue = await listOfflineRetailOperations(tenantKey);
    setQueuedOfflineSales(queue);
    setPendingOfflineSales(queue.length);
  }, [tenantKey]);

  const buildSalePayload = (): PosSaleQueuePayload | null => {
    if (!currentShift?.id || !siteId) return null;
    return {
      saleNo: createQueuedSaleNo(),
      shiftId: currentShift.id,
      siteId,
      customerId: selectedCustomerId ?? undefined,
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      customerEmail: customerEmail.trim() || undefined,
      loyaltyRedemptionPoints: Number(loyaltyRedemptionPoints || "0") || undefined,
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

  const syncOfflineSales = useCallback(async () => {
    setSyncOfflineSalesPending(true);
    try {
      await syncNow({ force: true });
      await refreshOfflineQueue();
    } finally {
      setSyncOfflineSalesPending(false);
    }
  }, [refreshOfflineQueue, syncNow]);

  useEffect(() => {
    void refreshOfflineQueue();
    const onOnline = () => {
      void syncOfflineSales();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [refreshOfflineQueue, syncOfflineSales]);

  useEffect(() => {
    if (customerName.trim().length < 2) {
      setOfflineCustomerResults([]);
      return;
    }
    if (!tenantKey) {
      setOfflineCustomerResults([]);
      return;
    }
    void searchOfflineRetailCustomers(tenantKey, customerName.trim()).then((results) =>
      setOfflineCustomerResults(results),
    );
  }, [customerName, tenantKey]);

  useEffect(() => {
    if (currentShift?.id) {
      hasSeenOpenShiftRef.current = true;
      return;
    }
    if (currentShiftQuery.isLoading) {
      return;
    }
    if (!hasSeenOpenShiftRef.current) {
      return;
    }
    void signOut({
      redirect: true,
      callbackUrl: isPosHost ? "/login" : "/portal/pos/login",
    });
  }, [currentShift?.id, currentShiftQuery.isLoading, isPosHost]);

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
      const usesOfflineCustomer = isOfflineRetailCustomerId(payload.customerId);

      if (
        tenantKey &&
        (isNetworkError ||
          (typeof navigator !== "undefined" && !navigator.onLine) ||
          usesOfflineCustomer)
      ) {
        void queueOfflineRetailSale({
          tenantKey,
          payload,
          customerTempId: usesOfflineCustomer ? payload.customerId : null,
        }).then(() => refreshOfflineQueue());
        clearCart();
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
    setCustomerName: (value) => {
      setCustomerName(value);
      if (selectedCustomerId) {
        setSelectedCustomerId(null);
      }
    },
    selectedCustomerId,
    selectCustomer: (customer) => {
      setSelectedCustomerId(customer.id);
      setCustomerName(customer.name);
      setCustomerPhone(customer.phone ?? "");
      setCustomerEmail(customer.email ?? "");
    },
    customerSearchResults: [
      ...offlineCustomerResults,
      ...(customerSearchQuery.data?.data ?? []).filter(
        (customer) => !offlineCustomerResults.some((offline) => offline.id === customer.id),
      ),
    ],
    customerSearchLoading: customerSearchQuery.isLoading,
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
    sites: posContextQuery.data?.data.sites ?? [],
    defaultSiteId: posContextQuery.data?.data.defaultSiteId ?? null,
    defaultRegisterId: posContextQuery.data?.data.defaultRegisterId ?? null,
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
      setSelectedCustomerId(null);
      setCustomerPhone("");
      setCustomerEmail("");
      setLoyaltyRedemptionPoints("");
      setPayments([{ tenderType: "CASH", amount: "", reference: "" }]);
      setSplitTenderMode(false);
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
    checkoutBaseBlockers: [
      ...(currentShift ? [] : ["Open a shift before checkout."]),
      ...(cart.length > 0 ? [] : ["Add at least one item to continue."]),
    ],
    pendingOfflineSales,
    queuedOfflineSales,
    retryOfflineSale: (id) => {
      void (async () => {
        setSyncOfflineSalesPending(true);
        await resetOfflineOperationToQueued(id);
        await syncNow({ force: true });
        await refreshOfflineQueue();
        setSyncOfflineSalesPending(false);
      })();
    },
    removeOfflineSale: (id) => {
      void removeOfflineOperation(id).then(() => refreshOfflineQueue());
    },
    syncOfflineSales: () => {
      void syncOfflineSales();
    },
    syncOfflineSalesPending,
    requiredReferenceTenders:
      tenderPolicyQuery.data?.data.requiredReferenceTenders ?? ["CARD", "MOBILE_MONEY"],
    minReferenceLength: tenderPolicyQuery.data?.data.minReferenceLength ?? 4,
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
