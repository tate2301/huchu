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
import { useToast } from "@/components/ui/use-toast";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { removeOfflineOperation, resetOfflineOperationToQueued } from "@/lib/offline/outbox";
import type { OfflineOutboxOperation } from "@/lib/offline/types";
import { emptiesCounted } from "@/lib/retail/deposits";
import { alcoholVerdict, type AlcoholVerdict } from "@/lib/retail/licence-hours";
import { pointsValue, spendRefusal, SPENDING_NEEDS_THE_INTERNET, spreadPointsDiscount } from "@/lib/retail/loyalty/spend";
import {
  isOfflineRetailCustomerId,
  listOfflineRetailOperations,
  listOfflineRetailReversals,
  queueOfflineRetailReversal,
  queueOfflineRetailSale,
  searchOfflineRetailCustomers,
} from "@/lib/retail/offline-runtime";
import { splitChange } from "@/lib/retail/payment-words";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { bundleOnSale, type PricingSnapshot, type SnapshotBundle } from "@/lib/retail/pricing/engine";
import type { PosReversalQueuePayload, PosSaleQueuePayload } from "@/lib/retail/pos-offline-queue";
import { getPosPortalHref } from "@/lib/retail/pos-host";
import { shopFeatures } from "@/lib/retail/shop-profile-rules";
import { cashDropDue, cashDropSentence, offlineStopSentence, offlineWindowClosed } from "@/lib/retail/till-on-device";
import { markPairedTill } from "@/lib/retail/till-presence";
import { referenceSentence } from "@/lib/retail/till-rule-words";
import { bundleLineId, bundleOffers, makeBundle, newBundleRef, priceCart, repriceLines, shelfPriceNow } from "./cart-pricing";
import { paymentLabel, usd } from "./format";
import { breakOneCase, caseOpenedToast } from "./moments";
import { holdsVouchers, VOUCHERS_OFFLINE } from "./vouchers";
import { discountApprovalReason, discountCeilingProblem, paymentSummary, type RuledLine } from "./sale-rules";
import type {
  Approver,
  CartItem,
  CompletedSale,
  CurrentShift,
  DiscountVoucher,
  PosCustomer,
  PaymentRow,
  PosCatalogItem,
  SaleRefusal,
  SavedSale,
  TillCategory,
  TillContext,
  TillMessage,
  VoucherSold,
} from "./types";

type PosQueuedSale = OfflineOutboxOperation<PosSaleQueuePayload>;

/** The till's own context, persisted with the tenant's cache so it is there offline. */
export const TILL_CONTEXT_KEY = ["till-context"] as const;
/** The heartbeat: last seen, and the back office's messages. */
export const TILL_HEARTBEAT_KEY = ["till-heartbeat"] as const;
const HEARTBEAT_MS = 60_000;
/** The price snapshot the till prices every sale from (PRD-05, PRD-08, PRD-09). */
const PRICING_KEY = ["retail-pos-pricing"] as const;

/** The till's words when the server priced the sale differently (PRD-05): the snapshot is fetched and the sale re-priced. */
export const PRICES_CHANGED_TOAST = "Prices changed. Check the total and charge again.";

/** The till's words while ZIMRA is away and the shop stops selling (SET-08). */
const FISCAL_STOP = "ZIMRA is not answering, so this shop stops selling until it does. The sale stays here; try again in a few minutes.";
/** Survives a reload, dies with the tab: the shift the cash drop prompt has already asked about. */
const CASH_DROP_ASKED_KEY = "till_cash_drop_asked";

const round = (value: number) => Number(value.toFixed(2));
const CASH_ROW: PaymentRow = { tenderType: "CASH", amount: "", reference: "" };

