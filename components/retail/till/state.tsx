"use client";

/**
 * The till's state: the sale on the counter, how it is paid, and what the till
 * knows about where it stands. One provider for every till screen, so a sale
 * survives a trip to Held or History and back.
 *
 * What the till knows comes from the device: `devices/me` (its till, site,
 * shop profile, tenders, ZiG rate, till rules, approvers and licence hours),
 * and the heartbeat every minute (last seen, and the back office's messages).
 * The till asks the till rules first and the server asks them again on every
 * sale: a manager's PIN (409 `needsApprover`, 423 locked), the ID check,
 * licence hours, references and the discount ceiling.
 *
 * Offline, a sale is queued in the outbox and replayed through `pos/sales`
 * (`lib/offline/module-registry.ts`) when the line returns, until the till
 * rules' offline window closes. The queue is on this device only, and a
 * manager's PIN never goes into it.
 *
 * The device watch: the first 401 `DEVICE_UNPAIRED` from any request sends
 * what the till holds, signs the person out and shows /unpaired; a 409
 * `NOT_A_TILL` signs out and shows /pair.
 */

import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useOfflineRuntime } from "@/components/offline/offline-runtime";
import { useHasFeature } from "@/hooks/use-entitlement";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { removeOfflineOperation, resetOfflineOperationToQueued } from "@/lib/offline/outbox";
import type { OfflineOutboxOperation } from "@/lib/offline/types";
import { calculateRetailCheckout } from "@/lib/retail/checkout";
import { depositsDue, emptiesCounted } from "@/lib/retail/deposits";
import { alcoholVerdict, type AlcoholVerdict } from "@/lib/retail/licence-hours";
import { LOYALTY_REDEEM_POINTS_PER_USD } from "@/lib/retail/loyalty-rules";
import {
  isOfflineRetailCustomerId,
  listOfflineRetailOperations,
  queueOfflineRetailSale,
  searchOfflineRetailCustomers,
} from "@/lib/retail/offline-runtime";
import { splitChange } from "@/lib/retail/payment-words";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import type { PosSaleQueuePayload } from "@/lib/retail/pos-offline-queue";
import { getPosPortalHref } from "@/lib/retail/pos-host";
import { shopFeatures } from "@/lib/retail/shop-profile-rules";
import { cashDropDue, cashDropSentence, offlineStopSentence, offlineWindowClosed } from "@/lib/retail/till-on-device";
import { markPairedTill } from "@/lib/retail/till-presence";
import { referenceSentence } from "@/lib/retail/till-rule-words";
import { paymentLabel } from "./format";
import { discountApprovalReason, discountCeilingProblem, paymentSummary, type RuledLine } from "./sale-rules";
import type {
  Approval,
  Approver,
  CartItem,
  CompletedSale,
  CurrentShift,
  CustomerLookupResult,
  PaymentRow,
  PosCatalogItem,
  Promotion,
  SaleRefusal,
  SavedSale,
  TillCategory,
  TillContext,
  TillMessage,
} from "./types";

type PosQueuedSale = OfflineOutboxOperation<PosSaleQueuePayload>;

/** The till's own context, persisted with the tenant's cache so it is there offline. */
export const TILL_CONTEXT_KEY = ["till-context"] as const;
/** The heartbeat: last seen, and the back office's messages. */
export const TILL_HEARTBEAT_KEY = ["till-heartbeat"] as const;
const HEARTBEAT_MS = 60_000;
/** Survives a reload, dies with the tab: the shift the cash drop prompt has already asked about. */
const CASH_DROP_ASKED_KEY = "till_cash_drop_asked";

const round = (value: number) => Number(value.toFixed(2));
const CASH_ROW: PaymentRow = { tenderType: "CASH", amount: "", reference: "" };

