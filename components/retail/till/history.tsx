"use client";

/**
 * History (T5, T3 in design/teams/flows-till.md): my sales, newest first, on
 * the left; the chosen sale's record in the sale column's place on the right.
 * The list is this shift, today, seven days or everything, filtered by how it
 * was paid and what happened, a page at a time as it scrolls and only the rows
 * in view drawn. The record is the sale's lines read-only and its facts, with
 * Print again (P) as the one orange key and Refund beside it; Void is under ⋯.
 *
 * A refund takes over both columns: the lines with how many come back and one
 * of the till rules' reasons on the left, what goes back on the right with
 * "Refund US$4.80" (↵). A manager's PIN comes in when the rules ask for one.
 * Done, the right column says what went back, like Paid. With the line down
 * the refund or void is saved on the till and goes in for review when sent.
 */

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";

import { useToast } from "@/components/ui/use-toast";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  AddressBook,
  ArrowLeft,
  ArrowUDownLeft,
  ArrowsSplit,
  Buildings,
  CaretLeft,
  CreditCard,
  DeviceMobile,
  DotsThree,
  Timer,
  IdentificationCard,
  ListBullets,
  MagnifyingGlass,
  Minus,
  Money,
  Package,
  Plus,
  Printer,
  Prohibit,
  Receipt,
  Recycle,
  Stamp,
  Star,
  Tag,
  Ticket,
  Tray,
  UserCheck,
  Wallet,
  WarningCircle,
  X,
} from "@/lib/icons";
import { depositBack } from "@/lib/retail/deposits";
import { getPosPortalHref } from "@/lib/retail/pos-host";
import { SHOP_TIME_ZONE } from "@/lib/retail/shop-profile-rules";
import { ORIGINAL_TENDERS, originalLabel, TO_LABELS, type RefundDone, type RefundTo } from "@/lib/retail/floor/reversal-words";
import { NEEDS_A_MANAGER, reversalNeedsManager, type PosReversalQueuePayload } from "@/lib/retail/pos-offline-queue";
import type { PosCustomer } from "@/lib/retail/customers/pos-customer";
import { fiscalStatusLabel } from "@/lib/retail/words";
import { count, firstName, hhmm, paymentLabel, qty, usd, weekdayDayMonth, whole, zig } from "./format";
import { Empty, ErrorLine, LoadFailed, TillDialog, TillPopover, useWindowKeys } from "./parts";
import { useApproval } from "./approval";
import { CustomerPicker } from "./layby";
import { printReceipt, tenderKey } from "./pay-tray";
import { useTill } from "./state";
import type { TenderType } from "./types";

type Amount = string | number;
type PaymentLine = { tenderType: TenderType; currency: string | null; amount?: Amount };

type SaleRow = {
  id: string;
  saleNo: string;
  saleType: "SALE" | "REFUND" | "VOID";
  status: string;
  shiftId: string | null;
  postedAt: string;
  customerName: string | null;
  cashierName: string | null;
  totalAmount: number;
  depositAmount: number;
  itemCount: number;
  lineCount: number;
  payments: PaymentLine[];
  lines: Array<{ itemName: string }>;
  overrideReason: string | null;
  /** How much of it refunds have handed back. */
  refunded: "NONE" | "PART" | "ALL";
};

/** `pos/sales/{id}`: the sale, its lines and payments, and what was refunded or voided off it. */
type SaleDetail = {
  id: string;
  saleNo: string;
  saleType: "SALE" | "REFUND" | "VOID";
  status: string;
  postedAt: string | null;
  createdAt: string;
  /** When its receipt first printed; null when it never did. */
  printedAt: string | null;
  customerName: string | null;
  cashierName: string | null;
  totalAmount: Amount;
  taxAmount: Amount;
  /** Bottle deposits on top of the goods, net of empties back. */
  depositAmount: Amount;
  tenderedAmount: Amount | null;
  /** What the change was worth in the sale's money: the US dollars and the ZiG notes together. */
  changeAmount: Amount | null;
  changeZig: Amount;
  idCheckedAt: string | null;
  overrideReason: string | null;
  /** The manager whose PIN let its discount, refund or void through; null when nobody had to. */
  approvedByName: string | null;
  /** The bottles that came back on it. */
  empties: number;
  /** The customer, matched by name as loyalty is: points earned on it, taken back by its refunds and voids, and now. Null on a walk-in. */
  customer: { phone: string | null; tier: string | null; balance: number; earned: number; returned: number } | null;
  voidReason: string | null;
  shift: { id: string; shiftNo: string; registerName: string; status: string } | null;
  sourceSale: { id: string; saleNo: string } | null;
  fiscalReceipt: { status: string; fiscalNumber: string | null; lastError: string | null } | null;
  reversals: Array<{
    id: string;
    saleNo: string;
    saleType: string;
    totalAmount: Amount;
    depositAmount: Amount;
    postedAt: string | null;
    cashierName: string | null;
    /** The till rules' reason, as listed. */
    overrideReason: string | null;
    /** The manager who approved it with their PIN; null when nobody had to. */
    approvedByName: string | null;
    lines: Array<{ id: string; itemName: string; quantity: Amount; lineTotal: Amount }>;
    payments: PaymentLine[];
  }>;
  payments: Array<{ id: string; tenderType: TenderType; amount: Amount; currency: string | null; reference: string | null }>;
  lines: Array<{
    id: string;
    itemName: string;
    quantity: Amount;
    unitPrice: Amount;
    lineTotal: Amount;
    taxAmount: Amount;
    discountAmount: Amount;
    /** What its promotion took off, and which promotion (PRD-09). */
    promotionDiscount: number;
    promotion: { code: string; name: string } | null;
    depositAmount: Amount;
    depositRefunded: number;
    refundedQuantity: number;
    refundableQuantity: number;
  }>;
};

const n = (value: Amount | null | undefined) => Number(value ?? 0);
const cents = (value: number) => Math.round(value * 100) / 100;
/** "Sugar, 2kg" as a sentence says it: "sugar". */
const product = (itemName: string) => itemName.split(",")[0].toLowerCase();
/** "Cash", "Cash ZiG", "EcoCash": each way it was paid, once. */
const paidBy = (payments: PaymentLine[]) => [...new Set(payments.map((payment) => paymentLabel(payment.tenderType, payment.currency)))];
/** What the customer paid: the goods and the deposits on them. */
const paidOn = (row: { totalAmount: Amount; depositAmount: Amount }) => n(row.totalAmount) + n(row.depositAmount);
/** "Wrong item": a reason as the rules list it, kept as typed. */
const lower = (text: string) => `${text.charAt(0).toLowerCase()}${text.slice(1)}`;

