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
import { useOfflineRuntime } from "@corelithzw/module-offline/components/offline-provider";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { ApiError, fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
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
import {
  getCachedCategories,
  searchCatalog as searchOfflineCatalog,
} from "@/lib/retail/offline-catalog";
import { getPosPortalHref } from "@/lib/retail/pos-host";
import {
  removeOfflineOperation,
  resetOfflineOperationToQueued,
} from "@corelithzw/module-offline/outbox";
import type { OfflineOutboxOperation } from "@corelithzw/module-offline/types";
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

/** The tender rules the checkout screen enforces, carried on `pos/context`. */
type TillRules = {
  requiredReferenceTenders: Array<PaymentRow["tenderType"]>;
  minReferenceLength: number;
};

type PosQueuedSale = OfflineOutboxOperation<PosSaleQueuePayload>;

type PosPortalStateValue = {
  search: string;
  setSearch: (value: string) => void;
  categories: string[];
  selectedCategory: string | null;
  setSelectedCategory: (value: string | null) => void;
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

/**
 * A key for one checkout attempt. Never shown to anybody.
 *
 * S-7.7. This used to be sent as the sale's `saleNo`, which is why receipts
 * read `RSL-1787005857220984` instead of `S-005080`: the till was naming the
 * receipt when all it needed was to identify the attempt. It now travels as
 * `clientRef` and the server allocates the number a customer actually sees.
 *
 * `crypto.randomUUID` where it exists, with the old timestamp form behind it.
 *
 * The fallback is not decoration. `randomUUID` is only exposed in a **secure
 * context**, and the till's own dev host — `http://pos.<tenant>.…:3000` — is
 * neither HTTPS nor localhost, so it is genuinely undefined there: the first
 * sale rung after this change came through carrying the timestamp form. In
 * production behind TLS the uuid is used. Either way one device generating one
 * key per sale will not collide, and a collision would be caught by
 * `@@unique([companyId, clientRef])` rather than charging anybody twice.
 */
function createSaleClientRef() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
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
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
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
          rules: TillRules;
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
    queryKey: ["retail-pos-catalog", siteId, search, selectedCategory],
    queryFn: async () => {
      try {
        const params = new URLSearchParams({
          siteId,
          search,
        });
        if (selectedCategory) {
          params.set("category", selectedCategory);
        }
        return await fetchJson<{ data: PosCatalogItem[] }>(
          `/api/v2/retail/pos/catalog?${params.toString()}`,
        );
      } catch (error) {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          const data = await searchOfflineCatalog(search, {
            siteId,
            category: selectedCategory ?? undefined,
            inStockOnly: true,
          });
          return { data };
        }
        throw error;
      }
    },
    enabled: Boolean(siteId),
  });
  const categoriesQuery = useQuery({
    queryKey: ["retail-pos-catalog-categories", siteId],
    queryFn: async () => {
      try {
        return await fetchJson<{ data: string[] }>(
          `/api/v2/retail/pos/catalog/categories?siteId=${encodeURIComponent(siteId)}`,
        );
      } catch (error) {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          return { data: await getCachedCategories() };
        }
        throw error;
      }
    },
    enabled: Boolean(siteId),
    staleTime: 60_000,
  });
  const promotionsQuery = useQuery({
    queryKey: ["retail-pos-promotions"],
    queryFn: () =>
      fetchJson<{ data: Promotion[] }>("/api/v2/retail/promotions?status=ACTIVE&pos=1"),
    enabled: Boolean(siteId),
  });
  /*
    Tender rules now ride on `pos/context` above — see the comment on that
    route. There used to be a separate query here against
    `/api/v2/retail/setup/tender-policy`, which is gated on `retail.setup`
    `view`, a permission no cashier holds. It returned 403 on every till on
    every load, failed silently, and left checkout on the hard-coded defaults —
    so a shop's configured reference requirements were accepted in the back
    office and then quietly ignored at the counter. It surfaced only from
    dev-server logs during a screenshot run.
  */
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
          // S-3 — a Zimbabwean shelf price already contains the VAT. The cart
          // has to carve it out for the same reason the server does, or the
          // preview shows a total nobody is going to be charged.
          taxInclusive: item.taxInclusive ?? false,
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
          taxInclusive: item.taxInclusive ?? false,
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
      // Not `saleNo`. See `createSaleClientRef`.
      clientRef: createSaleClientRef(),
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
      /**
       * `productId`, not `catalogItemId`. S-4b, finished.
       *
       * The item master moved from `RetailCatalogItem` to `Product` and the
       * API moved with it — `saleLineSchema` in `app/api/v2/retail/pos/sales/route.ts`
       * requires `productId: z.string().uuid()`. This call site was never
       * updated, so **every sale the till posted came back 400 and the POS
       * could not sell at all.**
       *
       * Nothing caught it. Typecheck could not: the payload is assembled as an
       * object literal and posted as JSON, so the contract between the two
       * halves is only checked at runtime, by zod, in production. 466 unit
       * tests could not: none of them post a sale. It took ringing one through
       * the UI — `e2e/retail-workflows.spec.ts` — which is exactly the gate
       * `docs/retail/pos-production-readiness-2026-08-17.md` §4A said was
       * missing and why it said it mattered more than anything else on the list.
       *
       * The cart's own field keeps its name: `catalogItemId` is the React key
       * for a line and renaming it touches thirty call sites for no gain. What
       * it holds *is* a `Product.id` — `addToCart` sets it from
       * `PosCatalogItem.id`, which `loadSellableProducts` sets from
       * `product.id`. Only the wire name was wrong.
       */
      items: cart.map((item) => ({
        productId: item.catalogItemId,
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
    const availableCategories = categoriesQuery.data?.data ?? [];
    if (
      selectedCategory &&
      availableCategories.length > 0 &&
      !availableCategories.includes(selectedCategory)
    ) {
      setSelectedCategory(null);
    }
  }, [categoriesQuery.data?.data, selectedCategory]);

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
    categories: categoriesQuery.data?.data ?? [],
    selectedCategory,
    setSelectedCategory,
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
    // A genuine fallback now, for the moments before context lands — not the
    // permanent state it was while the old endpoint 403'd. Kept in step with
    // `DEFAULT_RETAIL_TENDER_POLICY` in `lib/retail/tender-policy.ts`.
    requiredReferenceTenders:
      posContextQuery.data?.data.rules?.requiredReferenceTenders ?? ["CARD", "MOBILE_MONEY"],
    minReferenceLength: posContextQuery.data?.data.rules?.minReferenceLength ?? 4,
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