/** A key for one checkout attempt; the server numbers the receipt. Not a secure context on a dev POS host, hence the fallback. */
function createSaleClientRef() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `RSL-${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

/** A short tag off a sale's key, for a sale saved on the till: its number comes when it is sent. */
function savedTag(clientRef: string) {
  return clientRef.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase();
}

function lineFromItem(item: PosCatalogItem, depositsOn: boolean): CartItem {
  return {
    id: item.id,
    name: item.name,
    catalogItemId: item.id,
    quantity: 1,
    unitPrice: item.unitPrice,
    shelfPrice: item.unitPrice,
    taxPercent: item.taxPercent,
    taxInclusive: item.taxInclusive,
    compareAtPrice: item.compareAtPrice,
    lineDiscountAmount: 0,
    unit: item.inventoryItem?.unit,
    stock: item.inventoryItem?.currentStock,
    ageRestricted: item.ageRestricted,
    returnable: depositsOn && item.returnable,
    depositAmount: depositsOn ? item.depositAmount : null,
    emptiesBack: 0,
    maxDiscountPercent: item.maxDiscountPercent,
    openableCase: item.openableCase,
  };
}

/** Whether a line's price or discount differs from the shelf: the sale then keeps a reason. */
export function lineIsChanged(item: CartItem) {
  return item.lineDiscountAmount > 0.009 || Math.abs(item.unitPrice - item.shelfPrice) > 0.009;
}

const ruled = (item: CartItem): RuledLine => ({
  name: item.name,
  quantity: item.quantity,
  unitPrice: item.unitPrice,
  shelfPrice: item.shelfPrice,
  lineDiscountAmount: item.lineDiscountAmount,
  maxDiscountPercent: item.maxDiscountPercent,
});

/** A refusal that says this device is not (or no longer) a till. */
function deviceRefusalOf(error: unknown): "DEVICE_UNPAIRED" | "NOT_A_TILL" | null {
  if (!(error instanceof ApiError)) return null;
  const code = (error.details as { code?: unknown } | undefined)?.code;
  if (error.status === 401 && code === "DEVICE_UNPAIRED") return "DEVICE_UNPAIRED";
  if (error.status === 409 && code === "NOT_A_TILL") return "NOT_A_TILL";
  return null;
}

/** `pos/sales`'s no, as the screens act on it. */
function saleRefusalOf(error: unknown): SaleRefusal {
  const message = getApiErrorMessage(error, "That sale was not saved.");
  if (error instanceof ApiError && error.status === 423) return { kind: "pin-locked", message };
  const details = error instanceof ApiError ? (error.details as { needsApprover?: unknown; fieldErrors?: Record<string, unknown> } | undefined) : undefined;
  if (error instanceof ApiError && error.status === 409 && details?.needsApprover === true) {
    const field = details.fieldErrors?.pin ? "pin" : details.fieldErrors?.approver ? "approver" : null;
    return { kind: "needs-approver", message, field };
  }
  return { kind: "refused", message };
}

function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string | null) {
  try {
    if (value) window.sessionStorage.setItem(key, value);
    else window.sessionStorage.removeItem(key);
  } catch {
    // Storage blocked: the till asks again after a reload, which is harmless.
  }
}

function useClockMinute() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/**
 * The device watch (10-setup W-76). Every POS route answers 401
 * `DEVICE_UNPAIRED` once a manager unpairs this device or pairs another to
 * its till, and 409 `NOT_A_TILL` when it is not a till (never was, or its
 * till was closed). The first such answer, from any query or mutation, ends
 * the session here: unpaired, what the device held offline is sent first
 * (`pos/sales` still takes sales rung before the unpairing, flagged for a
 * manager) and /unpaired counts how many went; not a till, it goes to /pair.
 */
function useDeviceWatch(isPosHost: boolean, paired: boolean) {
  const queryClient = useQueryClient();
  const { syncNow, tenantKey } = useOfflineRuntime();
  const leaving = useRef(false);

  useEffect(() => {
    if (!paired) return;
    const base = isPosHost ? "" : "/portal/pos";
    const leave = async (refusal: "DEVICE_UNPAIRED" | "NOT_A_TILL") => {
      if (leaving.current) return;
      leaving.current = true;
      if (refusal === "DEVICE_UNPAIRED" && tenantKey && (await listOfflineRetailOperations(tenantKey)).length > 0) {
        try {
          await syncNow({ force: true });
        } catch {
          // What could not be sent stays queued on this device.
        }
      }
      await signOut({ redirect: false });
      window.location.assign(`${base}${refusal === "DEVICE_UNPAIRED" ? "/unpaired" : "/pair"}`);
    };
    const check = (error: unknown) => {
      const refusal = deviceRefusalOf(error);
      if (refusal) void leave(refusal);
    };
    const queries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "error") check(event.action.error);
    });
    const mutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "error") check(event.action.error);
    });
    return () => {
      queries();
      mutations();
    };
  }, [isPosHost, paired, queryClient, syncNow, tenantKey]);
}

type SaleAttempt = { payload: PosSaleQueuePayload; approver: Approver | null; handed: number; changeOwed: number };

function useTillStateValue({ isPosHost, paired }: { isPosHost: boolean; paired: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { syncNow, tenantKey, isOffline, lastOnlineAt } = useOfflineRuntime();
  const now = useClockMinute();

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerNameRaw] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerLookupResult | null>(null);
  const [loyaltyRedemptionPoints, setLoyaltyRedemptionPoints] = useState("");
  const [payments, setPayments] = useState<PaymentRow[]>([CASH_ROW]);
  const [orderDiscountAmount, setOrderDiscountAmount] = useState("");
  const [selectedPromotionId, setSelectedPromotionId] = useState("");
  /** The cashier has looked at this customer's ID. One check covers the sale. */
  const [idChecked, setIdChecked] = useState(false);
  const [heldAs, setHeldAs] = useState<string | null>(null);
  const [lastCompletedSale, setLastCompletedSale] = useState<CompletedSale | null>(null);
  const [lastSavedSale, setLastSavedSale] = useState<SavedSale | null>(null);
  const [saleRefusal, setSaleRefusal] = useState<SaleRefusal | null>(null);
  const [queuedOfflineSales, setQueuedOfflineSales] = useState<PosQueuedSale[]>([]);
  const [syncOfflineSalesPending, setSyncOfflineSalesPending] = useState(false);
  const [offlineCustomerResults, setOfflineCustomerResults] = useState<CustomerLookupResult[]>([]);
  const [cashDropAsked, setCashDropAsked] = useState<string | null>(null);

  /* ── The device ─────────────────────────────────────────────────────── */

  useDeviceWatch(isPosHost, paired);
  // The offline warm-ups ask for the shift and what hangs off it only on a paired till.
  useEffect(() => {
    markPairedTill(paired);
    return () => markPairedTill(false);
  }, [paired]);

  const contextQuery = useQuery({
    queryKey: TILL_CONTEXT_KEY,
    queryFn: async () => (await fetchJson<{ data: TillContext }>("/api/v2/retail/devices/me")).data,
    staleTime: 60_000,
    enabled: paired,
  });
  const context = contextQuery.data ?? null;
  const rules = context?.rules ?? null;
  const features = context ? shopFeatures(context.shop) : null;

  const heartbeatQuery = useQuery({
    queryKey: TILL_HEARTBEAT_KEY,
    queryFn: () => fetchJson<{ messages: TillMessage[] }>("/api/v2/retail/devices/heartbeat", { method: "POST", body: "{}" }),
    refetchInterval: HEARTBEAT_MS,
    refetchIntervalInBackground: true,
    retry: false,
    enabled: paired,
  });
  const dismissMessageMutation = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/v2/retail/devices/messages/${encodeURIComponent(id)}/dismiss`, { method: "POST" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: TILL_HEARTBEAT_KEY }),
  });

  const currentShiftQuery = useQuery({
    queryKey: ["retail-current-shift"],
    queryFn: () => fetchJson<{ data: CurrentShift | null }>("/api/v2/retail/pos/current-shift"),
    enabled: paired,
  });
  // `pos/current-shift` answers with the person's open shift on this till only.
  const currentShift = currentShiftQuery.data?.data ?? null;
  const shiftHere = currentShift && context && currentShift.registerId === context.till.id ? currentShift : null;
  const siteId = context?.site.id ?? null;

  /* ── The shelf ──────────────────────────────────────────────────────── */

  const catalogQuery = useQuery({
    // The same key the offline warm-up fills for the whole shelf (`["retail-pos-catalog", siteId, ""]`).
    queryKey: ["retail-pos-catalog", siteId, search, ...(selectedCategory ? [selectedCategory] : [])],
    queryFn: () => {
      const params = new URLSearchParams({ search });
      if (selectedCategory) params.set("category", selectedCategory);
      return fetchJson<{ data: PosCatalogItem[] }>(`/api/v2/retail/pos/catalog?${params.toString()}`);
    },
    enabled: Boolean(shiftHere && siteId),
  });
  const categoriesQuery = useQuery({
    queryKey: ["retail-pos-catalog-categories", siteId],
    queryFn: () => fetchJson<{ data: TillCategory[] }>("/api/v2/retail/pos/catalog/categories"),
    enabled: Boolean(shiftHere && siteId),
    staleTime: 60_000,
  });
  // Only when the shop has promotions: asking otherwise is a refusal waiting to happen.
  const hasPromotions = useHasFeature("retail.promotions");
  const promotionsQuery = useQuery({
    queryKey: ["retail-pos-promotions"],
    queryFn: () => fetchJson<{ data: Promotion[] }>("/api/v2/retail/promotions?status=ACTIVE&pos=1"),
    enabled: Boolean(shiftHere) && hasPromotions,
  });
  // The name as typed settles for a moment before it is searched, online or on the till.
  const [customerSearch, setCustomerSearch] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setCustomerSearch(customerName.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [customerName]);
  const customerSearchQuery = useQuery({
    queryKey: ["retail-pos-customer-search", customerSearch],
    queryFn: () =>
      fetchJson<{ data: CustomerLookupResult[] }>(`/api/v2/retail/customers/search?q=${encodeURIComponent(customerSearch)}&limit=8`),
    enabled: customerSearch.length >= 2 && !selectedCustomer,
    staleTime: 15_000,
  });

  /* ── Licence hours: 18+ lines stop, the rest of the sale goes on ─────── */

  const licenceHours = context?.licenceHours;
  const alcohol: AlcoholVerdict = useMemo(
    () => (features?.licenceHours && licenceHours ? alcoholVerdict(licenceHours, now) : ({ sellable: true } as const)),
    [features?.licenceHours, licenceHours, now],
  );
  const lineStopped = useCallback((item: CartItem) => item.ageRestricted && !alcohol.sellable, [alcohol.sellable]);
  const sellingLines = useMemo(() => cart.filter((item) => !lineStopped(item)), [cart, lineStopped]);

  /* ── What the sale comes to ─────────────────────────────────────────── */

  const activePromotion = useMemo(
    () => (promotionsQuery.data?.data ?? []).find((promotion) => promotion.id === selectedPromotionId) ?? null,
    [promotionsQuery.data?.data, selectedPromotionId],
  );
  const checkout = useMemo(
    () =>
      calculateRetailCheckout({
        lines: sellingLines.map((item) => ({
          id: item.catalogItemId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxPercent: item.taxPercent,
          taxInclusive: item.taxInclusive,
          lineDiscountAmount: item.lineDiscountAmount,
        })),
        orderDiscountAmount: Number(orderDiscountAmount || "0"),
        promotion: activePromotion ? { id: activePromotion.id, type: activePromotion.type, value: activePromotion.value } : null,
      }),
    [activePromotion, sellingLines, orderDiscountAmount],
  );
  // Deposits sit outside the goods total; the customer pays both. Net of the empties each line took back.
  const depositTotal = useMemo(() => depositsDue(sellingLines), [sellingLines]);
  const emptiesBackCount = sellingLines.reduce((sum, item) => sum + emptiesCounted(item), 0);
  const lineDiscountTotal = round(sellingLines.reduce((sum, item) => sum + item.lineDiscountAmount, 0));
  // The shelf prices as charged, before anything comes off: what "Before discounts" means to a customer.
  const beforeDiscounts = round(sellingLines.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
  const vatIncluded = sellingLines.every((item) => item.taxInclusive);
  const amountDue = round(checkout.total + depositTotal);

  const zigRate = context?.zig ? Number(context.zig.rate) : null;
  const zigChange = useMemo(
    () => (context?.zig ? { rate: Number(context.zig.rate), rounding: context.zig.rounding } : null),
    [context?.zig],
  );
  const summary = useMemo(() => paymentSummary(payments, amountDue, zigRate), [payments, amountDue, zigRate]);
  const change = useMemo(() => splitChange(summary.changeAmount, zigChange), [summary.changeAmount, zigChange]);

  /* ── What the sale needs before it is taken ─────────────────────────── */

  const needsIdCheck = Boolean(features?.ageCheck) && !idChecked && sellingLines.some((item) => item.ageRestricted);
  const pointsOff = Number(loyaltyRedemptionPoints || "0") / LOYALTY_REDEEM_POINTS_PER_USD;
  const orderOff = Math.max(Number(orderDiscountAmount || "0") - pointsOff, 0);
  // Points paid with are not a discount; anything else changed keeps a reason on the sale.
  const needsReason = sellingLines.some(lineIsChanged) || orderOff > 0.009;
  const canApprove = canRetailRoleDo(session?.user?.role, "retail.sell", "approve");
  const approvalReason =
    rules && needsReason && !canApprove
      ? discountApprovalReason(rules.maxCashierDiscountPercent, { lines: sellingLines.map(ruled), orderDiscount: orderOff })
      : null;
  const discountCeiling = sellingLines.map((item) => discountCeilingProblem(ruled(item))).find(Boolean) ?? null;

  /** Why a payment row may not be taken yet: a card or wallet payment short of its reference. */
  const referenceProblem = useCallback(
    (row: PaymentRow) => {
      if (!rules || !(rules.requiredReferenceTenders as readonly string[]).includes(row.tenderType)) return null;
      return row.reference.trim().length >= rules.minReferenceLength ? null : referenceSentence(paymentLabel(row.tenderType, row.currency));
    },
    [rules],
  );

  /* ── Offline: the queue and the till rules' window ──────────────────── */

  const refreshOfflineQueue = useCallback(async () => {
    if (!tenantKey) {
      setQueuedOfflineSales([]);
      return;
    }
    setQueuedOfflineSales(await listOfflineRetailOperations(tenantKey));
  }, [tenantKey]);

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
    const onOnline = () => void syncOfflineSales();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [refreshOfflineQueue, syncOfflineSales]);

  /*
    SET-06, W-64. "Keep selling offline for up to": past the window (the
    server's last answer, or the oldest sale still held, older than the rule)
    a sale no longer goes into the queue and the basket stays to charge once
    the line is back. The server only marks a late sale for review; stopping
    the till is the device's job.
  */
  const oldestQueuedAt = queuedOfflineSales.reduce<string | null>(
    (oldest, operation) => (!oldest || operation.createdAt < oldest ? operation.createdAt : oldest),
    null,
  );
  const offlineStopAt = (at: number) =>
    rules && offlineWindowClosed({ offlineHours: rules.offlineHours, lastOnlineAt, oldestQueuedAt, now: at })
      ? offlineStopSentence(rules.offlineHours)
      : null;
  const offlineStop = isOffline ? offlineStopAt(now.getTime()) : null;

  useEffect(() => {
    if (customerSearch.length < 2 || !tenantKey || selectedCustomer) {
      setOfflineCustomerResults([]);
      return;
    }
    // A slower, older lookup must not land on top of the newer one.
    let current = true;
    void searchOfflineRetailCustomers(tenantKey, customerSearch).then((results) => {
      if (current) setOfflineCustomerResults(results);
    });
    return () => {
      current = false;
    };
  }, [customerSearch, tenantKey, selectedCustomer]);

  useEffect(() => {
    const available = categoriesQuery.data?.data ?? [];
    if (selectedCategory && available.length > 0 && !available.some((category) => category.name === selectedCategory)) setSelectedCategory(null);
  }, [categoriesQuery.data?.data, selectedCategory]);

  /* ── The cash drop prompt (SET-06): once each time the drawer goes over ── */

  useEffect(() => setCashDropAsked(readSession(CASH_DROP_ASKED_KEY)), []);
  const cashDropIsDue = Boolean(shiftHere && rules && cashDropDue(shiftHere.expectedCash, rules.cashDropPromptOver));
  useEffect(() => {
    // Back under the limit: the next time it goes over, the till asks again.
    if (!cashDropIsDue && shiftHere && cashDropAsked === shiftHere.id) {
      writeSession(CASH_DROP_ASKED_KEY, null);
      setCashDropAsked(null);
    }
  }, [cashDropAsked, cashDropIsDue, shiftHere]);
  const cashDropPrompt =
    cashDropIsDue && shiftHere && rules && cashDropAsked !== shiftHere.id
      ? cashDropSentence(shiftHere.expectedCash, rules.cashDropPromptOver, rules.currency)
      : null;

  /* ── The sale ───────────────────────────────────────────────────────── */

  const clearCart = () => {
    setCart([]);
    setCustomerNameRaw("");
    setSelectedCustomer(null);
    setLoyaltyRedemptionPoints("");
    setPayments([CASH_ROW]);
    setOrderDiscountAmount("");
    setSelectedPromotionId("");
    setIdChecked(false);
    setHeldAs(null);
    setSaleRefusal(null);
  };

  const addToCart = (item: PosCatalogItem) => {
    setCart((current) => {
      const existing = current.find((entry) => entry.catalogItemId === item.id);
      if (existing) {
        return current.map((entry) =>
          entry.catalogItemId === item.id ? { ...entry, quantity: entry.quantity + 1, stock: item.inventoryItem?.currentStock } : entry,
        );
      }
      return [...current, lineFromItem(item, Boolean(features?.emptiesAndDeposits))];
    });
  };

  // The payments come in with the post: the tray decides them in the same press that takes the money.
  const buildSalePayload = (rows: PaymentRow[], reason: string | null): PosSaleQueuePayload | null => {
    if (!shiftHere) return null;
    const parsed = paymentSummary(rows, amountDue, zigRate).parsed;
    return {
      clientRef: createSaleClientRef(),
      shiftId: shiftHere.id,
      customerId: selectedCustomer?.id ?? undefined,
      customerName: selectedCustomer?.name ?? (customerName.trim() || undefined),
      customerPhone: selectedCustomer?.phone ?? undefined,
      customerEmail: selectedCustomer?.email ?? undefined,
      loyaltyRedemptionPoints: Number(loyaltyRedemptionPoints || "0") || undefined,
      discountAmount: Number(orderDiscountAmount || "0") || undefined,
      overrideReason: reason?.trim() || undefined,
      promotionId: selectedPromotionId || undefined,
      idChecked: idChecked || undefined,
      items: sellingLines.map((item) => ({
        productId: item.catalogItemId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.lineDiscountAmount,
        ...(emptiesCounted(item) > 0 ? { emptiesBack: emptiesCounted(item) } : {}),
      })),
      payments: parsed
        .filter((payment) => payment.amountValue > 0)
        .map((payment) => ({
          tenderType: payment.tenderType,
          amount: payment.amountValue,
          ...(payment.currency ? { currency: payment.currency } : {}),
          reference: payment.reference.trim() || undefined,
        })),
    };
  };

  const saleMutation = useMutation({
    mutationFn: ({ payload, approver }: SaleAttempt) =>
      fetchJson<CompletedSale>("/api/v2/retail/pos/sales", {
        method: "POST",
        body: JSON.stringify({ ...payload, ...(approver ? { approver } : {}) }),
      }),
    onSuccess: (data) => {
      setLastCompletedSale({ ...data, heldAs });
      clearCart();
      void queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
      void queryClient.invalidateQueries({ queryKey: ["retail-pos-catalog"] });
      void queryClient.invalidateQueries({ queryKey: ["retail-pos-sales"] });
      void queryClient.invalidateQueries({ queryKey: ["retail-held-carts"] });
      router.prefetch(getPosPortalHref("history", isPosHost));
    },
    onError: (error, { payload, handed, changeOwed }) => {
      const message = getApiErrorMessage(error);
      const isNetworkError = !(error instanceof ApiError) && /network|failed to fetch|load failed/i.test(message);
      const usesOfflineCustomer = isOfflineRetailCustomerId(payload.customerId);
      const offline = isNetworkError || (typeof navigator !== "undefined" && !navigator.onLine) || usesOfflineCustomer;
      if (!tenantKey || !offline) {
        setSaleRefusal(saleRefusalOf(error));
        return;
      }
      const stop = offlineStopAt(Date.now());
      if (stop) {
        setSaleRefusal({ kind: "refused", message: stop });
        return;
      }
      // The payload carries the reason; the manager's PIN is never queued. A discount the rules
      // wanted a manager for goes in marked for review when it is sent.
      void queueOfflineRetailSale({
        tenantKey,
        payload,
        customerTempId: usesOfflineCustomer ? payload.customerId : null,
      }).then(() => refreshOfflineQueue());
      setLastSavedSale({
        tag: savedTag(payload.clientRef),
        total: amountDue,
        handed,
        change: splitChange(changeOwed, zigChange),
        at: new Date().toISOString(),
      });
      clearCart();
    },
  });

  return {
    /* The device */
    isPosHost,
    paired,
    context,
    contextLoading: contextQuery.isLoading,
    rules,
    /** The shop's features that are on: age check, licence hours, empties and deposits, cases and singles. */
    features,
    tenders: context?.tenders ?? [],
    zig: context?.zig ?? null,
    messages: heartbeatQuery.data?.messages ?? [],
    dismissMessage: (id: string) => dismissMessageMutation.mutate(id),
    cashDropPrompt,
    answerCashDrop: () => {
      if (!shiftHere) return;
      writeSession(CASH_DROP_ASKED_KEY, shiftHere.id);
      setCashDropAsked(shiftHere.id);
    },

    /* The shift */
    shiftHere,
    shiftLoading: currentShiftQuery.isLoading || contextQuery.isLoading,

    /* The shelf */
    search,
    setSearch,
    categories: categoriesQuery.data?.data ?? [],
    selectedCategory,
    setSelectedCategory,
    catalogItems: catalogQuery.data?.data ?? [],
    catalogLoading: catalogQuery.isLoading,
    catalogError: catalogQuery.isError ? catalogQuery.error : null,
    promotions: promotionsQuery.data?.data ?? [],
    activePromotion,
    selectedPromotionId,
    setSelectedPromotionId,
    alcohol,
    lineStopped,

    /* The lines */
    cart,
    addToCart,
    updateQty: (catalogItemId: string, quantity: number) =>
      setCart((current) =>
        quantity <= 0
          ? current.filter((entry) => entry.catalogItemId !== catalogItemId)
          : current.map((entry) =>
              entry.catalogItemId === catalogItemId ? { ...entry, quantity, emptiesBack: Math.min(entry.emptiesBack, Math.floor(quantity)) } : entry,
            ),
      ),
    updateLine: (catalogItemId: string, patch: Partial<Pick<CartItem, "unitPrice" | "lineDiscountAmount" | "stock">>) =>
      setCart((current) => current.map((entry) => (entry.catalogItemId === catalogItemId ? { ...entry, ...patch } : entry))),
    /** Empties back against a returnable line: whole bottles, never more than the line sells. */
    setEmptiesBack: (catalogItemId: string, emptiesBack: number) =>
      setCart((current) =>
        current.map((entry) =>
          entry.catalogItemId === catalogItemId
            ? { ...entry, emptiesBack: Math.min(Math.max(Math.floor(emptiesBack), 0), Math.floor(entry.quantity)) }
            : entry,
        ),
      ),
    removeFromCart: (catalogItemId: string) => setCart((current) => current.filter((entry) => entry.catalogItemId !== catalogItemId)),
    removeAgeRestricted: () => setCart((current) => current.filter((entry) => !entry.ageRestricted)),
    replaceCartFromHeld: (input: {
      items?: CartItem[];
      customerName?: string;
      orderDiscountAmount?: string;
      selectedPromotionId?: string;
      heldAs?: string;
    }) => {
      // A recalled sale may be a different customer: the ID is checked again.
      clearCart();
      setHeldAs(input.heldAs || null);
      setCart((input.items ?? []).map((item) => ({ ...item })));
      setCustomerNameRaw(input.customerName ?? "");
      setOrderDiscountAmount(input.orderDiscountAmount ?? "");
      setSelectedPromotionId(input.selectedPromotionId ?? "");
    },
    clearCart,

    /* The customer */
    customerName,
    setCustomerName: (value: string) => {
      setCustomerNameRaw(value);
      if (selectedCustomer) setSelectedCustomer(null);
    },
    selectedCustomer,
    selectCustomer: (customer: CustomerLookupResult | null) => {
      setSelectedCustomer(customer);
      setCustomerNameRaw(customer?.name ?? "");
      if (!customer) setLoyaltyRedemptionPoints("");
    },
    customerSearchResults: [
      ...offlineCustomerResults,
      ...(customerSearchQuery.data?.data ?? []).filter((customer) => !offlineCustomerResults.some((offline) => offline.id === customer.id)),
    ],
    customerSearchLoading: customerSearchQuery.isFetching,
    loyaltyRedemptionPoints,
    setLoyaltyRedemptionPoints,
    orderDiscountAmount,
    setOrderDiscountAmount,

    /* The ID check */
    idChecked,
    needsIdCheck,
    confirmId: () => setIdChecked(true),

    /* What it comes to */
    subtotal: checkout.subtotal,
    beforeDiscounts,
    vatIncluded,
    discountAmount: checkout.discountAmount,
    taxAmount: checkout.taxAmount,
    goodsTotal: checkout.total,
    depositTotal,
    emptiesBackCount,
    lineDiscountTotal,
    amountDue,

    /* How it is paid */
    payments,
    setPayments,
    resetPayments: () => setPayments([CASH_ROW]),
    tenderedTotal: summary.tenderedTotal,
    nonCashTotal: summary.nonCashTotal,
    cashTotal: summary.cashTotal,
    changeAmount: summary.changeAmount,
    change,
    referenceProblem,

    /* What it needs first */
    needsReason,
    approvalReason,
    canApprove,
    approvers: (context?.approvers ?? []).filter((person) => person.userId !== session?.user?.id),
    discountCeiling,
    offlineStop,

    /* Taking it */
    postSale: (rows: PaymentRow[], approval: Approval | null) => {
      setPayments(rows);
      setSaleRefusal(null);
      const payload = buildSalePayload(rows, approval?.reason ?? null);
      if (!payload) return;
      const paid = paymentSummary(rows, amountDue, zigRate);
      saleMutation.mutate({ payload, approver: approval?.approver ?? null, handed: paid.cashTotal, changeOwed: paid.changeAmount });
    },
    postSalePending: saleMutation.isPending,
    saleRefusal,
    resetSaleRefusal: () => setSaleRefusal(null),
    lastCompletedSale,
    lastSavedSale,
    dismissCompletedSale: () => {
      setLastCompletedSale(null);
      setLastSavedSale(null);
    },

    /* Waiting to send */
    queuedOfflineSales,
    pendingOfflineSales: queuedOfflineSales.length,
    retryOfflineSale: (id: string) => {
      void (async () => {
        setSyncOfflineSalesPending(true);
        try {
          await resetOfflineOperationToQueued(id);
          await syncNow({ force: true });
          await refreshOfflineQueue();
        } finally {
          setSyncOfflineSalesPending(false);
        }
      })();
    },
    removeOfflineSale: (id: string) => void removeOfflineOperation(id).then(() => refreshOfflineQueue()),
    syncOfflineSales: () => void syncOfflineSales(),
    syncOfflineSalesPending,
  };
}

export type TillState = ReturnType<typeof useTillStateValue>;

const TillStateContext = createContext<TillState | null>(null);

/**
 * `paired`: this device is one of the shop's tills now (`isLiveTill`). False
 * only where a till screen opens before pairing (price check): the provider
 * then asks nothing of the device routes and runs no heartbeat or watch.
 */
export function TillStateProvider({ children, isPosHost, paired }: PropsWithChildren<{ isPosHost: boolean; paired: boolean }>) {
  const value = useTillStateValue({ isPosHost, paired });
  return <TillStateContext.Provider value={value}>{children}</TillStateContext.Provider>;
}

export function useTill() {
  const context = useContext(TillStateContext);
  if (!context) throw new Error("useTill must be used within TillStateProvider");
  return context;
}
