"use client";

/**
 * History: my sales, newest first, grouped by shift. A sale opens as its record:
 * what happened to it, with the one thing to do next. Refunds and voids happen
 * there, for one of the till rules' reasons, with a manager's PIN when the
 * rules ask for one and the person selling may not approve it themselves.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  ArrowsCounterClockwise,
  CaretLeft,
  CaretRight,
  IdentificationCard,
  Key,
  MagnifyingGlass,
  Minus,
  Money,
  Plus,
  Printer,
  Prohibit,
  Receipt,
  ReceiptX,
  SealCheck,
  Tag,
  X,
} from "@/lib/icons";
import { depositBack } from "@/lib/retail/deposits";
import { getPosPortalHref } from "@/lib/retail/pos-host";
import { refundPinSentence, VOID_FREE_MS, voidPinSentence } from "@/lib/retail/till-rule-words";
import { count, dayMonth, firstName, hhmm, paymentLabel, qty, usd, whole, zig } from "./format";
import { Avatar, Empty, ErrorLine, TillDialog } from "./parts";
import { printReceipt } from "./pay-tray";
import { useTill } from "./state";
import type { TenderType } from "./types";

type Amount = string | number;
type PaymentLine = { tenderType: TenderType; currency: string | null };

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
  overrideReason: string | null;
};

/** `pos/sales/{id}`: the sale, its lines and payments, and what was refunded or voided off it. */
type SaleDetail = {
  id: string;
  saleNo: string;
  saleType: "SALE" | "REFUND" | "VOID";
  status: string;
  postedAt: string | null;
  createdAt: string;
  customerName: string | null;
  cashierName: string | null;
  totalAmount: Amount;
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
  /** The bottles that came back on it, per supplier. */
  empties: Array<{ supplierId: string; supplierName: string; quantity: number }>;
  /** The customer, matched by name as loyalty is: points earned on it, taken back by its refunds and voids, and now. Null on a walk-in. */
  customer: { phone: string | null; tier: string; balance: number; earned: number; returned: number } | null;
  promotionCode: string | null;
  promotion?: { name: string } | null;
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
    discountAmount: Amount;
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
const SALES_KEY = (search: string) => ["retail-pos-sales", "mine", search] as const;

function useMySales(search: string) {
  return useQuery({
    queryKey: SALES_KEY(search),
    queryFn: () =>
      fetchJson<{ data: SaleRow[] }>(`/api/v2/retail/pos/sales?scope=mine&limit=120&search=${encodeURIComponent(search)}`),
  });
}

function saleStatus(row: { saleType: string; status: string }) {
  if (row.saleType === "REFUND") return { label: "Refund", tone: "" };
  if (row.saleType === "VOID") return { label: "Void", tone: "" };
  if (row.status === "VOIDED") return { label: "Voided", tone: "" };
  if (row.status === "REFUNDED") return { label: "Refunded", tone: "" };
  if (row.status === "PARTIALLY_REFUNDED") return { label: "Part refunded", tone: "status-success" };
  return { label: "Paid", tone: "status-success" };
}

/** The change as it was handed back (W-05): whole US dollars, then ZiG notes for what was under a dollar. */
function handedBack(sale: SaleDetail) {
  const change = Math.abs(n(sale.changeAmount));
  const zigNotes = Math.abs(n(sale.changeZig));
  if (!zigNotes || sale.tenderedAmount === null) return { usd: change, zig: 0 };
  const owed = n(sale.tenderedAmount) - paidOn(sale);
  return { usd: Math.min(Math.floor(owed + 1e-9), change), zig: zigNotes };
}

/** The manager who let it through, after the sentence: ". Farai Mutasa approved". */
function Approved({ by }: { by: string | null }) {
  return by ? (
    <>
      . <b>{by}</b> approved
    </>
  ) : null;
}

/** "Bronze", from the scheme's "BRONZE". */
const tierWord = (tier: string) => tier.charAt(0) + tier.slice(1).toLowerCase();

/** "+14 on this sale, 210 now"; once refunded, "+14, then −3 back, 207 now". */
function pointsWords(customer: NonNullable<SaleDetail["customer"]>) {
  const now = `${whole(customer.balance)} now`;
  if (!customer.earned) return `None on this sale, ${now}`;
  if (!customer.returned) return `+${whole(customer.earned)} on this sale, ${now}`;
  return `+${whole(customer.earned)}, then −${whole(customer.returned)} back, ${now}`;
}

/** "12 bottles on the ledger for Delta Beverages", a supplier at a time. */
const emptiesWords = (empties: SaleDetail["empties"]) =>
  empties.map((entry) => `${count(entry.quantity, "bottle")} on the ledger for ${entry.supplierName}`).join("; ");

/* ─── The list ───────────────────────────────────────────────────────── */

export function HistoryScreen() {
  const { shiftHere, isPosHost } = useTill();
  // The sale you came back from stays marked, so you find your place.
  const from = useSearchParams().get("from");
  const [search, setSearch] = React.useState("");
  const [typed, setTyped] = React.useState("");
  React.useEffect(() => {
    const timer = window.setTimeout(() => setSearch(typed.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [typed]);
  const query = useMySales(search);
  const rows = query.data?.data ?? [];
  // Refunds and voids are written on the sale they came from, not listed beside it.
  const listed = rows.filter((row) => row.saleType === "SALE");
  const here = rows.filter((row) => shiftHere && row.shiftId === shiftHere.id);
  const earlier = rows.filter((row) => !shiftHere || row.shiftId !== shiftHere.id);
  const sales = here.filter((row) => row.saleType === "SALE");
  const voided = here.filter((row) => row.saleType === "SALE" && row.status === "VOIDED");
  const refunds = here.filter((row) => row.saleType === "REFUND");
  const taken =
    sales.filter((row) => row.status !== "VOIDED").reduce((sum, row) => sum + paidOn(row), 0) -
    refunds.reduce((sum, row) => sum + Math.abs(paidOn(row)), 0);
  const voidedTotal = voided.reduce((sum, row) => sum + paidOn(row), 0);
  const base = getPosPortalHref("history", isPosHost);

  const group = (id: string, title: string, list: SaleRow[]) =>
    list.length ? (
      <section aria-labelledby={id}>
        <div className="group-head">
          <h2 id={id}>{title}</h2>
          <span className="sum">
            {count(list.length, "sale")} · {usd(list.reduce((sum, row) => sum + paidOn(row), 0))}
          </span>
        </div>
        <div className="list">
          {list.map((row) => {
            const status = saleStatus(row);
            return (
              <Link
                key={row.id}
                className="row is-sale"
                href={`${base}/${row.id}`}
                aria-current={row.id === from ? "true" : undefined}
              >
                <span className="code num text-left">
                  {row.saleNo}
                </span>
                <span className="truncate">
                  <span className="ink">{row.customerName || "Walk-in"}</span>{" "}
                  <span className="muted">{count(row.lineCount, "item")}</span>
                </span>
                <span className={`status ${status.tone}`}>{status.label}</span>
                <span className="muted truncate">
                  {hhmm(row.postedAt)} · {paidBy(row.payments).join(" and ") || "Cash"}
                  {row.saleType === "SALE" && row.overrideReason ? " · discount approved" : null}
                </span>
                <span className="num ink">
                  {usd(paidOn(row))}
                </span>
                <CaretRight className="ic" />
              </Link>
            );
          })}
        </div>
      </section>
    ) : null;

  return (
    <div className="main is-fixed">
      <div className="bar">
        <h1>History</h1>
        <div className="end">
          <label className="input-wrap is-search">
            <MagnifyingGlass className="ic" />
            <input type="search" aria-label="Search my sales" placeholder="Sale, customer or product" value={typed} onChange={(event) => setTyped(event.target.value)} />
          </label>
        </div>
      </div>
      {query.isLoading ? (
        <div className="finding" aria-busy="true">
          <span className="skeleton is-lede" />
        </div>
      ) : query.isError ? (
        <Empty icon={Receipt} title="Your sales did not load">
          {getApiErrorMessage(query.error)}
        </Empty>
      ) : !listed.length ? (
        <Empty icon={Receipt} title={search ? `No sale matches “${search}”` : "No sales yet"}>
          {search ? "Try the sale number from the receipt, or the customer’s name." : "Sales you take show here, newest first."}
        </Empty>
      ) : (
        <div className="table-shell">
          <div className="table-scroll">
            {shiftHere && !search ? (
              <div className="finding">
                <p className="lede-figure">
                  <span className="num">{usd(taken)}</span> from your {count(sales.length, "sale")} this shift.{" "}
                  <span className="q">
                    {voided.length ? `${voided.length === 1 ? "One" : voided.length} voided` : "None voided"},{" "}
                    {refunds.length ? `${refunds.length === 1 ? "one" : refunds.length} refunded.` : "none refunded yet."}
                  </span>
                </p>
              </div>
            ) : null}
            {group("h-here", "This shift", here.filter((row) => row.saleType === "SALE"))}
            {group("h-earlier", "Earlier", earlier.filter((row) => row.saleType === "SALE"))}
          </div>
          <div className="table-foot">
            <div className="foot-row">
              <span className="num text-left">
                1 to {listed.length} of {listed.length}
              </span>
              {shiftHere ? (
                <span className="foot-sum">
                  Taken <b>{usd(taken)}</b>
                </span>
              ) : null}
              {voidedTotal ? (
                <span className="foot-sum">
                  Voided <b>{usd(voidedTotal)}</b>
                </span>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── A sale ─────────────────────────────────────────────────────────── */

export function SaleScreen({ id }: { id: string }) {
  const router = useRouter();
  const { isPosHost, shiftHere, context } = useTill();
  const [refunding, setRefunding] = React.useState(false);
  const [voiding, setVoiding] = React.useState(false);
  const list = useMySales("");
  const query = useQuery({
    queryKey: ["retail-pos-sale", id],
    queryFn: async () => (await fetchJson<{ data: SaleDetail }>(`/api/v2/retail/pos/sales/${id}`)).data,
  });
  const sale = query.data;
  const base = getPosPortalHref("history", isPosHost);
  const rows = list.data?.data ?? [];
  const index = rows.findIndex((row) => row.id === id);
  const previous = index > 0 ? rows[index - 1] : null;
  const next = index >= 0 && index < rows.length - 1 ? rows[index + 1] : null;

  if (query.isLoading) {
    return (
      <div className="main" aria-busy="true">
        <div className="rec-head">
          <span className="skeleton is-title" />
        </div>
      </div>
    );
  }
  if (!sale) {
    return (
      <div className="main">
        <Empty icon={Receipt} title="That sale did not load">
          {getApiErrorMessage(query.error)}
        </Empty>
      </div>
    );
  }

  const paid = paidOn(sale);
  const isSale = sale.saleType === "SALE";
  const refunds = sale.reversals.filter((entry) => entry.saleType === "REFUND");
  const refundedTotal = refunds.reduce((sum, entry) => sum + Math.abs(paidOn(entry)), 0);
  const voided = sale.status === "VOIDED";
  const refundable = sale.lines.some((line) => line.refundableQuantity > 0);
  const tenders = paidBy(sale.payments);
  const when = sale.postedAt ?? sale.createdAt;
  const receiptHref = `${isPosHost ? "" : "/portal/pos"}/receipt/${sale.id}`;
  const status = saleStatus(sale);
  const lineCount = sale.lines.length;
  const change = handedBack(sale);
  // The feed is newest first; a day heading goes wherever the day changes.
  const today = dayMonth(new Date());
  const dayOf = (value: string | null) => dayMonth(value ?? when);
  const dayHead = (value: string | null) => <div className="feed-day">{dayOf(value) === today ? "Today" : dayOf(value)}</div>;
  const lastReversal = sale.reversals[sale.reversals.length - 1];
  const promotionName = sale.promotion?.name ?? sale.promotionCode;
  const discounted = sale.lines.filter((line) => n(line.discountAmount) > 0);
  const discounts: Array<{ id: string; text: React.ReactNode }> = isSale
    ? [
        ...(promotionName
          ? discounted.length
            ? discounted.map((line) => ({
                id: line.id,
                text: (
                  <>
                    {promotionName} took <b className="nowrap">{usd(n(line.discountAmount))}</b> off {product(line.itemName)}
                  </>
                ),
              }))
            : [{ id: "promotion", text: `${promotionName} applied` }]
          : []),
        ...(sale.overrideReason
          ? [
              {
                id: "override",
                text: sale.approvedByName ? (
                  <>
                    <b>{sale.approvedByName}</b> approved the discount: {sale.overrideReason.charAt(0).toLowerCase()}
                    {sale.overrideReason.slice(1)}
                  </>
                ) : (
                  `Discount approved: ${sale.overrideReason}`
                ),
              },
            ]
          : []),
      ]
    : [];

  return (
    <div className="with-rail">
      <main className="main is-scroll">
        <div className="bar">
          <Link className="btn btn-quiet" href={`${base}?from=${sale.id}`}>
            <CaretLeft className="ic" />
            History
          </Link>
          <div className="end">
            <div className="btn-group" role="group" aria-label="Move between sales">
              <button type="button" className="btn btn-icon" aria-label="Newer sale" disabled={!previous} onClick={() => previous && router.push(`${base}/${previous.id}`)}>
                <CaretLeft className="ic" />
              </button>
              <button type="button" className="btn btn-icon" aria-label="Older sale" disabled={!next} onClick={() => next && router.push(`${base}/${next.id}`)}>
                <CaretRight className="ic" />
              </button>
            </div>
          </div>
        </div>
        <div className="rec-head">
          <div className="grow">
            <h1>
              {isSale ? "Sale" : sale.saleType === "REFUND" ? "Refund" : "Void"} {sale.saleNo}
            </h1>
            <p className="sub">
              {[sale.customerName || "Walk-in", hhmm(when), `${sale.cashierName ?? "Someone"} on ${sale.shift?.registerName ?? context?.till.name ?? "a till"}`].join(" · ")}
            </p>
          </div>
          <div className="end">
            <div className="btn-group" role="group" aria-label="This sale">
              <button type="button" className="btn" onClick={() => printReceipt(receiptHref)}>
                <Printer className="ic" />
                Print receipt
              </button>
              {isSale && !voided && !refundedTotal ? (
                <button type="button" className="btn" onClick={() => setVoiding(true)}>
                  <ReceiptX className="ic" />
                  Void
                </button>
              ) : null}
            </div>
            {isSale && !voided && refundable ? (
              <button type="button" className="btn btn-primary" onClick={() => setRefunding(true)}>
                <ArrowsCounterClockwise className="ic" />
                Refund lines
              </button>
            ) : null}
          </div>
        </div>

        <div className="feed lead-8">
          {sale.reversals.map((entry, index) => {
            const voidEntry = entry.saleType === "VOID";
            const reason = entry.overrideReason?.trim();
            const back = entry.lines.map((line) => `${qty(Math.abs(n(line.quantity)))} ${product(line.itemName)}`).join(", ");
            const by = paidBy(entry.payments).map((label) => label.toLowerCase()).join(" and ");
            return (
              <React.Fragment key={entry.id}>
                {index === 0 || dayOf(entry.postedAt) !== dayOf(sale.reversals[index - 1].postedAt) ? dayHead(entry.postedAt) : null}
                <div className="ev">
                  <span className="ev-dot">{voidEntry ? <Prohibit className="ic" /> : <ArrowsCounterClockwise className="ic" />}</span>
                  <div className="ev-text">
                    <b>{entry.cashierName ?? "Someone"}</b> {voidEntry ? "voided" : "refunded"}
                    {back ? ` ${back}` : null}
                    {reason ? `, ${reason.charAt(0).toLowerCase()}${reason.slice(1)}` : null}, <b className="nowrap">{usd(Math.abs(paidOn(entry)))}</b>
                    {by ? ` by ${by}` : null}
                    <Approved by={entry.approvedByName} />
                    <div className="embed">
                      <div className="embed-head">
                        <b className="weight-600">
                          <Link className="link num" href={`${base}/${entry.id}`}>
                            {entry.saleNo}
                          </Link>
                        </b>
                        <span className="status">{voidEntry ? "Voided" : "Refunded"}</span>
                      </div>
                      {entry.lines.map((line) => (
                        <div key={line.id} className="embed-line">
                          <span>
                            {line.itemName} × {qty(Math.abs(n(line.quantity)))}, back into stock
                          </span>
                          <span className="num">{usd(Math.abs(n(line.lineTotal)))}</span>
                        </div>
                      ))}
                      {n(entry.depositAmount) ? (
                        <div className="embed-line">
                          <span>Deposits back</span>
                          <span className="num">{usd(Math.abs(n(entry.depositAmount)))}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {entry.postedAt ? <time>{hhmm(entry.postedAt)}</time> : <span />}
                </div>
              </React.Fragment>
            );
          })}
          {!lastReversal || dayOf(lastReversal.postedAt) !== dayOf(when) ? dayHead(when) : null}
          <div className="ev">
            <span className="ev-dot is-money">
              <Money className="ic" />
            </span>
            <div className="ev-text">
              <b>{sale.cashierName ?? "Someone"}</b>{" "}
              {isSale ? (
                <>
                  sold {count(lineCount, "item")}
                  {sale.customerName ? (
                    <>
                      {" "}
                      to <b>{sale.customerName}</b>
                    </>
                  ) : null}
                  , paid {tenders.length ? `by ${tenders.map((label) => label.toLowerCase()).join(" and ")}` : "in cash"}
                </>
              ) : (
                <>
                  {sale.saleType === "REFUND" ? "refunded" : "voided"} {sale.sourceSale ? (
                    <Link className="link num" href={`${base}/${sale.sourceSale.id}`}>
                      {sale.sourceSale.saleNo}
                    </Link>
                  ) : "a sale"}
                  {sale.voidReason || sale.overrideReason ? `: ${sale.voidReason || sale.overrideReason}` : ""}
                  <Approved by={sale.approvedByName} />
                </>
              )}
              <div className="embed">
                <div className="embed-head">
                  <b className="weight-600">{sale.saleNo}</b>
                  <span className={`status ${status.tone}`}>{status.label}</span>
                </div>
                {sale.lines.map((line) => (
                  <div key={line.id} className="embed-line">
                    <span>
                      {line.itemName} × {qty(Math.abs(n(line.quantity)))}
                    </span>
                    <span className="num">{usd(n(line.lineTotal))}</span>
                  </div>
                ))}
                {n(sale.depositAmount) ? (
                  <div className="embed-line">
                    <span>Deposits</span>
                    <span className="num">{usd(n(sale.depositAmount))}</span>
                  </div>
                ) : null}
                <div className="embed-foot">
                  <span>Total</span>
                  <span className="num">{usd(paid)}</span>
                </div>
              </div>
            </div>
            <time>{hhmm(when)}</time>
          </div>
          {sale.fiscalReceipt && sale.fiscalReceipt.status !== "SKIPPED" ? (
            <div className="ev">
              <span className="ev-dot">
                <SealCheck className="ic" />
              </span>
              <div className="ev-text">
                {sale.fiscalReceipt.status === "SUCCESS" ? (
                  <>
                    ZIMRA fiscalised the receipt{sale.fiscalReceipt.fiscalNumber ? <>, <span className="num">{sale.fiscalReceipt.fiscalNumber}</span></> : null}
                  </>
                ) : sale.fiscalReceipt.status === "PENDING" ? (
                  "Waiting for ZIMRA to fiscalise the receipt"
                ) : (
                  `ZIMRA did not fiscalise it: ${sale.fiscalReceipt.lastError ?? "no answer"}`
                )}
              </div>
              <time>{hhmm(when)}</time>
            </div>
          ) : null}
          {sale.idCheckedAt ? (
            <div className="ev">
              <span className="ev-dot">
                <IdentificationCard className="ic" />
              </span>
              <div className="ev-text">
                {firstName(sale.cashierName)} checked the customer’s ID: 18 or over
              </div>
              <time>{hhmm(sale.idCheckedAt)}</time>
            </div>
          ) : null}
          {discounts.map((entry, index) => (
            <div key={entry.id} className={`ev${index === discounts.length - 1 ? " end" : ""}`}>
              <span className="ev-dot">
                <Tag className="ic" />
              </span>
              <div className="ev-text">{entry.text}</div>
              <time>{hhmm(when)}</time>
            </div>
          ))}
        </div>
      </main>
      <aside className="rail" aria-label="About this sale">
        <section>
          <div className="sec-title">{isSale ? "Paid" : sale.saleType === "REFUND" ? "Paid back" : "Cancelled"}</div>
          <div className="figure">{usd(Math.abs(paid))}</div>
          <dl className="attrs">
            <dt>By</dt>
            <dd>{tenders.join(" and ") || "Cash"}</dd>
            {sale.payments
              .filter((payment) => payment.reference)
              .map((payment) => (
                <React.Fragment key={payment.id}>
                  <dt>Reference</dt>
                  <dd className="num text-left">
                    {payment.reference}
                  </dd>
                </React.Fragment>
              ))}
            {change.usd || change.zig ? (
              <>
                <dt>Change</dt>
                <dd className="num text-left">
                  {change.zig ? `${usd(change.usd)} and ${zig(change.zig)}` : usd(change.usd)}
                </dd>
              </>
            ) : null}
            {isSale ? (
              <>
                <dt>Refunded</dt>
                <dd>
                  {refundedTotal ? (
                    <>
                      {usd(refundedTotal)}
                      {refunds.map((entry) => (
                        <React.Fragment key={entry.id}>
                          , <span className="num">{entry.saleNo}</span>
                        </React.Fragment>
                      ))}
                    </>
                  ) : (
                    <span className="muted">Nothing</span>
                  )}
                </dd>
              </>
            ) : null}
            {sale.empties.length ? (
              <>
                <dt>Empties</dt>
                <dd>{emptiesWords(sale.empties)}</dd>
              </>
            ) : null}
          </dl>
        </section>
        {sale.customerName ? (
          <section>
            <div className="sec-title">Customer</div>
            <div className="who-head">
              <Avatar name={sale.customerName} />
              <div>
                <div className="ink weight-500">{sale.customerName}</div>
                {sale.customer ? (
                  <div className="note num text-left">
                    {[sale.customer.phone, tierWord(sale.customer.tier)].filter(Boolean).join(" · ")}
                  </div>
                ) : null}
              </div>
            </div>
            {sale.customer && isSale ? (
              <dl className="attrs">
                <dt>Points</dt>
                <dd>{pointsWords(sale.customer)}</dd>
              </dl>
            ) : null}
          </section>
        ) : null}
      </aside>
      {refunding ? <RefundDialog sale={sale} shiftId={shiftHere?.id ?? null} onClose={() => setRefunding(false)} /> : null}
      {voiding ? <VoidDialog sale={sale} shiftId={shiftHere?.id ?? null} onClose={() => setVoiding(false)} /> : null}
    </div>
  );
}

/* ─── A manager's PIN, shared by refund and void ─────────────────────── */

/**
 * The manager standing at the counter (C-31). When the till rules ask for one
 * (a refund over the limit, a void the rule locks) and the person selling may
 * not approve it, they pick who approves and that manager types their PIN. The
 * server decides again: a 409 `needsApprover` opens the fields with its
 * sentence, a refused PIN or person is cleared, and a locked PIN (423), locked
 * until a new one is sent (ADM-03), is cleared so another manager approves. The PIN lives in this dialog only.
 */
function useManagerPin(predicted: string | null) {
  const { approvers } = useTill();
  const [askedFor, setAskedFor] = React.useState<string | null>(null);
  const [managerId, setManagerId] = React.useState("");
  const [pin, setPin] = React.useState("");
  const asks = askedFor ?? predicted;
  const chosen = approvers.find((person) => person.userId === managerId) ?? approvers[0] ?? null;
  return {
    asks,
    chosen,
    choices: approvers,
    setManagerId,
    pin,
    setPin: (value: string) => setPin(value.replace(/\D/g, "").slice(0, 4)),
    approver: () => (asks && chosen && pin.length === 4 ? { approver: { userId: chosen.userId, pin } } : {}),
    ready: !asks || Boolean(chosen && pin.length === 4),
    /** The server's no, as the line under the fields says it. */
    refused: (error: unknown): string => {
      const message = getApiErrorMessage(error);
      if (!(error instanceof ApiError)) return message;
      if (error.status === 423) {
        // ADM-03: locked until a new PIN is sent, so somebody else approves.
        setPin("");
        return chosen ? `${firstName(chosen.name)}’s PIN is locked until a new one is sent. Another manager can approve it.` : message;
      }
      const details = error.details as { needsApprover?: boolean; reason?: string; fieldErrors?: { pin?: string; approver?: string } } | undefined;
      if (error.status === 409 && details?.needsApprover) {
        if (!details.fieldErrors) {
          setAskedFor(details.reason ?? message);
          return details.reason ?? message;
        }
        setPin("");
        if (details.fieldErrors.approver) setManagerId("");
      }
      return message;
    },
  };
}

function ManagerFields({ fields, ids }: { fields: ReturnType<typeof useManagerPin>; ids: string }) {
  if (!fields.asks) return null;
  if (!fields.choices.length) {
    return <p className="help is-flush">Nobody here can approve it with a PIN yet. A manager sets their till PIN first.</p>;
  }
  return (
    <div className="field-row">
      <div className="field">
        <label htmlFor={`${ids}m`}>Manager</label>
        <select id={`${ids}m`} className="select input-lg" value={fields.chosen?.userId ?? ""} onChange={(event) => fields.setManagerId(event.target.value)}>
          {fields.choices.map((person) => (
            <option key={person.userId} value={person.userId}>
              {person.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${ids}p`}>{fields.chosen ? `${firstName(fields.chosen.name)}’s PIN` : "PIN"}</label>
        <input
          id={`${ids}p`}
          className="input input-lg num text-left"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={fields.pin}
          onChange={(event) => fields.setPin(event.target.value)}
        />
      </div>
    </div>
  );
}

function invalidateSale(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["retail-pos-sale"] });
  void queryClient.invalidateQueries({ queryKey: ["retail-pos-sales"] });
  void queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
}

function RefundDialog({ sale, shiftId, onClose }: { sale: SaleDetail; shiftId: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { rules, canApprove, referenceProblem } = useTill();
  const ids = React.useId();
  const reasons = rules?.refundReasons ?? [];
  const [back, setBack] = React.useState<Record<string, number>>({});
  const [why, setWhy] = React.useState(reasons[0] ?? "");
  const [reference, setReference] = React.useState("");
  const [problem, setProblem] = React.useState<string | null>(null);
  const tender = sale.payments.find((payment) => payment.tenderType !== "CASH")?.tenderType ?? "CASH";
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
  // The rules' limit is on the sale's refunds together.
  const alreadyBack = sale.reversals.filter((entry) => entry.saleType === "REFUND").reduce((sum, entry) => sum + Math.abs(paidOn(entry)), 0);
  const fields = useManagerPin(
    !canApprove && rules && amount + alreadyBack > Number(rules.refundPinOver) ? refundPinSentence(rules.refundPinOver, rules.currency) : null,
  );
  const items = Object.values(back).reduce((sum, value) => sum + value, 0);
  const backNames = sale.lines.filter((line) => (back[line.id] ?? 0) > 0).map((line) => product(line.itemName));

  const refund = useMutation({
    mutationFn: () =>
      fetchJson(`/api/v2/retail/pos/sales/${sale.id}/refund`, {
        method: "POST",
        body: JSON.stringify({
          shiftId,
          reason: why,
          lines: Object.entries(back)
            .filter(([, value]) => value > 0)
            .map(([saleLineId, quantity]) => ({ saleLineId, quantity })),
          payments: [{ tenderType: tender, amount, reference: reference.trim() || undefined }],
          ...fields.approver(),
        }),
      }),
    onSuccess: () => {
      invalidateSale(queryClient);
      onClose();
    },
    onError: (error) => setProblem(fields.refused(error)),
  });

  const submit = () => {
    if (!shiftId) return setProblem("Open a shift on this till first: the money comes out of its drawer.");
    if (!items) return setProblem("Say what comes back: one or more of a line.");
    if (!why) return setProblem("Say why it came back.");
    const missing = referenceProblem({ tenderType: tender, amount: String(amount), reference });
    if (missing) return setProblem(missing);
    if (!fields.ready) return setProblem("A manager types their PIN to approve it.");
    setProblem(null);
    refund.mutate();
  };

  return (
    <TillDialog
      open
      large
      onOpenChange={(open) => !open && onClose()}
      title={`Refund from ${sale.saleNo}`}
      meta={`${sale.customerName || "Walk-in"} · paid by ${paidBy(sale.payments).map((label) => label.toLowerCase()).join(" and ") || "cash"}`}
      foot={
        <>
          {fields.asks ? (
            <span className="start">
              <Key className="ic" />
              {fields.asks}
            </span>
          ) : null}
          <button type="button" className="btn" onClick={onClose}>
            <X className="ic" />
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={refund.isPending} aria-busy={refund.isPending || undefined} onClick={submit}>
            <ArrowsCounterClockwise className="ic" />
            Refund {usd(amount)}
          </button>
        </>
      }
    >
      <table className="table">
        <thead>
          <tr>
            <th>Product</th>
            <th className="num">Sold</th>
            <th className="num">Back</th>
            <th className="num">Refund</th>
          </tr>
        </thead>
        <tbody>
          {sale.lines.map((line) => {
            const value = back[line.id] ?? 0;
            return (
              <tr key={line.id}>
                <td>
                  <span className="cell-lead">{line.itemName}</span>
                </td>
                <td className="num">{qty(Math.abs(n(line.quantity)))}</td>
                <td className="num">
                  <span className="qty" role="group" aria-label={`${line.itemName} back`}>
                    <button type="button" aria-label={`One fewer ${line.itemName}`} disabled={value === 0} onClick={() => setBack({ ...back, [line.id]: value - 1 })}>
                      <Minus className="ic" />
                    </button>
                    <span>{value}</span>
                    <button
                      type="button"
                      aria-label={`One more ${line.itemName}`}
                      disabled={value >= line.refundableQuantity}
                      onClick={() => setBack({ ...back, [line.id]: value + 1 })}
                    >
                      <Plus className="ic" />
                    </button>
                  </span>
                </td>
                <td className={value ? "num ink" : "num muted"}>
                  {value ? usd(lineBack(line, value)) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td>{count(items, "item")} back</td>
            <td />
            <td />
            <td className="num">{usd(amount)}</td>
          </tr>
        </tfoot>
      </table>
      <div className="field-row">
        <div className="field">
          <label htmlFor={`${ids}w`}>Why</label>
          <select id={`${ids}w`} className="select input-lg" value={why} onChange={(event) => setWhy(event.target.value)}>
            {reasons.map((entry) => (
              <option key={entry}>{entry}</option>
            ))}
          </select>
          <span className="help">
            {backNames.length ? `The ${backNames.join(" and ")} ${backNames.length > 1 ? "go" : "goes"} back into stock.` : "What comes back goes back into stock."}
          </span>
        </div>
        <div className="field">
          {tender === "CASH" ? <span className="label">Back by cash</span> : <label htmlFor={`${ids}r`}>Back by {paymentLabel(tender).toLowerCase()}</label>}
          {tender === "CASH" ? (
            <p className="help is-flush">
              From this till’s drawer.
            </p>
          ) : (
            <>
              <input
                id={`${ids}r`}
                className="input input-lg num text-left"
                placeholder="Reference"
                aria-describedby={`${ids}rh`}
                value={reference}
                onChange={(event) => setReference(event.target.value)}
              />
              <span id={`${ids}rh`} className="help">
                From the message confirming the money went to {sale.customerName ? firstName(sale.customerName) : "the customer"}.
              </span>
            </>
          )}
        </div>
      </div>
      <ManagerFields fields={fields} ids={ids} />
      {problem ? <ErrorLine>{problem}</ErrorLine> : null}
    </TillDialog>
  );
}

function VoidDialog({ sale, shiftId, onClose }: { sale: SaleDetail; shiftId: string | null; onClose: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isPosHost, rules, canApprove } = useTill();
  const ids = React.useId();
  const reasons = rules?.voidReasons ?? [];
  // "After 5 minutes" is judged from when Void was pressed.
  const [openedAt] = React.useState(() => Date.now());
  const age = openedAt - new Date(sale.postedAt ?? sale.createdAt).getTime();
  const locked = rules?.voidPin === "ALWAYS" || (rules?.voidPin === "AFTER_5_MINUTES" && age > VOID_FREE_MS);
  const fields = useManagerPin(!canApprove && rules && locked ? voidPinSentence(rules.voidPin) : null);
  const [reason, setReason] = React.useState(reasons[0] ?? "");
  const [problem, setProblem] = React.useState<string | null>(null);
  const tenders = paidBy(sale.payments).map((label) => label.toLowerCase());

  const voidSale = useMutation({
    mutationFn: () =>
      fetchJson(`/api/v2/retail/pos/sales/${sale.id}/void`, {
        method: "POST",
        body: JSON.stringify({ shiftId, reason, ...fields.approver() }),
      }),
    onSuccess: () => {
      invalidateSale(queryClient);
      onClose();
      router.push(getPosPortalHref("history", isPosHost));
    },
    onError: (error) => setProblem(fields.refused(error)),
  });

  return (
    <TillDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Void ${sale.saleNo}?`}
      description={`${sale.customerName || "Walk-in"}, ${count(sale.lines.length, "item")}, ${usd(paidOn(sale))} ${tenders.join(" and ") || "cash"}. The whole sale is cancelled: back in stock and out of the drawer count. A void stays on the record and cannot be reversed. To take back part of a sale, refund it.`}
      foot={
        <>
          <button type="button" className="btn" onClick={onClose}>
            <X className="ic" />
            Keep the sale
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={voidSale.isPending}
            aria-busy={voidSale.isPending || undefined}
            onClick={() => {
              if (!shiftId) return setProblem("Open a shift on this till first: the cash goes back out of its drawer.");
              if (!reason) return setProblem("Say why it is voided.");
              if (!fields.ready) return setProblem("A manager types their PIN to approve it.");
              setProblem(null);
              voidSale.mutate();
            }}
          >
            <Prohibit className="ic" />
            Void {sale.saleNo}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor={`${ids}r`}>Reason</label>
        <select id={`${ids}r`} className="select input-lg" value={reason} onChange={(event) => setReason(event.target.value)}>
          {reasons.map((entry) => (
            <option key={entry}>{entry}</option>
          ))}
        </select>
        {fields.asks ? <span className="help">{fields.asks}</span> : null}
      </div>
      <ManagerFields fields={fields} ids={ids} />
      {problem ? <ErrorLine>{problem}</ErrorLine> : null}
    </TillDialog>
  );
}
