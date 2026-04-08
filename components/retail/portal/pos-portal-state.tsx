"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { fetchSites } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
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
  totalAmount: number;
  changeAmount: number;
  postedAt: string;
};

type PosPortalStateValue = {
  search: string;
  setSearch: (value: string) => void;
  cart: CartItem[];
  customerName: string;
  setCustomerName: (value: string) => void;
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
  lastCompletedSale: CompletedSale | null;
  dismissCompletedSale: () => void;
};

const PosPortalStateContext = createContext<PosPortalStateValue | null>(null);

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
  const [payments, setPayments] = useState<PaymentRow[]>([
    { tenderType: "CASH", amount: "", reference: "" },
  ]);
  const [orderDiscountAmount, setOrderDiscountAmount] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [selectedPromotionId, setSelectedPromotionId] = useState("");
  const [lastCompletedSale, setLastCompletedSale] = useState<CompletedSale | null>(null);

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
    setPayments([{ tenderType: "CASH", amount: "", reference: "" }]);
    setOrderDiscountAmount("");
    setOverrideReason("");
    setSelectedPromotionId("");
  };

  const saleMutation = useMutation({
    mutationFn: () =>
      fetchJson<CompletedSale>("/api/v2/retail/pos/sales", {
        method: "POST",
        body: JSON.stringify({
          shiftId: currentShift?.id,
          siteId,
          customerName: customerName.trim() || undefined,
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
        }),
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
    onError: (error) =>
      toast({
        title: "Unable to post sale",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const value: PosPortalStateValue = {
    search,
    setSearch,
    cart,
    customerName,
    setCustomerName,
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
    postSale: () => saleMutation.mutate(),
    postSalePending: saleMutation.isPending,
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