type Glyph = React.ComponentType<{ className?: string }>;
const TENDER_GLYPH: Partial<Record<TenderType, Glyph>> = {
  CASH: Money,
  CARD: CreditCard,
  ECOCASH: DeviceMobile,
  INNBUCKS: Wallet,
  TRANSFER: Buildings,
  ON_ACCOUNT: AddressBook,
  VOUCHER: Ticket,
  LAYBY: Package,
};
const tenderGlyph = (tender: string): Glyph => TENDER_GLYPH[tender as TenderType] ?? Money;
/** A sale's glyph: its one way of paying, or the split. */
function saleGlyph(payments: PaymentLine[]): Glyph {
  const ways = [...new Set(payments.map((payment) => payment.tenderType))];
  return ways.length > 1 ? ArrowsSplit : tenderGlyph(ways[0] ?? "CASH");
}
/** What a row is called: the customer when there is one, else the first line "and 2 more". */
function rowTitle(row: SaleRow) {
  if (row.customerName) return row.customerName;
  const first = row.lines[0]?.itemName;
  if (!first) return "Walk-in";
  return row.lineCount > 1 ? `${first} and ${row.lineCount - 1} more` : first;
}

/* ─── Filters, and the list a page at a time ─────────────────────────── */

type When = "shift" | "today" | "week" | "all";
type What = "all" | "paid" | "refunded" | "voided";
type Filters = { when: When; what: What; paidBy: string; search: string };

const PAGE = 40;
/** The Harare calendar day of an instant, as YYYY-MM-DD: the key a day’s group is made on. */
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: SHOP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
/** Midnight, Harare (UTC+2 all year), `daysBack` days before today. */
function harareMidnight(daysBack: number) {
  const today = dayKey.format(new Date());
  return new Date(new Date(`${today}T00:00:00+02:00`).getTime() - daysBack * 86_400_000);
}

function salesQuery(filters: Filters, shiftId: string | null) {
  const params = new URLSearchParams({ scope: "mine", saleType: "SALE", limit: String(PAGE) });
  if (filters.search) params.set("search", filters.search);
  if (filters.when === "shift" && shiftId) params.set("shiftId", shiftId);
  if (filters.when === "today") params.set("from", harareMidnight(0).toISOString());
  if (filters.when === "week") params.set("from", harareMidnight(6).toISOString());
  if (filters.what === "paid") params.set("status", "POSTED");
  if (filters.what === "voided") params.set("status", "VOIDED");
  if (filters.what === "refunded") params.set("refunded", "1");
  if (filters.paidBy !== "any") {
    const [tender, currency] = filters.paidBy.split(":");
    params.set("tender", tender);
    if (currency) params.set("currency", currency);
  }
  return params;
}

function useSalesPages(filters: Filters, shiftId: string | null) {
  const params = salesQuery(filters, shiftId);
  return useInfiniteQuery({
    queryKey: ["retail-pos-sales", "history", params.toString()] as const,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const page = new URLSearchParams(params);
      if (pageParam) page.set("cursor", pageParam);
      return fetchJson<{ data: SaleRow[]; page: { nextCursor: string | null; hasMore: boolean } }>(`/api/v2/retail/pos/sales?${page}`);
    },
    getNextPageParam: (last) => (last.page.hasMore ? last.page.nextCursor : null),
  });
}

/** The tag after a row's name; none on a sale that simply went through. */
function saleTag(row: Pick<SaleRow, "saleType" | "status" | "refunded">) {
  if (row.saleType === "REFUND") return "Refund";
  if (row.saleType === "VOID") return "Void";
  if (row.status === "VOIDED") return "Voided";
  if (row.refunded === "ALL") return "Refunded";
  if (row.refunded === "PART") return "Part refunded";
  return null;
}

/** The change as it was handed back (W-05): whole US dollars, then ZiG notes for what was under a dollar. */
function handedBack(sale: SaleDetail) {
  const change = Math.abs(n(sale.changeAmount));
  const zigNotes = Math.abs(n(sale.changeZig));
  if (!zigNotes || sale.tenderedAmount === null) return { usd: change, zig: 0 };
  const owed = n(sale.tenderedAmount) - paidOn(sale);
  return { usd: Math.min(Math.floor(owed + 1e-9), change), zig: zigNotes };
}

/** "+14 on this sale, 210 now"; once refunded, "+14, then −3 back, 207 now". */
function pointsWords(customer: NonNullable<SaleDetail["customer"]>) {
  const now = `${whole(customer.balance)} now`;
  if (!customer.earned) return `None on this sale, ${now}`;
  if (!customer.returned) return `+${whole(customer.earned)} on this sale, ${now}`;
  return `+${whole(customer.earned)}, then −${whole(customer.returned)} back, ${now}`;
}

const WHEN_OPTIONS: Array<{ value: When; label: string }> = [
  { value: "shift", label: "This shift" },
  { value: "today", label: "Today" },
  { value: "week", label: "7 days" },
  { value: "all", label: "Everything" },
];
const WHAT_OPTIONS: Array<{ value: Exclude<What, "all">; label: string }> = [
  { value: "paid", label: "Paid" },
  { value: "refunded", label: "Refunded" },
  { value: "voided", label: "Voided" },
];

function filterQuery(filters: Filters) {
  const params = new URLSearchParams();
  params.set("when", filters.when);
  if (filters.what !== "all") params.set("what", filters.what);
  if (filters.paidBy !== "any") params.set("paid", filters.paidBy);
  if (filters.search) params.set("q", filters.search);
  return params.toString();
}

/** The filters and the chosen sale, as History’s address carries them: a reload and the way back keep them. */
function useFilters() {
  const params = useSearchParams();
  const { shiftHere, isPosHost } = useTill();
  const asked = params.get("when");
  const when = WHEN_OPTIONS.find((option) => option.value === asked && (asked !== "shift" || shiftHere))?.value;
  const filters: Filters = {
    when: when ?? (shiftHere ? "shift" : "today"),
    what: WHAT_OPTIONS.find((option) => option.value === params.get("what"))?.value ?? "all",
    paidBy: params.get("paid") ?? "any",
    search: params.get("q") ?? "",
  };
  const base = getPosPortalHref("history", isPosHost);
  // A new filter opens its first sale, so the chosen one is dropped. The address changes in place: no trip to the server.
  const set = (change: Partial<Filters>) => window.history.replaceState(null, "", `${base}?${filterQuery({ ...filters, ...change })}`);
  const text = filterQuery(filters);
  return { filters, set, chosen: params.get("sale"), saleHref: (id: string) => `${base}?${text}&sale=${id}` };
}

