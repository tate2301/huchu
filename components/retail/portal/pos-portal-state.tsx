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
import { useOfflineRuntime } from "@/components/offline/offline-runtime";
import { useHasFeature } from "@/hooks/use-entitlement";
import { useToast } from "@/components/ui/use-toast";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { queuedSaleLabel, type PosSaleQueuePayload } from "@/lib/retail/pos-offline-queue";
import {
  isOfflineRetailCustomerId,
  listOfflineRetailOperations,
  queueOfflineRetailSale,
  searchOfflineRetailCustomers,
} from "@/lib/retail/offline-runtime";
import { calculateRetailCheckout } from "@/lib/retail/checkout";
import { depositsDue, lineDeposit } from "@/lib/retail/deposits";
import { splitChange } from "@/lib/retail/payment-words";
import { liquorSaleRefusal, shopFeatures } from "@/lib/retail/shop-profile-rules";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { getPosPortalHref } from "@/lib/retail/pos-host";
import {
  removeOfflineOperation,
  resetOfflineOperationToQueued,
} from "@/lib/offline/outbox";
import type { OfflineOutboxOperation } from "@/lib/offline/types";
// Type-only: erased at build, so the server module never reaches the client bundle.
import type { TillFiscalStatus } from "@/lib/retail/fiscalisation";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import type {
  CartItem,
  CurrentShift,
  PaymentRow,
  PosCatalogItem,
  Promotion,
} from "./pos-types";
import { getPaymentSummary } from "./pos-utils";
// Type-only, like `TillFiscalStatus` above.
import type { TillContext } from "@/lib/retail/devices";
import { receiptContent, receiptDoc, type ReceiptDoc } from "@/lib/retail/receipt-words";
import { printReceipt } from "@/components/retail/receipt-print";
import { markPairedTill } from "@/lib/retail/till-presence";
import { offlineStopSentence, offlineWindowClosed } from "@/lib/retail/till-on-device";
import { usePosDeviceWatch } from "./pos-device-watch";

type CompletedSale = {
  id: string;
  saleNo: string;
  customerName?: string | null;
  customerPhone?: string | null;
  totalAmount: number;
  /** Bottle deposits charged on top of the goods. */
  depositAmount?: number;
  changeAmount: number;
  /** The change as it is handed back (W-05): whole US dollars, then ZiG notes. */
  changeUsd?: number;
  changeZig?: number;
  postedAt: string;
  loyalty?: {
    pointsEarned: number;
    pointsRedeemed?: number;
    pointsBalance: number;
    tier: string;
  } | null;
  /** The sale's place on the ZIMRA chain, decided the moment it was posted. */
  fiscal?: TillFiscalStatus | null;
  /** Its receipt as Setup › Receipts says to print it (SET-07), and how many copies. */
  receipt?: { doc: ReceiptDoc; copies: 1 | 2 } | null;
  /** Rung offline: kept on this till until the line is back, so it has no number or fiscal line yet. */
  queued?: boolean;
};