/** A key for one checkout attempt; the server numbers the receipt. Not a secure context on a dev POS host, hence the fallback. */
function createSaleClientRef() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `till-${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

/** A short tag off a sale's key, for a sale saved on the till: its number comes when it is sent. */
function savedTag(clientRef: string) {
  return clientRef.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase();
}

/**
 * `typedPrice`: what the cashier typed for an open-price product, which is its
 * shelf price. The engine re-prices every other line off the snapshot
 * (`repriceLines`); the catalog's price stands until it has.
 */
function lineFromItem(item: PosCatalogItem, depositsOn: boolean, typedPrice?: number): CartItem {
  const price = item.openPrice && typedPrice !== undefined ? typedPrice : item.unitPrice;
  return {
    id: item.id,
    name: item.name,
    catalogItemId: item.id,
    category: item.category,
    quantity: 1,
    unitPrice: price,
    shelfPrice: price,
    priceOfOne: price,
    priceBreaks: item.priceBreaks ?? [],
    openPrice: item.openPrice,
    taxPercent: item.taxPercent,
    taxInclusive: item.taxInclusive,
    lineDiscountAmount: 0,
    unit: item.inventoryItem?.unit,
    stock: item.inventoryItem?.currentStock,
    ageRestricted: item.ageRestricted,
    returnable: depositsOn && item.returnable,
    depositAmount: depositsOn ? item.depositAmount : null,
    depositName: depositsOn ? item.depositName : null,
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

/** `pos/sales`'s no, as the screens act on it. A manager asked for is the approval dialog's (`useApproval`), not this. */
function saleRefusalOf(error: unknown): SaleRefusal {
  return { kind: "refused", message: getApiErrorMessage(error, "That sale was not saved.") };
}

/** A 409 `needsApprover` or a locked PIN (423): the approval dialog answers these. */
function asksForManager(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status === 423) return true;
  return error.status === 409 && (error.details as { needsApprover?: unknown } | undefined)?.needsApprover === true;
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
  const { toast } = useToast();
  const { data: session } = useSession();
  const { syncNow, tenantKey, isOffline, lastOnlineAt } = useOfflineRuntime();
  const now = useClockMinute();

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerNameRaw] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<PosCustomer | null>(null);
  const [pointsToSpend, setPointsToSpend] = useState("");
  const [payments, setPayments] = useState<PaymentRow[]>([CASH_ROW]);
  const [orderDiscountAmount, setOrderDiscountAmount] = useState("");
  /** Gift vouchers bought in this sale, and a discount voucher on it (PRD-10): online only. */
  const [vouchersSold, setVouchersSold] = useState<VoucherSold[]>([]);
  const [discountVoucher, setDiscountVoucher] = useState<DiscountVoucher | null>(null);
  /** The cashier has looked at this customer's ID. One check covers the sale. */
  const [idChecked, setIdChecked] = useState(false);
  const [heldAs, setHeldAs] = useState<string | null>(null);
  const [lastCompletedSale, setLastCompletedSale] = useState<CompletedSale | null>(null);
  const [lastSavedSale, setLastSavedSale] = useState<SavedSale | null>(null);
  const [saleRefusal, setSaleRefusal] = useState<SaleRefusal | null>(null);
  const [queuedOfflineSales, setQueuedOfflineSales] = useState<PosQueuedSale[]>([]);
  const [queuedReversals, setQueuedReversals] = useState<Array<OfflineOutboxOperation<PosReversalQueuePayload>>>([]);
  const [syncOfflineSalesPending, setSyncOfflineSalesPending] = useState(false);
  const [offlineCustomerResults, setOfflineCustomerResults] = useState<PosCustomer[]>([]);
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
    queryFn: () =>
      fetchJson<{ messages: TillMessage[]; zimraAway?: boolean }>("/api/v2/retail/devices/heartbeat", { method: "POST", body: "{}" }),
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
  // The name as typed settles for a moment before it is searched, online or on the till.
  const [customerSearch, setCustomerSearch] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setCustomerSearch(customerName.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [customerName]);
  const customerSearchQuery = useQuery({
    queryKey: ["retail-pos-customer-search", customerSearch],
    queryFn: () =>
      fetchJson<{ data: PosCustomer[] }>(`/api/v2/retail/pos/customers?q=${encodeURIComponent(customerSearch)}&limit=8`),
    enabled: customerSearch.length >= 2 && !selectedCustomer,
    staleTime: 15_000,
  });

  /*
    PRD-05, PRD-08, PRD-09. The price snapshot every sale is priced from,
    fetched again with every heartbeat and after every sale, so an ended,
    paused or newly started promotion or price list reaches an open till
    within the minute (an unchanged one answers 304 off its ETag). A sale
    rung in that minute is refused `PRICES_CHANGED` and re-priced here.
  */
  const pricingQuery = useQuery({
    queryKey: PRICING_KEY,
    queryFn: () => fetchJson<PricingSnapshot>("/api/v2/retail/pos/pricing"),
    enabled: Boolean(shiftHere),
    staleTime: 0,
    refetchInterval: HEARTBEAT_MS,
    refetchIntervalInBackground: true,
  });
  const snapshot = pricingQuery.data ?? null;
  // Every line at the engine's price for its quantity now: Happy hour from 17:00, Wholesale from 6.
  const pricedCart = useMemo(() => repriceLines(cart, snapshot, now), [cart, snapshot, now]);

  /* ── Licence hours: 18+ lines stop, the rest of the sale goes on ─────── */

  const licenceHours = context?.licenceHours;
  const alcohol: AlcoholVerdict = useMemo(
    () => (features?.licenceHours && licenceHours ? alcoholVerdict(licenceHours, now) : ({ sellable: true } as const)),
    [features?.licenceHours, licenceHours, now],
  );
  const lineStopped = useCallback((item: CartItem) => item.ageRestricted && !alcohol.sellable, [alcohol.sellable]);
  const sellingLines = useMemo(() => pricedCart.filter((item) => !lineStopped(item)), [pricedCart, lineStopped]);

  /* ── What the sale comes to ─────────────────────────────────────────── */

  /*
    The sale is priced by the sum `pos/sales` runs (`priceCart` over
    `priceSale`): fixed sets rung as one, buy-more deals, the cashier's
    discounts, the promotions on their lines, then a discount voucher, so the
    total shown, charged and printed is the one stored.
  */
  const totals = useMemo(
    () =>
      priceCart({
        lines: sellingLines,
        snapshot,
        at: now,
        siteId,
        orderDiscountAmount: Number(orderDiscountAmount || "0"),
        voucher: discountVoucher ? { percentOff: discountVoucher.percentOff, amountOff: discountVoucher.amountOff } : null,
        vouchersSold,
        // A member on the sale while loyalty is on gets the loyalty members' promotions (D-3), as the server does.
        customer: { loyalty: Boolean(context?.loyalty.on) && Boolean(selectedCustomer), staff: Boolean(selectedCustomer?.staff) },
      }),
    [context?.loyalty.on, discountVoucher, now, orderDiscountAmount, selectedCustomer, sellingLines, siteId, snapshot, vouchersSold],
  );
  const priced = totals.sale;

  /*
    CUS-01. Points spent come off after the promotions, spread over the lines
    points may pay as the server spreads them (`spreadPointsDiscount`), so the
    total shown is the one charged. A spend the rules refuse takes nothing off
    and says why.
  */
  const loyaltyRules = context?.loyalty ?? null;
  const pointsWanted = Math.max(0, Math.floor(Number(pointsToSpend || "0")));
  const pointsLines = useMemo(() => {
    // A checkout line is a piece of a cart line (a deal splits one); its product is the piece's line.
    const lineOfPiece = new Map(priced.pieces.map((piece) => [piece.key, piece.lineKey]));
    const restricted = new Set(sellingLines.filter((item) => item.ageRestricted).map((item) => item.id));
    return priced.checkout.lines.map((line) => ({
      ...line,
      payable: Boolean(loyaltyRules?.payForAlcohol) || !restricted.has(lineOfPiece.get(line.id) ?? line.id),
    }));
  }, [loyaltyRules?.payForAlcohol, priced.checkout.lines, priced.pieces, sellingLines]);
  const pointsPayable = round(pointsLines.filter((line) => line.payable).reduce((sum, line) => sum + line.lineTotal, 0));
  const pointsProblem =
    pointsWanted > 0
      ? isOffline
        ? SPENDING_NEEDS_THE_INTERNET
        : spendRefusal({
            enabled: Boolean(loyaltyRules?.on),
            customer: selectedCustomer ? { name: selectedCustomer.name, balance: selectedCustomer.points } : null,
            points: pointsWanted,
            spendFrom: loyaltyRules?.spendFrom ?? 0,
            pointValue: loyaltyRules?.pointValue ?? 0,
            payable: pointsPayable,
          })
      : null;
  const pointsOff = pointsWanted > 0 && !pointsProblem && loyaltyRules ? pointsValue(pointsWanted, loyaltyRules.pointValue) : 0;
  const checkout = useMemo(() => {
    if (pointsOff <= 0) return priced.checkout;
    const lines = spreadPointsDiscount(pointsLines, pointsOff).lines;
    return {
      ...priced.checkout,
      discountAmount: round(lines.reduce((sum, line) => sum + line.discountAmount, 0)),
      taxAmount: round(lines.reduce((sum, line) => sum + line.taxAmount, 0)),
      total: round(priced.checkout.total - pointsOff),
      lines,
    };
  }, [pointsLines, pointsOff, priced.checkout]);
  const bundleSaving = priced.bundleSaving;
  const promotionSaving = priced.promotionSaving;
  const voucherSaving = priced.voucherSaving;
  // Deposits and gift vouchers sold sit outside the goods total; the customer pays all three.
  const depositTotal = totals.depositTotal;
  const vouchersSoldTotal = totals.vouchersSoldTotal;
  const emptiesBackCount = sellingLines.reduce((sum, item) => sum + emptiesCounted(item), 0);
  const lineDiscountTotal = round(sellingLines.reduce((sum, item) => sum + item.lineDiscountAmount, 0));
  // The shelf prices as charged, before anything comes off: what "Before discounts" means to a customer.
  const beforeDiscounts = round(sellingLines.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
  const vatIncluded = sellingLines.every((item) => item.taxInclusive);
  const amountDue = round(checkout.total + depositTotal + vouchersSoldTotal);

  /* ── Bundles: buttons, barcodes and "Make it a bundle" (PRD-08) ────── */

  const bundlesOnSale = useMemo(
    () => (snapshot?.bundles ?? []).filter((bundle) => bundle.kind === "FIXED_SET" && bundleOnSale(bundle, now, siteId)),
    [now, siteId, snapshot?.bundles],
  );
  const offers = useMemo(() => bundleOffers(pricedCart, bundlesOnSale, now, siteId), [bundlesOnSale, now, pricedCart, siteId]);

  const zigRate = context?.zig ? Number(context.zig.rate) : null;
  const zigChange = useMemo(
    () => (context?.zig ? { rate: Number(context.zig.rate), rounding: context.zig.rounding } : null),
    [context?.zig],
  );
  const summary = useMemo(() => paymentSummary(payments, amountDue, zigRate), [payments, amountDue, zigRate]);
  const change = useMemo(() => splitChange(summary.changeAmount, zigChange), [summary.changeAmount, zigChange]);

  /* ── What the sale needs before it is taken ─────────────────────────── */

  const needsIdCheck = Boolean(features?.ageCheck) && !idChecked && sellingLines.some((item) => item.ageRestricted);
  const orderOff = Number(orderDiscountAmount || "0");
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
      setQueuedReversals([]);
      return;
    }
    setQueuedOfflineSales(await listOfflineRetailOperations(tenantKey));
    setQueuedReversals(await listOfflineRetailReversals(tenantKey));
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

  /*
    SET-08. "If ZIMRA cannot be reached · Stop selling": the server refuses a
    new sale (409 FISCAL_OFFLINE) until ZIMRA answers, and the heartbeat says
    so before anyone tries. The sale stays on the till; taking the money asks
    again, and the sale itself asks ZIMRA. A sale saved offline is unaffected.
  */
  const [fiscalRefused, setFiscalRefused] = useState(false);
  const zimraAway = heartbeatQuery.data?.zimraAway;
  useEffect(() => {
    if (zimraAway === false) setFiscalRefused(false);
  }, [zimraAway]);
  const fiscalStop = !isOffline && (fiscalRefused || zimraAway === true) ? FISCAL_STOP : null;

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
    setPointsToSpend("");
    setPayments([CASH_ROW]);
    setOrderDiscountAmount("");
    setVouchersSold([]);
    setDiscountVoucher(null);
    setIdChecked(false);
    setHeldAs(null);
    setSaleRefusal(null);
  };

  /**
   * A checkout that will not happen: the sale goes, everything on it, in one
   * press. Nothing reached the server, so nothing is written; what comes back
   * is the way to put it all back, for the toast's Undo.
   */
  const dropSale = () => {
    const kept = {
      cart,
      customerName,
      selectedCustomer,
      pointsToSpend,
      payments,
      orderDiscountAmount,
      vouchersSold,
      discountVoucher,
      idChecked,
      heldAs,
    };
    clearCart();
    return () => {
      setCart(kept.cart);
      setCustomerNameRaw(kept.customerName);
      setSelectedCustomer(kept.selectedCustomer);
      setPointsToSpend(kept.pointsToSpend);
      setPayments(kept.payments);
      setOrderDiscountAmount(kept.orderDiscountAmount);
      setVouchersSold(kept.vouchersSold);
      setDiscountVoucher(kept.discountVoucher);
      setIdChecked(kept.idChecked);
      setHeldAs(kept.heldAs);
    };
  };

  /** One more of a product; an open-price product comes with the price the cashier typed. Loose lines only: a bundle's components stay its own. */
  const addToCart = (item: PosCatalogItem, typedPrice?: number) => {
    setCart((current) => {
      const existing = current.find((entry) => entry.id === item.id);
      // Another amount of an open price already on the sale (airtime for US$5, then US$2):
      // the line is one sale of it, at the two together.
      if (existing && item.openPrice && typedPrice !== undefined && Math.abs(typedPrice - existing.unitPrice) > 0.009) {
        const price = round(existing.unitPrice * existing.quantity + typedPrice);
        return current.map((entry) =>
          entry.id === item.id ? { ...entry, quantity: 1, unitPrice: price, shelfPrice: price, stock: item.inventoryItem?.currentStock } : entry,
        );
      }
      if (existing) {
        return current.map((entry) =>
          // The line keeps its own count: a case opened at this till is in it before the shelf is read again.
          entry.id === item.id ? { ...entry, quantity: entry.quantity + 1, stock: entry.stock ?? item.inventoryItem?.currentStock } : entry,
        );
      }
      return [...current, lineFromItem(item, Boolean(features?.emptiesAndDeposits), typedPrice)];
    });
  };

  /*
    PRD-08. A bundle's button or barcode rings it as its component lines, one
    per product, sharing one `bundleRef`: the engine sells them at the
    bundle's price, shared pro rata. The components come off the shelf the
    till holds (the whole shelf is cached for offline), else are read by id.
  */
  const shelfFor = async (ids: string[]): Promise<Map<string, PosCatalogItem>> => {
    const found = new Map<string, PosCatalogItem>();
    for (const [, data] of queryClient.getQueriesData<{ data: PosCatalogItem[] }>({ queryKey: ["retail-pos-catalog"] })) {
      for (const item of data?.data ?? []) if (ids.includes(item.id)) found.set(item.id, item);
    }
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length && !isOffline) {
      const read = await fetchJson<{ data: PosCatalogItem[] }>(`/api/v2/retail/pos/catalog?ids=${missing.join(",")}`);
      for (const item of read.data) found.set(item.id, item);
    }
    return found;
  };
  const addBundle = async (bundle: SnapshotBundle) => {
    const shelf = await shelfFor(bundle.items.map((item) => item.productId));
    const absent = bundle.items.find((item) => !shelf.has(item.productId));
    if (absent) {
      toast({ title: `${bundle.name} cannot be rung`, description: `${absent.name} is not on the shelf here.`, variant: "destructive" });
      return null;
    }
    const ref = newBundleRef();
    const lines = bundle.items.map((part) => ({
      ...lineFromItem(shelf.get(part.productId)!, Boolean(features?.emptiesAndDeposits)),
      id: bundleLineId(ref, part.productId),
      quantity: part.quantity,
      bundleId: bundle.id,
      bundleRef: ref,
      bundleName: bundle.name,
    }));
    setCart((current) => [...current, ...lines]);
    return lines;
  };

  /*
    Cases and singles (Liquor panel 4). One case opened at this till's
    branch: the cases out, their singles in, as STK-04's break. The line's
    stock follows, and the shelf is read again.
  */
  const openCase = async (item: PosCatalogItem): Promise<number | null> => {
    const pack = item.openableCase;
    if (!pack) return null;
    try {
      const onHand = await breakOneCase(pack.productId, siteId);
      setCart((current) => current.map((entry) => (entry.catalogItemId === item.id ? { ...entry, stock: onHand } : entry)));
      void queryClient.invalidateQueries({ queryKey: ["retail-pos-catalog"] });
      toast({ title: caseOpenedToast(item.name, pack.unitsPerCase), variant: "success" });
      return onHand;
    } catch (error) {
      toast({ title: "No case was opened", description: getApiErrorMessage(error), variant: "destructive" });
      return null;
    }
  };

  /*
    STK-09, W-29. Bottles back with nothing to sell: their deposit comes out
    of this shift's drawer (a PAYOUT "Bottles back"), so its expected cash
    falls by it.
  */
  const payBottlesBack = useMutation({
    mutationFn: (count: { bottles: number; crates: number }) =>
      fetchJson<{ data: { paid: string } }>("/api/v2/retail/empties/bottles-back", {
        method: "POST",
        body: JSON.stringify({ shiftId: shiftHere?.id, ...count, ...(selectedCustomer && !isOfflineRetailCustomerId(selectedCustomer.id) ? { customerId: selectedCustomer.id } : {}) }),
      }),
    onSuccess: (result, count) => {
      const what = [count.bottles ? `${count.bottles} ${count.bottles === 1 ? "bottle" : "bottles"}` : null, count.crates ? `${count.crates} ${count.crates === 1 ? "crate" : "crates"}` : null]
        .filter(Boolean)
        .join(" and ");
      toast({ title: `${usd(Number(result.data.paid))} paid out for ${what}.`, variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
    },
  });

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
      pointsToSpend: pointsOff > 0 ? pointsWanted : undefined,
      discountAmount: Number(orderDiscountAmount || "0") || undefined,
      overrideReason: reason?.trim() || undefined,
      idChecked: idChecked || undefined,
      items: sellingLines.map((item) => ({
        productId: item.catalogItemId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.lineDiscountAmount,
        ...(emptiesCounted(item) > 0 ? { emptiesBack: emptiesCounted(item) } : {}),
        ...(item.bundleId && item.bundleRef ? { bundleId: item.bundleId, bundleRef: item.bundleRef } : {}),
      })),
      payments: parsed
        .filter((payment) => payment.amountValue > 0)
        .map((payment) => ({
          tenderType: payment.tenderType,
          amount: payment.amountValue,
          ...(payment.currency ? { currency: payment.currency } : {}),
          reference: payment.reference.trim() || undefined,
          ...(payment.tenderType === "VOUCHER" ? { voucherCode: payment.voucherCode, voucherSecret: payment.voucherSecret } : {}),
        })),
      total: amountDue,
      ...(vouchersSold.length ? { vouchersSold: vouchersSold.map((voucher) => ({ value: voucher.value, ...(voucher.customerId ? { customerId: voucher.customerId } : {}) })) } : {}),
      ...(discountVoucher ? { discountVoucher: { code: discountVoucher.code, secret: discountVoucher.secret } } : {}),
    };
  };

  const saleMutation = useMutation({
    mutationFn: ({ payload, approver }: SaleAttempt) =>
      fetchJson<CompletedSale>("/api/v2/retail/pos/sales", {
        method: "POST",
        body: JSON.stringify({ ...payload, ...(approver ? { approver } : {}) }),
      }),
    onSuccess: (data) => {
      setFiscalRefused(false);
      setLastCompletedSale({ ...data, heldAs });
      clearCart();
      void queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
      void queryClient.invalidateQueries({ queryKey: ["retail-pos-catalog"] });
      void queryClient.invalidateQueries({ queryKey: ["retail-pos-sales"] });
      void queryClient.invalidateQueries({ queryKey: ["retail-held-carts"] });
      void queryClient.invalidateQueries({ queryKey: PRICING_KEY });
      router.prefetch(getPosPortalHref("history", isPosHost));
    },
    onError: (error, { payload, handed, changeOwed }) => {
      const message = getApiErrorMessage(error);
      const isNetworkError = !(error instanceof ApiError) && /network|failed to fetch|load failed/i.test(message);
      const usesOfflineCustomer = isOfflineRetailCustomerId(payload.customerId);
      const offline = isNetworkError || (typeof navigator !== "undefined" && !navigator.onLine) || usesOfflineCustomer;
      if (asksForManager(error)) return;
      if (!tenantKey || !offline) {
        const code = error instanceof ApiError ? (error.details as { code?: unknown } | undefined)?.code : undefined;
        if (code === "FISCAL_OFFLINE") setFiscalRefused(true);
        // Sold off an old snapshot: the new one re-prices the sale on screen before the cashier takes the money again.
        if (code === "PRICES_CHANGED") {
          void queryClient.invalidateQueries({ queryKey: PRICING_KEY });
          void queryClient.invalidateQueries({ queryKey: ["retail-pos-catalog"] });
          toast({ title: PRICES_CHANGED_TOAST });
          setSaleRefusal({ kind: "refused", message: PRICES_CHANGED_TOAST });
          return;
        }
        setSaleRefusal(saleRefusalOf(error));
        return;
      }
      // A voucher is money the server holds: a sale with one is never saved on the till.
      if (holdsVouchers(payload)) {
        setSaleRefusal({ kind: "refused", message: VOUCHERS_OFFLINE });
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

  /** Whoever is signed in may adjust stock from the till (STK-04): owner, manager, stock clerk; never the cashier. */
  const canAdjustStock = canRetailRoleDo(session?.user?.role, "retail.adjustments", "create");

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
    siteId,
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
    alcohol,
    lineStopped,

    /* The lines, each at the engine's price now */
    cart: pricedCart,
    addToCart,
    updateQty: (id: string, quantity: number) =>
      setCart((current) =>
        quantity <= 0
          ? current.filter((entry) => entry.id !== id)
          : current.map((entry) => (entry.id === id ? { ...entry, quantity, emptiesBack: Math.min(entry.emptiesBack, Math.floor(quantity)) } : entry)),
      ),
    /*
      A price typed on a line is judged against the engine's shelf price as
      it stands: the same figure is no change and keeps following the shelf.
      An open price changed on its line is still the shelf price: not a
      change, no reason, no manager.
    */
    updateLine: (id: string, patch: Partial<Pick<CartItem, "unitPrice" | "lineDiscountAmount" | "stock">>) => {
      const shelf = pricedCart.find((entry) => entry.id === id)?.shelfPrice;
      setCart((current) =>
        current.map((entry) => {
          if (entry.id !== id) return entry;
          if (patch.unitPrice === undefined) return { ...entry, ...patch };
          const shelfPrice = entry.openPrice ? patch.unitPrice : (shelf ?? entry.shelfPrice);
          return { ...entry, ...patch, shelfPrice };
        }),
      );
    },
    /** Empties back against a returnable line: whole bottles, never more than the line sells. */
    setEmptiesBack: (id: string, emptiesBack: number) =>
      setCart((current) =>
        current.map((entry) =>
          entry.id === id ? { ...entry, emptiesBack: Math.min(Math.max(Math.floor(emptiesBack), 0), Math.floor(entry.quantity)) } : entry,
        ),
      ),
    removeFromCart: (id: string) =>
      setCart((current) => {
        const line = current.find((entry) => entry.id === id);
        // A bundle's component goes with the rest of its bundle: a part of one is not a bundle.
        return line?.bundleRef ? current.filter((entry) => entry.bundleRef !== line.bundleRef) : current.filter((entry) => entry.id !== id);
      }),
    removeAgeRestricted: () => setCart((current) => current.filter((entry) => !entry.ageRestricted)),
    /** The price of one now, and its list when not the till's own, for a tile. */
    shelfPriceOf: (productId: string) => shelfPriceNow(snapshot, productId, now),
    /** Per line: the promotion it sold under and its saving, and its bundle's saving. */
    lineSavings: totals.lineSavings,

    /* Bundles (PRD-08) */
    bundlesOnSale,
    addBundle,
    /** "Make it a bundle: …": fixed sets whose items are all on the sale on loose lines. */
    bundleOffers: offers,
    makeBundleOf: (bundle: SnapshotBundle) => setCart((current) => makeBundle(repriceLines(current, snapshot, now), bundle, newBundleRef())),
    /** A fixed set the engine refuses now, and the way out: ring its items on their own. */
    bundleProblem: totals.bundleProblem,
    ringOnTheirOwn: () =>
      setCart((current) => {
        const loose = new Map<string, CartItem>();
        for (const entry of current) {
          const plain = { ...entry, id: entry.catalogItemId, bundleId: null, bundleRef: null, bundleName: null };
          const kept = loose.get(plain.id);
          loose.set(plain.id, kept ? { ...kept, quantity: kept.quantity + plain.quantity, emptiesBack: kept.emptiesBack + plain.emptiesBack } : plain);
        }
        return [...loose.values()];
      }),

    /* Cases and singles, empties */
    openCase,
    payBottlesBack: (count: { bottles: number; crates: number }) => payBottlesBack.mutateAsync(count),
    payBottlesBackPending: payBottlesBack.isPending,

    /* Gift and discount vouchers (PRD-10): online only */
    vouchersSold,
    addVoucherSold: (voucher: Omit<VoucherSold, "key">) =>
      setVouchersSold((current) => [...current, { ...voucher, key: `${Date.now()}-${current.length}` }]),
    removeVoucherSold: (key: string) => setVouchersSold((current) => current.filter((voucher) => voucher.key !== key)),
    discountVoucher,
    setDiscountVoucher,
    vouchersSoldTotal,
    voucherSaving,

    /* Adjust stock from the till (STK-04) */
    canAdjustStock,

    replaceCartFromHeld: (input: {
      items?: CartItem[];
      customerName?: string;
      orderDiscountAmount?: string;
      heldAs?: string;
    }) => {
      // A recalled sale may be a different customer: the ID is checked again.
      clearCart();
      setHeldAs(input.heldAs || null);
      setCart((input.items ?? []).map((item) => ({ ...item, category: item.category ?? null })));
      setCustomerNameRaw(input.customerName ?? "");
      setOrderDiscountAmount(input.orderDiscountAmount ?? "");
    },
    clearCart,
    dropSale,

    /* The customer */
    customerName,
    setCustomerName: (value: string) => {
      setCustomerNameRaw(value);
      if (selectedCustomer) setSelectedCustomer(null);
    },
    selectedCustomer,
    selectCustomer: (customer: PosCustomer | null) => {
      setSelectedCustomer(customer);
      setCustomerNameRaw(customer?.name ?? "");
      if (!customer) setPointsToSpend("");
    },
    customerSearchResults: [
      ...offlineCustomerResults,
      ...(customerSearchQuery.data?.data ?? []).filter((customer) => !offlineCustomerResults.some((offline) => offline.id === customer.id)),
    ],
    customerSearchLoading: customerSearchQuery.isFetching,
    pointsToSpend,
    setPointsToSpend,
    /** What the points come to off this sale, why they cannot be spent, and what they may pay. */
    pointsOff,
    pointsProblem,
    pointsPayable,
    loyaltyRules,
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
    bundleSaving,
    promotionSaving,
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
    /** Who may approve at this till, per right, without the person selling (FLR-09). */
    approvers: {
      sell: (context?.approvers.sell ?? []).filter((person) => person.userId !== session?.user?.id),
      cashControl: (context?.approvers.cashControl ?? []).filter((person) => person.userId !== session?.user?.id),
      adjust: (context?.approvers.adjust ?? []).filter((person) => person.userId !== session?.user?.id),
    },
    discountCeiling,
    isOffline,
    offlineStop,
    /** ZIMRA is away and the shop stops selling until it answers (SET-08). */
    fiscalStop,

    /* Taking it */
    /**
     * Takes the money: the sale with its reason, and a manager when the
     * approval dialog asked for one. Resolves once the server took it or the
     * queue saved it; rejects with the server's no (the approval dialog reads
     * a 409 `needsApprover`; anything else shows on the tray).
     */
    postSale: async (rows: PaymentRow[], reason: string | null, approver: Approver | null) => {
      setPayments(rows);
      setSaleRefusal(null);
      const payload = buildSalePayload(rows, reason);
      if (!payload) return;
      const paid = paymentSummary(rows, amountDue, zigRate);
      await saleMutation.mutateAsync({ payload, approver, handed: paid.cashTotal, changeOwed: paid.changeAmount });
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
    /** Refunds and voids done offline (FLR-09). */
    queuedReversals,
    /** Saves a refund or void the line was down for; false when this till cannot hold it (no offline store). */
    queueReversal: async (payload: PosReversalQueuePayload) => {
      if (!tenantKey) return false;
      await queueOfflineRetailReversal({ tenantKey, payload });
      await refreshOfflineQueue();
      return true;
    },
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