/** "Today", "Yesterday", or "Sunday 4 October". */
function dayTitle(key: string, at: string) {
  if (key === dayKey.format(new Date())) return "Today";
  if (key === dayKey.format(new Date(Date.now() - 86_400_000))) return "Yesterday";
  return weekdayDayMonth(at);
}

type Item =
  | { kind: "head"; key: string; title: string; rows: SaleRow[] }
  | { kind: "row"; key: string; row: SaleRow };

/** The rows, with a heading where the day changes when the list runs over more than one day. */
function groupItems(rows: SaleRow[], when: When): Item[] {
  if (when === "shift" || when === "today") return rows.map((row) => ({ kind: "row", key: row.id, row }));
  const out: Item[] = [];
  let head: Extract<Item, { kind: "head" }> | null = null;
  for (const row of rows) {
    const key = dayKey.format(new Date(row.postedAt));
    if (!head || head.key !== key) {
      head = { kind: "head", key, title: dayTitle(key, row.postedAt), rows: [] };
      out.push(head);
    }
    head.rows.push(row);
    out.push({ kind: "row", key: row.id, row });
  }
  return out;
}

/** A key from anywhere but a field, a menu or a dialog. */
function freeKey(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return false;
  const target = event.target as HTMLElement | null;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return false;
  return !document.querySelector('[role="dialog"], [role="menu"]');
}

/* ─── The screen ─────────────────────────────────────────────────────── */

/** What came back on a refund just done, for the column that says so. */
type RefundedNow = {
  saleId: string;
  saleNo: string;
  done: RefundDone;
  reason: string;
  back: string;
  restock: boolean;
  approvedBy: string | null;
  at: Date;
};

type Mode = { kind: "record" } | { kind: "refund"; sale: SaleDetail } | { kind: "refunded"; refunded: RefundedNow };

/** `/history/[id]`: History with that sale chosen. */
export function SaleScreen({ id }: { id: string }) {
  return <HistoryScreen chosen={id} />;
}

export function HistoryScreen({ chosen: routeChosen }: { chosen?: string } = {}) {
  const [mode, setMode] = React.useState<Mode>({ kind: "record" });
  const [phoneRecord, setPhoneRecord] = React.useState(Boolean(routeChosen));
  const { filters, set, chosen: asked, saleHref } = useFilters();
  const { shiftHere } = useTill();
  const query = useSalesPages(filters, shiftHere?.id ?? null);
  const rows = React.useMemo(() => query.data?.pages.flatMap((page) => page.data) ?? [], [query.data]);
  const chosen = asked ?? routeChosen ?? rows[0]?.id ?? null;

  if (mode.kind === "refund") {
    return (
      <div className="bench hx is-refund">
        <RefundScreen
          sale={mode.sale}
          onBack={() => setMode({ kind: "record" })}
          onDone={(refunded) => setMode(refunded ? { kind: "refunded", refunded } : { kind: "record" })}
        />
      </div>
    );
  }

  const refunded = mode.kind === "refunded" && mode.refunded.saleId === chosen ? mode.refunded : null;
  return (
    <div className={`bench hx${phoneRecord ? " is-sale" : ""}`}>
      <HistoryList
        filters={filters}
        setFilters={set}
        saleHref={saleHref}
        query={query}
        rows={rows}
        chosen={chosen}
        onChoose={() => {
          setMode({ kind: "record" });
          setPhoneRecord(true);
        }}
      />
      <aside className={`bench-side hx-side${refunded ? " is-done" : ""}`} aria-label={refunded ? "Refunded" : "The sale"}>
        {refunded ? (
          <Refunded refunded={refunded} onDone={() => setMode({ kind: "record" })} />
        ) : chosen ? (
          <SaleRecord
            key={chosen}
            id={chosen}
            saleHref={saleHref}
            onRefund={(sale) => setMode({ kind: "refund", sale })}
            onBack={() => setPhoneRecord(false)}
          />
        ) : null}
      </aside>
    </div>
  );
}

/* ─── The list ───────────────────────────────────────────────────────── */