type CustomerLookupResult = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  loyaltyPoints: number;
  loyaltyTier: string;
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
  /** This device is one of the shop's tills. False only on price check, which works before pairing. */
  paired: boolean;
  /** This device's till, its site and what it knows (`devices/me`); null until it lands. */
  till: TillContext | null;
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
  /** Empties the customer brought back against a returnable line. */
  updateEmptiesBack: (catalogItemId: string, emptiesBack: number) => void;
  /** Deposits on returnable bottles, net of empties back. Inside `total`. */
  depositAmount: number;
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
  /** Why the till may not sell offline any longer (the till rules' offline window), or null. */
  offlineStop: string | null;
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
  /** Print the last sale's receipt (again): its copies, through the print dialog, then mark it printed. */
  printLastReceipt: () => void;
  /** The basket has alcohol in it and nobody has looked at the customer's ID yet. */
  needsIdCheck: boolean;
  /** Ask the cashier to check ID. Resolves true when they have. */
  checkId: () => Promise<boolean>;
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
  paired,
}: PropsWithChildren<{ isPosHost?: boolean; paired: boolean }>) {
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { syncNow, tenantKey, lastOnlineAt, isOffline } = useOfflineRuntime();
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
  /** The cashier has checked this customer's ID. One check covers the basket. */
  const [idChecked, setIdChecked] = useState(false);
  /** The clock the offline window is read against, a minute at a time. */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // A device that stops being a till goes to /unpaired at its next request,
  // sending what it held offline first (W-76). A device that is not a till
  // yet (price check) asks nothing of the device routes.
  usePosDeviceWatch(isPosHost, paired);
  useEffect(() => {
    markPairedTill(paired);
    return () => markPairedTill(false);
  }, [paired]);

  const tillQuery = useQuery({
    queryKey: ["till-context"],
    queryFn: () => fetchJson<{ data: TillContext }>("/api/v2/retail/devices/me"),
    staleTime: 60_000,
    enabled: paired,
  });
  const till = tillQuery.data?.data ?? null;
  const currentShiftQuery = useQuery({
    queryKey: ["retail-current-shift"],
    queryFn: () =>
      fetchJson<{ data: CurrentShift | null }>("/api/v2/retail/pos/current-shift"),
    enabled: paired,
  });
  const currentShift = currentShiftQuery.data?.data ?? null;
  const siteId = currentShift?.siteId ?? till?.site.id ?? "";
  const hasSeenOpenShiftRef = useRef(false);

  const catalogQuery = useQuery({
    queryKey: ["retail-pos-catalog", siteId, search, selectedCategory],
    /*
      Offline, this throws and TanStack keeps the persisted result on screen.
      It used to catch and answer from a separate IndexedDB catalog that
      nothing ever filled, so going offline replaced the till's cached
      catalog with an empty one.
    */
    queryFn: () => {
      const params = new URLSearchParams({
        siteId,
        search,
      });
      if (selectedCategory) {
        params.set("category", selectedCategory);
      }
      return fetchJson<{ data: PosCatalogItem[] }>(
        `/api/v2/retail/pos/catalog?${params.toString()}`,
      );
    },
    enabled: Boolean(siteId),
  });
  const categoriesQuery = useQuery({
    queryKey: ["retail-pos-catalog-categories", siteId],
    queryFn: () =>
      fetchJson<{ data: string[] }>(
        `/api/v2/retail/pos/catalog/categories?siteId=${encodeURIComponent(siteId)}`,
      ),
    enabled: Boolean(siteId),
    staleTime: 60_000,
  });
  /*
    Ask for promotions only when the shop has them.

    Two things were wrong here and they had opposite fixes. The endpoint is
    gated on `retail.promotions`, which the `CASHIER` role template did not
    grant — so every till took a 403 and no promotion ever came off a basket,
    on shops that had bought the feature and configured one. That was a
    genuine hole and the template now grants it.

    But a shop that has *not* bought promotions is a different case, and asking
    anyway is the `unentitled-accounting-api-403` shape: the right outcome —
    no promotions — reached by making a request that should never have left.
    `useHasFeature` is the signal, and gating on it means the console stays
    clean for the shops where the answer is honestly "none".
  */
  const hasPromotions = useHasFeature("retail.promotions");
  const promotionsQuery = useQuery({
    queryKey: ["retail-pos-promotions"],
    queryFn: () =>
      fetchJson<{ data: Promotion[] }>("/api/v2/retail/promotions?status=ACTIVE&pos=1"),
    enabled: Boolean(siteId) && hasPromotions,
  });
  /*
    The till rules ride on `devices/me` (the till's context), which a cashier
    can always read (SET-06).
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

  // Deposits sit outside the goods total the receipt is signed for; the
  // customer pays both.
  const depositAmount = useMemo(() => depositsDue(cart), [cart]);
  const amountDue = Number((checkout.total + depositAmount).toFixed(2));

  const paymentSummary = useMemo(
    () => getPaymentSummary(payments, amountDue, till?.zig ? Number(till.zig.rate) : null),
    [payments, amountDue, till?.zig],
  );

  const shop = till?.shop ?? null;
  const ageCheckOn = shop ? shopFeatures(shop).ageCheck : false;
  const depositsOn = shop ? shopFeatures(shop).emptiesAndDeposits : false;
  const needsIdCheck = ageCheckOn && !idChecked && cart.some((item) => item.ageRestricted);

  const checkId = async (what = "alcohol") => {
    const checked = await dsConfirm({
      title: "Check the customer's ID",
      description: `${what} is for over-18s. Look at their ID before you sell it.`,
      confirmLabel: "ID checked, over 18",
      cancelLabel: "Don't sell",
      variant: "warning",
    });
    if (checked) setIdChecked(true);
    return checked;
  };

  /**
   * Put a product in the basket, or say why it can't go in.
   *
   * On a liquor store, alcohol outside licence hours is refused here, before
   * the customer has paid, and the first bottle in a basket asks the cashier to
   * check ID. The server checks both again on every sale.
   */
  const addToCart = (item: PosCatalogItem) => {
    void (async () => {
      if (item.ageRestricted && shop) {
        const refusal = liquorSaleRefusal({
          profile: shop,
          ageRestricted: [item.name],
          idChecked: true,
          at: new Date(),
        });
        if (refusal) {
          toast({ title: "Not in licence hours", description: refusal, variant: "destructive" });
          return;
        }
        if (ageCheckOn && !idChecked && !(await checkId(item.name))) return;
      }
      putInCart(item);
    })();
  };

  const putInCart = (item: PosCatalogItem) => {
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
          ageRestricted: item.ageRestricted ?? false,
          returnable: depositsOn && Boolean(item.returnable),
          depositAmount: depositsOn ? (item.depositAmount ?? null) : null,
          emptiesBack: 0,
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
    setIdChecked(false);
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

  /*
    SET-06, W-64. "Keep selling offline for up to": past the window (the
    server's last answer, or the oldest sale still held, older than the
    rule), a sale no longer goes into the offline queue. The server only
    marks a late sale for review; stopping the till is the device's job.
  */
  const oldestQueuedAt = queuedOfflineSales.reduce<string | null>(
    (oldest, operation) => (!oldest || operation.createdAt < oldest ? operation.createdAt : oldest),
    null,
  );
  const offlineStop = (at: number) =>
    till && offlineWindowClosed({ offlineHours: till.rules.offlineHours, lastOnlineAt, oldestQueuedAt, now: at })
      ? offlineStopSentence(till.rules.offlineHours)
      : null;
  const offlineBlocker = isOffline ? offlineStop(now) : null;

  const buildSalePayload = (): PosSaleQueuePayload | null => {
    // The site is the shift's, which the server takes from the till.
    if (!currentShift?.id) return null;
    return {
      // Not `saleNo`. See `createSaleClientRef`.
      clientRef: createSaleClientRef(),
      shiftId: currentShift.id,
      customerId: selectedCustomerId ?? undefined,
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      customerEmail: customerEmail.trim() || undefined,
      loyaltyRedemptionPoints: Number(loyaltyRedemptionPoints || "0") || undefined,
      discountAmount: Number(orderDiscountAmount || "0") || undefined,
      overrideReason: overrideReason.trim() || undefined,
      promotionId: selectedPromotionId || undefined,
      idChecked: idChecked || undefined,
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
        ...(item.emptiesBack ? { emptiesBack: item.emptiesBack } : {}),
      })),
      payments: paymentSummary.parsed.map((payment) => ({
        tenderType: payment.tenderType,
        amount: payment.amountValue,
        ...(payment.currency ? { currency: payment.currency } : {}),
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
    // Back to "Who is selling?" on the till.
    void signOut({
      redirect: true,
      callbackUrl: isPosHost ? "/" : "/portal/pos/login",
    });
  }, [currentShift?.id, currentShiftQuery.isLoading, isPosHost]);

  /**
   * The sale's receipt through the print dialog, then `printedAt` on the sale
   * (onboarding's test sale reads it). A sale still held offline has no row
   * to mark yet.
   */
  const printSaleReceipt = async (sale: CompletedSale) => {
    if (!sale.receipt) return;
    await printReceipt(sale.receipt.doc, sale.receipt.copies);
    if (sale.queued) return;
    await fetchJson(`/api/v2/retail/pos/sales/${encodeURIComponent(sale.id)}/printed`, { method: "POST" }).catch(() => null);
  };

  /**
   * The basket as it is charged, as a finished sale on this till (SET-07):
   * what a sale rung offline shows and prints, laid out from the till's
   * receipt settings like the server's — the lines and deposits, the total,
   * the payments and the change as the cashier hands it back. No fiscal line:
   * the sale is signed when it reaches the server.
   */
  const basketAsSale = (payload: PosSaleQueuePayload): CompletedSale => {
    const change = splitChange(
      paymentSummary.changeAmount,
      till?.zig ? { rate: Number(till.zig.rate), rounding: till.zig.rounding } : null,
    );
    const receipt = till
      ? {
          doc: receiptDoc(
            till.receipt,
            receiptContent({
              lines: cart.map((item) => ({
                name: item.name,
                quantity: item.quantity,
                amount: checkout.lines.find((line) => line.id === item.catalogItemId)?.lineTotal ?? 0,
                deposit: lineDeposit(item),
              })),
              total: amountDue,
              currency: till.receipt.currency,
              payments: payload.payments.filter((payment) => payment.amount > 0),
              change,
              fiscal: null,
            }),
          ),
          copies: till.receipt.copies,
        }
      : null;
    return {
      id: payload.clientRef,
      saleNo: queuedSaleLabel(payload),
      customerName: payload.customerName ?? null,
      totalAmount: checkout.total,
      depositAmount,
      changeAmount: change.value,
      changeUsd: change.usd,
      changeZig: change.zig,
      postedAt: new Date().toISOString(),
      receipt,
      queued: true,
    };
  };

  const saleMutation = useMutation({
    mutationFn: (payload: PosSaleQueuePayload) =>
      fetchJson<CompletedSale>("/api/v2/retail/pos/sales", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      setLastCompletedSale(data);
      // A till with a receipt printer prints every sale's receipt as it is rung (SET-07).
      if (till?.till.hasPrinter && data.receipt) void printSaleReceipt(data);
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
        // Past the till rules' offline window the sale is not kept: the
        // basket stays, to charge once the till is back online.
        const stop = offlineStop(Date.now());
        if (stop) {
          toast({ title: "That sale was not saved", description: stop, variant: "destructive" });
          return;
        }
        void queueOfflineRetailSale({
          tenantKey,
          payload,
          customerTempId: usesOfflineCustomer ? payload.customerId : null,
        }).then(() => refreshOfflineQueue());
        // The customer still gets a receipt: printed here from the till's settings, in its copies (SET-07).
        const held = basketAsSale(payload);
        setLastCompletedSale(held);
        if (till?.till.hasPrinter && held.receipt) void printSaleReceipt(held);
        clearCart();
        return;
      }

      toast({
        title: "That sale was not saved",
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
    paired,
    till,
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
    updateEmptiesBack: (catalogItemId, emptiesBack) => {
      setCart((current) =>
        current.map((entry) =>
          entry.catalogItemId === catalogItemId
            ? { ...entry, emptiesBack: Math.min(Math.max(Math.floor(emptiesBack), 0), Math.floor(entry.quantity)) }
            : entry,
        ),
      );
    },
    depositAmount,
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
      // A recalled basket may be a different customer: check again at Charge.
      setIdChecked(false);
    },
    clearCart,
    // Approving without a manager is `retail.sell:approve` on the Roles board.
    canOverride: canRetailRoleDo(currentShift?.actorRole, "retail.sell", "approve"),
    activePromotion,
    subtotal: checkout.subtotal,
    discountAmount: checkout.discountAmount,
    taxAmount: checkout.taxAmount,
    total: amountDue,
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
      ...(currentShift ? [] : ["Open a shift first"]),
      ...(cart.length > 0 ? [] : ["Add a product first"]),
      ...(offlineBlocker ? [offlineBlocker] : []),
    ],
    offlineStop: offlineBlocker,
    needsIdCheck,
    checkId: () => checkId(),
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
    // For the moments before context lands: the till rules' defaults (SET-06).
    requiredReferenceTenders: till?.rules.requiredReferenceTenders ?? ["CARD", "ECOCASH", "INNBUCKS"],
    minReferenceLength: till?.rules.minReferenceLength ?? 4,
    lastCompletedSale,
    dismissCompletedSale: () => setLastCompletedSale(null),
    printLastReceipt: () => {
      if (lastCompletedSale?.receipt) void printSaleReceipt(lastCompletedSale);
    },
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