function HistoryList({
  filters,
  setFilters,
  saleHref,
  query,
  rows,
  chosen,
  onChoose,
}: {
  filters: Filters;
  setFilters: (change: Partial<Filters>) => void;
  saleHref: (id: string) => string;
  query: ReturnType<typeof useSalesPages>;
  rows: SaleRow[];
  chosen: string | null;
  onChoose: () => void;
}) {
  const { shiftHere, context } = useTill();
  const [typed, setTyped] = React.useState(filters.search);
  const [searching, setSearching] = React.useState(Boolean(filters.search));
  const searchNow = React.useRef(setFilters);
  searchNow.current = setFilters;
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      if (typed.trim() !== filters.search) searchNow.current({ search: typed.trim() });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [typed, filters.search]);
  const items = React.useMemo(() => groupItems(rows, filters.when), [rows, filters.when]);
  const ways = [{ value: "any", label: "All" }, ...(context?.tenders ?? []).map((tender) => ({ value: tenderKey(tender), label: tender.label }))];
  const filtered = filters.what !== "all" || filters.paidBy !== "any" || Boolean(filters.search);
  // "1 of 10 sales": the period's own count beside what the filters leave.
  const everything = useSalesPages({ ...filters, what: "all", paidBy: "any", search: "" }, shiftHere?.id ?? null);
  const all = everything.data?.pages.flatMap((page) => page.data).length ?? 0;
  const many = (length: number, more: boolean) => `${length}${more ? "+" : ""}`;
  const sales = filtered
    ? `${many(rows.length, Boolean(query.hasNextPage))} of ${count(all, "sale").replace(/^\d+/, many(all, Boolean(everything.hasNextPage)))}`
    : count(rows.length, "sale").replace(/^\d+/, many(rows.length, Boolean(query.hasNextPage)));

  const scroller = React.useRef<HTMLDivElement>(null);
  const windowed = useVirtualizer({
    count: items.length,
    getScrollElement: () => scroller.current,
    estimateSize: (index) => (items[index]?.kind === "head" ? 48 : 68),
    getItemKey: (index) => `${items[index]?.kind}:${items[index]?.key}`,
    overscan: 8,
  });
  const shown = windowed.getVirtualItems();
  const lastShown = shown[shown.length - 1]?.index ?? 0;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  React.useEffect(() => {
    if (lastShown >= items.length - 10 && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [lastShown, items.length, hasNextPage, isFetchingNextPage, fetchNextPage]);
  // The chosen sale in view, once, when History opens on it.
  const placed = React.useRef(false);
  React.useEffect(() => {
    if (placed.current || !chosen || !items.length) return;
    placed.current = true;
    const at = items.findIndex((item) => item.kind === "row" && item.row.id === chosen);
    if (at > 0) windowed.scrollToIndex(at, { align: "center" });
  }, [chosen, items, windowed]);

  return (
    <main className="main hx-main" aria-label="History">
      <div className="hx-head">
        <h1>History</h1>
        {!searching ? (
          <span className="hx-sub">
            {filters.when === "shift" && shiftHere ? (
              <>
                Since <span className="num">{hhmm(shiftHere.openedAt)}</span> ·{" "}
              </>
            ) : null}
            {query.isPending ? null : sales}
          </span>
        ) : null}
        <span className="grow" />
        {searching ? (
          <label className="input-wrap hx-search">
            <MagnifyingGlass className="ic" />
            <input
              type="search"
              aria-label="Find a sale"
              placeholder="Sale, customer or product"
              autoFocus
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
          </label>
        ) : null}
        <button
          type="button"
          className="btn btn-icon is-touch"
          aria-label={searching ? "Close the search" : "Find a sale"}
          onClick={() => {
            if (searching) {
              setTyped("");
              if (filters.search) setFilters({ search: "" });
            }
            setSearching(!searching);
          }}
        >
          {searching ? <X className="ic" /> : <MagnifyingGlass className="ic" />}
        </button>
      </div>
      <div className="hx-pills" role="radiogroup" aria-label="Paid by">
        {ways.map((way) => (
          <button key={way.value} type="button" role="radio" className="hx-pill" aria-checked={filters.paidBy === way.value} onClick={() => setFilters({ paidBy: way.value })}>
            {way.label}
          </button>
        ))}
      </div>
      <div className="hx-pills is-quiet">
        <div className="hx-pills" role="radiogroup" aria-label="When">
          {(shiftHere ? WHEN_OPTIONS : WHEN_OPTIONS.filter((option) => option.value !== "shift")).map((option) => (
            <button key={option.value} type="button" role="radio" className="hx-pill is-quiet" aria-checked={filters.when === option.value} onClick={() => setFilters({ when: option.value })}>
              {option.label}
            </button>
          ))}
        </div>
        <span className="hx-sep" aria-hidden="true" />
        <div className="hx-pills" role="group" aria-label="What happened">
          {WHAT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="hx-pill is-quiet"
              aria-pressed={filters.what === option.value}
              onClick={() => setFilters({ what: filters.what === option.value ? "all" : option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {query.isPending ? (
        <div className="hx-list" aria-busy="true">
          {[0, 1, 2, 3].map((index) => (
            <span key={index} className="skeleton hx-skeleton" />
          ))}
        </div>
      ) : query.isError ? (
        <LoadFailed icon={Receipt} title="Your sales did not load" error={query.error} onRetry={() => void query.refetch()} />
      ) : !rows.length ? (
        <Empty icon={Receipt} title={filters.search ? `No sale matches “${filters.search}”` : filtered ? "No sales like that" : "No sales yet"} />
      ) : (
        <div className="hx-list" ref={scroller}>
          <div className="windowed" style={{ height: windowed.getTotalSize() }}>
            {shown.map((virtual) => {
              const item = items[virtual.index];
              if (!item) return null;
              const place = { transform: `translateY(${virtual.start}px)` };
              if (item.kind === "head") {
                return (
                  <div key={virtual.key} ref={windowed.measureElement} data-index={virtual.index} className="windowed-item" style={place}>
                    <div className="hx-day">
                      <h2>{item.title}</h2>
                      <span className="num">
                        {count(item.rows.length, "sale")} · {usd(item.rows.reduce((sum, row) => sum + paidOn(row), 0))}
                      </span>
                    </div>
                  </div>
                );
              }
              const row = item.row;
              const Icon = saleGlyph(row.payments);
              const tag = saleTag(row);
              return (
                <div key={virtual.key} ref={windowed.measureElement} data-index={virtual.index} className="windowed-item hx-item" style={place}>
                  <Link
                    className="hx-row"
                    href={saleHref(row.id)}
                    aria-current={row.id === chosen ? "true" : undefined}
                    onClick={(event) => {
                      if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                      event.preventDefault();
                      window.history.replaceState(null, "", saleHref(row.id));
                      onChoose();
                    }}
                  >
                    <span className="hx-glyph">
                      <Icon className="ic" />
                    </span>
                    <span className="hx-text">
                      <span className="hx-t">
                        <span className="truncate">{rowTitle(row)}</span>
                        {tag ? <span className="hx-tag">{tag}</span> : null}
                      </span>
                      <span className="hx-s">
                        <span className="num">{row.saleNo}</span> · <span className="num">{hhmm(row.postedAt)}</span> · {paidBy(row.payments).join(" and ") || "Cash"}
                        {row.overrideReason ? " · discount approved" : null}
                      </span>
                    </span>
                    <span className="hx-v num">{usd(paidOn(row))}</span>
                  </Link>
                </div>
              );
            })}
          </div>
          {isFetchingNextPage ? <span className="skeleton hx-skeleton" /> : null}
        </div>
      )}
    </main>
  );
}

/* ─── A sale's record ────────────────────────────────────────────────── */

type Fact = { key: string; icon: Glyph; label: React.ReactNode; value?: React.ReactNode; href?: string };

function Facts({ facts }: { facts: Fact[] }) {
  if (!facts.length) return null;
  return (
    <dl className="facts hx-facts">
      {facts.map((fact) => {
        const body = (
          <>
            <fact.icon className="ic" />
            <dt>{fact.label}</dt>
            <dd>{fact.value ?? ""}</dd>
          </>
        );
        return fact.href ? (
          <Link
            key={fact.key}
            className="fact is-link"
            href={fact.href}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey) return;
              event.preventDefault();
              window.history.replaceState(null, "", fact.href);
            }}
          >
            {body}
          </Link>
        ) : (
          <div key={fact.key} className="fact">
            {body}
          </div>
        );
      })}
    </dl>
  );
}

/** "Refunded 2 × beer, wrong item": what a refund or void took off a sale. */
function reversalWords(entry: SaleDetail["reversals"][number]) {
  const voided = entry.saleType === "VOID";
  const back = entry.lines.map((line) => `${qty(Math.abs(n(line.quantity)))} × ${product(line.itemName)}`).join(", ");
  const reason = entry.overrideReason?.trim();
  return [`${voided ? "Voided" : "Refunded"}${back ? ` ${back}` : ""}`, reason ? lower(reason) : null, entry.approvedByName ? `approved by ${entry.approvedByName}` : null]
    .filter(Boolean)
    .join(", ");
}

function saleFacts(sale: SaleDetail, printedAgain: string | null, saleHref: (id: string) => string): Fact[] {
  const isSale = sale.saleType === "SALE";
  const facts: Fact[] = [];
  if (!isSale) {
    if (sale.sourceSale) {
      facts.push({ key: "source", icon: Receipt, label: sale.saleType === "REFUND" ? "Refund on" : "Void of", value: sale.sourceSale.saleNo, href: saleHref(sale.sourceSale.id) });
    }
    const why = sale.voidReason || sale.overrideReason;
    if (why) facts.push({ key: "why", icon: ListBullets, label: why });
    if (sale.approvedByName) facts.push({ key: "approved", icon: UserCheck, label: `Approved by ${sale.approvedByName}` });
  }
  // Cash handed over: what was tendered less what the other tenders took.
  const cash = sale.payments.filter((payment) => payment.tenderType === "CASH");
  const nonCash = sale.payments.filter((payment) => payment.tenderType !== "CASH").reduce((sum, payment) => sum + n(payment.amount), 0);
  const handed = sale.tenderedAmount !== null && cash.length === 1 && cash[0]!.currency !== "ZWG" ? n(sale.tenderedAmount) - nonCash : 0;
  for (const payment of sale.payments) {
    const label = paymentLabel(payment.tenderType, payment.currency);
    const amount = Math.abs(n(payment.amount));
    const words =
      payment.tenderType === "CASH" && handed > amount + 0.004
        ? `${label}, ${usd(handed)} handed`
        : payment.reference
          ? `${label} · ${payment.reference}`
          : label;
    facts.push({ key: `pay-${payment.id}`, icon: tenderGlyph(payment.tenderType), label: words, value: payment.currency === "ZWG" ? zig(amount) : usd(amount) });
  }
  const change = handedBack(sale);
  if (change.zig) facts.push({ key: "change", icon: Money, label: "Change", value: `${usd(change.usd)} and ${zig(change.zig)}` });
  if (n(sale.depositAmount)) facts.push({ key: "deposits", icon: Recycle, label: "Deposits", value: usd(Math.abs(n(sale.depositAmount))) });
  if (sale.empties) facts.push({ key: "empties", icon: Recycle, label: "Empties back", value: count(sale.empties, "bottle") });
  for (const line of sale.lines) {
    if (line.promotion && line.promotionDiscount > 0) {
      facts.push({ key: `promo-${line.id}`, icon: Tag, label: `${line.promotion.name}, ${product(line.itemName)}`, value: usd(-line.promotionDiscount) });
    }
  }
  if (isSale && sale.overrideReason) {
    facts.push({ key: "discount", icon: Tag, label: sale.approvedByName ? `Discount approved by ${sale.approvedByName}: ${lower(sale.overrideReason)}` : `Discount approved: ${lower(sale.overrideReason)}` });
  }
  if (sale.idCheckedAt) facts.push({ key: "id", icon: IdentificationCard, label: "ID checked, 18 or over", value: hhmm(sale.idCheckedAt) });
  if (sale.customer && sale.customerName && isSale) facts.push({ key: "points", icon: Star, label: `${firstName(sale.customerName)}’s points`, value: pointsWords(sale.customer) });
  for (const entry of sale.reversals) {
    facts.push({
      key: `rev-${entry.id}`,
      icon: entry.saleType === "VOID" ? Prohibit : ArrowUDownLeft,
      label: reversalWords(entry),
      value: `${usd(Math.abs(paidOn(entry)))}${entry.postedAt ? ` · ${hhmm(entry.postedAt)}` : ""}`,
      href: saleHref(entry.id),
    });
  }
  if (printedAgain) facts.push({ key: "printed", icon: Printer, label: "Printed again", value: printedAgain });
  else if (sale.printedAt) facts.push({ key: "printed", icon: Printer, label: "Receipt printed", value: hhmm(sale.printedAt) });
  const fiscal = sale.fiscalReceipt;
  if (fiscal && fiscal.status !== "SKIPPED") {
    if (fiscal.status === "SUCCESS") facts.push({ key: "fiscal", icon: Stamp, label: "Fiscal code", value: fiscal.fiscalNumber ?? "" });
    else if (fiscal.status === "PENDING") facts.push({ key: "fiscal", icon: Timer, label: "Fiscal code", value: "to follow" });
    else facts.push({ key: "fiscal", icon: WarningCircle, label: `${fiscalStatusLabel(fiscal.status)}${fiscal.lastError ? `: ${fiscal.lastError}` : ""}` });
  }
  return facts;
}

function SaleRecord({
  id,
  saleHref,
  onRefund,
  onBack,
}: {
  id: string;
  saleHref: (id: string) => string;
  onRefund: (sale: SaleDetail) => void;
  onBack: () => void;
}) {
  const { isPosHost, shiftHere } = useTill();
  const [voiding, setVoiding] = React.useState(false);
  const [more, setMore] = React.useState(false);
  const [printedAgain, setPrintedAgain] = React.useState<string | null>(null);
  const query = useQuery({
    queryKey: ["retail-pos-sale", id],
    queryFn: async () => (await fetchJson<{ data: SaleDetail }>(`/api/v2/retail/pos/sales/${id}`)).data,
  });
  const sale = query.data;
  const receiptHref = `${isPosHost ? "" : "/portal/pos"}/receipt/${id}`;
  const printAgain = () => {
    printReceipt(receiptHref);
    setPrintedAgain(hhmm(new Date()));
  };

  useWindowKeys((event) => {
    if (!sale || !freeKey(event)) return;
    if (event.key === "p" || event.key === "P") {
      event.preventDefault();
      printAgain();
    }
  });

  if (query.isLoading) {
    return (
      <div className="bar sale-head" aria-busy="true">
        <span className="skeleton is-title" />
      </div>
    );
  }
  if (!sale) {
    return <LoadFailed icon={Receipt} title="That sale did not load" error={query.error} onRetry={() => void query.refetch()} />;
  }

  const isSale = sale.saleType === "SALE";
  const voided = sale.status === "VOIDED";
  const refundable = isSale && !voided && sale.lines.some((line) => line.refundableQuantity > 0);
  // Only today's sale with nothing reversed off it is voided (FLR-02's `voidableToday`); after that it is a refund.
  const voidableToday = isSale && !voided && sale.reversals.length === 0 && dayKey.format(new Date(sale.postedAt ?? sale.createdAt)) === dayKey.format(new Date());
  const when = sale.postedAt ?? sale.createdAt;
  const items = sale.lines.reduce((sum, line) => sum + Math.abs(n(line.quantity)), 0);
  const facts = saleFacts(sale, printedAgain, saleHref);

  return (
    <>
      <div className="bar sale-head">
        <button type="button" className="btn btn-icon is-touch when-phone" aria-label="Back to History" onClick={onBack}>
          <CaretLeft className="ic" />
        </button>
        <h1>{isSale ? "Sale" : sale.saleType === "REFUND" ? "Refund" : "Void"}</h1>
        <span className="hx-code num">
          {sale.saleNo} · {hhmm(when)}
        </span>
        <div className="end">
          {sale.customerName ? <span className="customer-pill hx-customer">{sale.customerName}</span> : null}
          {voidableToday ? (
            <TillPopover
              open={more}
              onOpenChange={setMore}
              label="More"
              align="end"
              size="sm"
              trigger={
                <button type="button" className="btn btn-icon is-touch" aria-label="More">
                  <DotsThree className="ic" />
                </button>
              }
            >
              <div className="menu is-flat" role="menu" aria-label="More">
                <button
                  type="button"
                  className="menu-item"
                  role="menuitem"
                  onClick={() => {
                    setMore(false);
                    setVoiding(true);
                  }}
                >
                  <Prohibit className="ic" />
                  Void {sale.saleNo}
                </button>
              </div>
            </TillPopover>
          ) : null}
        </div>
      </div>
      <div className="hx-scroll">
        <div className="hx-lines">
          {sale.lines.map((line) => {
            const sold = Math.abs(n(line.quantity));
            return (
              <div key={line.id} className="hx-line">
                <span className="hx-q num">{qty(sold)} ×</span>
                <span className="hx-text">
                  <span className="hx-n">{line.itemName}</span>
                  <span className="hx-each num">
                    {usd(Math.abs(n(line.unitPrice)))} each
                    {line.refundedQuantity > 0 ? ` · ${qty(line.refundedQuantity)} back` : ""}
                  </span>
                </span>
                <span className="hx-v num">{usd(Math.abs(n(line.lineTotal)))}</span>
              </div>
            );
          })}
        </div>
        <span className="grow" />
        <Facts facts={facts} />
      </div>
      <div className="hx-sum">
        <span>{count(items, "item")}</span>
        <span className="num">VAT {usd(Math.abs(n(sale.taxAmount)))}</span>
      </div>
      <div className={`hx-keys${refundable ? "" : " is-one"}`}>
        {refundable ? (
          <button type="button" className="hx-key" onClick={() => onRefund(sale)}>
            <ArrowUDownLeft className="ic" />
            Refund
          </button>
        ) : null}
        <button type="button" className="take-key" onClick={printAgain}>
          <Printer className="ic" />
          Print again
          <span className="kbd on-primary" aria-hidden="true">
            P
          </span>
        </button>
      </div>
      {voiding ? <VoidDialog sale={sale} shiftId={shiftHere?.id ?? null} onClose={() => setVoiding(false)} /> : null}
    </>
  );
}

function invalidateSale(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["retail-pos-sale"] });
  void queryClient.invalidateQueries({ queryKey: ["retail-pos-sales"] });
  void queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
}

/** A network failure, not a no from the server: the till holds the act and sends it later. */
function lineDown(error: unknown) {
  if (error instanceof ApiError) return false;
  return /network|failed to fetch|load failed/i.test(getApiErrorMessage(error)) || (typeof navigator !== "undefined" && !navigator.onLine);
}

const DAMAGED = "Damaged";

/** "Cash back", "Back on EcoCash", "Credit note": how the money goes back, as the column names it. */
function backAs(to: RefundTo, tender: string | null) {
  if (to === "CASH") return "Cash back";
  if (to === "ORIGINAL") return `Back on ${originalLabel(tender ?? "").replace(/^The /, "the ")}`;
  return TO_LABELS[to];
}
const BACK_GLYPH: Record<RefundTo, Glyph> = { CASH: Money, ORIGINAL: CreditCard, CREDIT_NOTE: Ticket, VOUCHER: Ticket };

/* ─── Refund ─────────────────────────────────────────────────────────── */

/**
 * Refund lines (W-41, T3-2): what comes back line by line, the reason from the
 * till rules' list, how the money goes back, and whether the goods go back on
 * the shelf. Over the refund PIN limit the server asks for a manager and the
 * approval dialog sends it again with their PIN. With the line down it is
 * saved on the till and goes in for review when it is sent (SET-06).
 */
function RefundScreen({ sale, onBack, onDone }: { sale: SaleDetail; onBack: () => void; onDone: (refunded: RefundedNow | null) => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { rules, approvers, canApprove, queueReversal, shiftHere } = useTill();
  const reasons = rules?.refundReasons ?? [];
  const [back, setBack] = React.useState<Record<string, number>>({});
  const [why, setWhy] = React.useState(reasons[0] ?? "");
  // FLR-02: back on the one card, wallet, transfer or voucher it was paid by, else cash from this drawer.
  const only = sale.payments.length === 1 ? sale.payments[0]!.tenderType : null;
  const original = only && (ORIGINAL_TENDERS as readonly string[]).includes(only) ? only : null;
  const ways: Array<{ value: RefundTo; label: string }> = [
    ...(original ? [{ value: "ORIGINAL" as const, label: originalLabel(original) }] : []),
    { value: "CASH", label: TO_LABELS.CASH },
    { value: "CREDIT_NOTE", label: TO_LABELS.CREDIT_NOTE },
    { value: "VOUCHER", label: TO_LABELS.VOUCHER },
  ];
  const [to, setTo] = React.useState<RefundTo>(original ? "ORIGINAL" : "CASH");
  const [shelf, setShelf] = React.useState(true);
  const [customer, setCustomer] = React.useState<PosCustomer | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const shiftId = shiftHere?.id ?? null;
  const damaged = why === DAMAGED;
  const restock = shelf && !damaged;
  const limit = rules ? `${rules.currency}${Number(rules.refundPinOver).toFixed(2)}` : "";

  // The goods' share of the line and, with them, the bottles' deposit, as the server works it out.
  const lineBack = (line: SaleDetail["lines"][number], quantity: number) => {
    const sold = Math.abs(n(line.quantity));
    if (!quantity || !sold) return 0;
    const deposit = depositBack(
      { quantity: sold, depositAmount: n(line.depositAmount), depositRefunded: line.depositRefunded },
      quantity,
      line.refundableQuantity,
    );
    return cents(Math.abs(n(line.lineTotal)) * (quantity / sold)) + deposit;
  };
  const amount = cents(sale.lines.reduce((sum, line) => sum + lineBack(line, back[line.id] ?? 0), 0));
  const vat = cents(sale.lines.reduce((sum, line) => {
    const sold = Math.abs(n(line.quantity));
    return sold ? sum + Math.abs(n(line.taxAmount)) * ((back[line.id] ?? 0) / sold) : sum;
  }, 0));
  const approval = useApproval({ approvers: approvers.sell, reason: limit ? `Refund over ${limit}` : undefined, amount: usd(amount) });
  const approvedBy = React.useRef<string | null>(null);
  // The rules' limit is on the sale's refunds together.
  const alreadyBack = sale.reversals.filter((entry) => entry.saleType === "REFUND").reduce((sum, entry) => sum + Math.abs(paidOn(entry)), 0);
  const items = Object.values(back).reduce((sum, value) => sum + value, 0);
  const coming = sale.lines.filter((line) => (back[line.id] ?? 0) > 0);

  const body = () => ({
    reason: why,
    lines: Object.entries(back)
      .filter(([, value]) => value > 0)
      .map(([saleLineId, quantity]) => ({ saleLineId, quantity: String(quantity) })),
    to,
    restock,
    ...(to === "CREDIT_NOTE" && !sale.customer && customer ? { customerId: customer.id } : {}),
  });

  const submit = () => {
    if (busy) return;
    if (!shiftId && to === "CASH") return setProblem("Open a shift on this till first: the money comes out of its drawer.");
    if (!items) return setProblem("Say what comes back: one or more of a line.");
    if (!why) return setProblem("Say why it came back.");
    if (to === "CREDIT_NOTE" && !sale.customer && !customer) return setProblem("A credit note needs a customer.");
    setProblem(null);
    setBusy(true);
    const request = body();
    approvedBy.current = null;
    approval
      .run((approver) => {
        approvedBy.current = approver ? (approvers.sell.find((entry) => entry.userId === approver.userId)?.short ?? null) : null;
        return fetchJson<RefundDone>(`/api/v2/retail/pos/sales/${sale.id}/refund`, {
          method: "POST",
          body: JSON.stringify({ ...request, ...(approver ? { approver } : {}) }),
        });
      })
      .then((done) => {
        if (!done) return;
        invalidateSale(queryClient);
        onDone({
          saleId: sale.id,
          saleNo: sale.saleNo,
          done,
          reason: why,
          back: coming.map((line) => `${qty(back[line.id] ?? 0)} × ${line.itemName}`).join(", "),
          restock,
          approvedBy: approvedBy.current,
          at: new Date(),
        });
      })
      .catch(async (error: unknown) => {
        if (!lineDown(error)) return setProblem(getApiErrorMessage(error));
        const payload: PosReversalQueuePayload = {
          kind: "refund",
          saleId: sale.id,
          saleNo: sale.saleNo,
          amount,
          already: alreadyBack,
          saleAt: sale.postedAt ?? sale.createdAt,
          at: new Date().toISOString(),
          body: request,
        };
        if (!(await queueReversal(payload))) return setProblem(getApiErrorMessage(error));
        const manager = rules && reversalNeedsManager(payload, rules, canApprove);
        toast({
          title: `Refund of ${sale.saleNo} saved on this till.`,
          description: manager ? `${NEEDS_A_MANAGER}: it goes in for a manager to look at unless one approves it in Waiting to send.` : "It goes up when the line is back.",
        });
        onDone(null);
      })
      .finally(() => setBusy(false));
  };

  useWindowKeys((event) => {
    if (!freeKey(event)) return;
    if (event.key === "Enter" && (event.target as HTMLElement | null)?.tagName !== "BUTTON") {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onBack();
    }
  });

  const BackIcon = BACK_GLYPH[to];
  return (
    <>
      <main className="main hx-main" aria-label={`Refund ${sale.saleNo}`}>
        <div className="hx-head is-back">
          <button type="button" className="btn btn-icon is-touch" aria-label={`Back to ${sale.saleNo}`} onClick={onBack}>
            <ArrowLeft className="ic" />
          </button>
          <h1>
            Refund <span className="hx-h1-code num">{sale.saleNo}</span>
          </h1>
        </div>
        <div className="hx-form">
          <div className="hx-rlines">
            {sale.lines.map((line) => {
              const value = back[line.id] ?? 0;
              const sold = Math.abs(n(line.quantity));
              return (
                <div key={line.id} className={`hx-rline${value ? " is-on" : ""}`}>
                  <span className="hx-step" role="group" aria-label={`${line.itemName} back`}>
                    <button type="button" aria-label={`One fewer ${line.itemName}`} disabled={value === 0} onClick={() => setBack({ ...back, [line.id]: value - 1 })}>
                      <Minus className="ic" />
                    </button>
                    <span className="num">{value}</span>
                    <button type="button" aria-label={`One more ${line.itemName}`} disabled={value >= line.refundableQuantity} onClick={() => setBack({ ...back, [line.id]: value + 1 })}>
                      <Plus className="ic" />
                    </button>
                  </span>
                  <span className="hx-text">
                    <span className="hx-n">{line.itemName}</span>
                    <span className="hx-each num">
                      {qty(sold)} sold{line.refundedQuantity > 0 ? `, ${qty(line.refundedQuantity)} back` : ""} · {usd(Math.abs(n(line.unitPrice)))} each
                    </span>
                  </span>
                  <span className="hx-v num">{usd(lineBack(line, value))}</span>
                </div>
              );
            })}
          </div>
          <div className="hx-label">Reason</div>
          <div className="hx-pills is-wrap" role="radiogroup" aria-label="Reason">
            {reasons.map((entry) => (
              <button key={entry} type="button" role="radio" className="hx-pill" aria-checked={why === entry} onClick={() => setWhy(entry)}>
                {entry}
              </button>
            ))}
          </div>
          <div className="hx-label">Back as</div>
          <div className="hx-pills is-wrap" role="radiogroup" aria-label="Back as">
            {ways.map((entry) => (
              <button key={entry.value} type="button" role="radio" className="hx-pill" aria-checked={to === entry.value} onClick={() => setTo(entry.value)}>
                {entry.label}
              </button>
            ))}
          </div>
          {to === "CREDIT_NOTE" && !sale.customer ? <CustomerPicker value={customer} onChange={setCustomer} label="Whose credit note" /> : null}
          <label className="check hx-shelf">
            <input type="checkbox" className="switch" checked={restock} disabled={damaged} onChange={(event) => setShelf(event.target.checked)} />
            <span>Back on the shelf</span>
          </label>
        </div>
      </main>
      <aside className="bench-side hx-side" aria-label="Refund">
        <div className="bar sale-head">
          <h1>Refund</h1>
          <span className="hx-code num">{sale.saleNo}</span>
        </div>
        <div className="hx-scroll">
          <div className="hx-lines">
            {coming.map((line) => (
              <div key={line.id} className="hx-line">
                <span className="hx-q num">{qty(back[line.id] ?? 0)} ×</span>
                <span className="hx-text">
                  <span className="hx-n">{line.itemName}</span>
                  <span className="hx-each num">{usd(Math.abs(n(line.unitPrice)))} each</span>
                </span>
                <span className="hx-v num">{usd(lineBack(line, back[line.id] ?? 0))}</span>
              </div>
            ))}
          </div>
          <span className="grow" />
          <Facts facts={[{ key: "to", icon: BackIcon, label: backAs(to, original), value: usd(amount) }]} />
        </div>
        <div className="hx-sum">
          <span>{count(items, "item")}</span>
          <span className="num">VAT {usd(vat)}</span>
        </div>
        <div className="hx-keys is-one">
          {problem ? <ErrorLine>{problem}</ErrorLine> : null}
          <button type="button" className="take-key" disabled={!items || busy} aria-busy={busy || undefined} onClick={submit}>
            <ArrowUDownLeft className="ic" />
            Refund
            <span className="num">{usd(amount)}</span>
            {items ? (
              <span className="kbd on-primary" aria-hidden="true">
                ↵
              </span>
            ) : null}
          </button>
        </div>
      </aside>
      {approval.dialog}
    </>
  );
}

/** Refunded (T3-6): what went back, as large as Paid's change, its facts, then print the slip and Done. */
function Refunded({ refunded, onDone }: { refunded: RefundedNow; onDone: () => void }) {
  const { isPosHost } = useTill();
  const { done } = refunded;
  const slipHref = `${isPosHost ? "" : "/portal/pos"}/receipt/${done.id}`;
  useWindowKeys((event) => {
    if (!freeKey(event)) return;
    if (event.key === "n" || event.key === "N" || (event.key === "Enter" && (event.target as HTMLElement | null)?.tagName !== "BUTTON")) {
      event.preventDefault();
      onDone();
    }
  });
  const facts: Fact[] = [
    { key: "on", icon: Receipt, label: `Refund on ${refunded.saleNo}`, value: done.saleNo },
    { key: "what", icon: ListBullets, label: `${refunded.reason}, ${refunded.back}` },
    ...(refunded.approvedBy ? [{ key: "approved", icon: UserCheck, label: `Approved by ${refunded.approvedBy}`, value: hhmm(refunded.at) }] : []),
    ...(done.to === "CASH" && done.till ? [{ key: "drawer", icon: Tray, label: `Cash from ${done.till}`, value: hhmm(refunded.at) }] : []),
    ...(done.voucherCode ? [{ key: "code", icon: Ticket, label: TO_LABELS[done.to === "CREDIT_NOTE" ? "CREDIT_NOTE" : "VOUCHER"], value: done.voucherCode }] : []),
    { key: "shelf", icon: Package, label: refunded.restock ? "Back in stock" : "Written off" },
  ];
  return (
    <>
      <div className="hx-done">
        <div className="paid" role="status" aria-live="polite">
          <span className="paid-mark">
            <ArrowUDownLeft className="ic" />
          </span>
          <span className="paid-k">{backAs(done.to, done.tender)}</span>
          <span className="paid-v">{usd(Number(done.value))}</span>
        </div>
        <Facts facts={facts} />
      </div>
      <span className="grow" />
      <div className="sale-keys hx-done-keys">
        <button type="button" className="hold-key" aria-label="Print the refund slip" title="Print the refund slip" onClick={() => printReceipt(slipHref)}>
          <Printer className="ic" />
        </button>
        <button type="button" className="take-key" onClick={onDone}>
          Done
          <span className="kbd on-primary" aria-hidden="true">
            N
          </span>
        </button>
      </div>
    </>
  );
}

/* ─── Void ───────────────────────────────────────────────────────────── */

/** One of a few as chips: the void's reason. */
function ChoiceChips<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return (
    <div className="choice-chips" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" role="radio" aria-checked={option.value === value} className="btn btn-lg" onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Void (W-41): only today's sale with nothing reversed off it, for one of the
 * till rules' reasons. The void rule's manager comes through the approval
 * dialog; with the line down it is saved on the till for review.
 */
function VoidDialog({ sale, shiftId, onClose }: { sale: SaleDetail; shiftId: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { rules, approvers, canApprove, queueReversal } = useTill();
  const reasons = rules?.voidReasons ?? [];
  const [reason, setReason] = React.useState(reasons[0] ?? "");
  const [problem, setProblem] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const tenders = paidBy(sale.payments).map((label) => label.toLowerCase());
  const approval = useApproval({ approvers: approvers.sell, reason: `Void ${sale.saleNo}`, amount: usd(paidOn(sale)) });

  const submit = () => {
    if (!shiftId) return setProblem("Open a shift on this till first: the cash goes back out of its drawer.");
    if (!reason) return setProblem("Say why it is voided.");
    setProblem(null);
    setBusy(true);
    approval
      .run((approver) =>
        fetchJson(`/api/v2/retail/pos/sales/${sale.id}/void`, {
          method: "POST",
          body: JSON.stringify({ reason, ...(approver ? { approver } : {}) }),
        }),
      )
      .then((done) => {
        if (!done) return;
        invalidateSale(queryClient);
        toast({ title: `${sale.saleNo} voided.`, variant: "success" });
        onClose();
      })
      .catch(async (error: unknown) => {
        if (!lineDown(error)) return setProblem(getApiErrorMessage(error));
        const payload: PosReversalQueuePayload = {
          kind: "void",
          saleId: sale.id,
          saleNo: sale.saleNo,
          amount: Math.abs(paidOn(sale)),
          already: 0,
          saleAt: sale.postedAt ?? sale.createdAt,
          at: new Date().toISOString(),
          body: { reason },
        };
        if (!(await queueReversal(payload))) return setProblem(getApiErrorMessage(error));
        const manager = rules && reversalNeedsManager(payload, rules, canApprove);
        toast({
          title: `Void of ${sale.saleNo} saved on this till.`,
          description: manager ? `${NEEDS_A_MANAGER}: it goes in for a manager to look at unless one approves it in Waiting to send.` : "It goes up when the line is back.",
        });
        onClose();
      })
      .finally(() => setBusy(false));
  };

  return (
    <TillDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Void ${sale.saleNo}?`}
      description={`${sale.customerName || "Walk-in"}, ${count(sale.lines.length, "item")}, ${usd(paidOn(sale))} ${tenders.join(" and ") || "cash"}.`}
      foot={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Keep the sale
          </button>
          <button type="button" className="btn btn-danger" disabled={busy} aria-busy={busy || undefined} onClick={submit}>
            <Prohibit className="ic" />
            Void {sale.saleNo}
          </button>
        </>
      }
    >
      <div className="field">
        <span className="label">Reason</span>
        <ChoiceChips label="Reason" value={reason} options={reasons.map((entry) => ({ value: entry, label: entry }))} onChange={setReason} />
      </div>
      {problem ? <ErrorLine>{problem}</ErrorLine> : null}
      {approval.dialog}
    </TillDialog>
  );
}
