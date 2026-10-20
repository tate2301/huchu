"use client";

/**
 * The slip a till prints for a sale it saved while offline. The sale is not on
 * the server yet, so there is no receipt page to load: the slip is drawn here,
 * from what the till queued, into a hidden frame with the till's own styles
 * copied in as text, and printed from there, as the receipt is. Nothing is
 * fetched, so it prints with the line down. It says plainly that it is not yet
 * a fiscal receipt. While Paid shows the sale, the same slip stands on the
 * shelf's side (T8-2).
 */

import * as React from "react";
import { createPortal, flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { Printer } from "@/lib/icons";
import { lineDeposit } from "@/lib/retail/deposits";
import type { ChangeSplit } from "@/lib/retail/payment-words";
import { receiptTenderLabel, type ReceiptWire } from "@/lib/retail/receipt-words";
import { hhmm, qty, usd } from "./format";
import { depositRowLabel, ReceiptFoot, ReceiptHead, receiptFigure as figure, receiptStamp } from "./receipt-parts";
import type { CartItem, PaymentRow } from "./types";

/** What the slip prints: the sale as the till queued it, and how it was handed back. */
export type SlipSale = {
  /** "7C2A91": the sale's tag until it is sent and numbered. */
  tag: string;
  at: string;
  /** "Till 1, Kuda". */
  tillLine: string;
  customerName: string | null;
  lines: Array<{ key: string; name: string; quantity: number; amount: number; deposit: number; each: number | null }>;
  /** Goods and deposits together, after every discount. */
  total: number;
  payments: PaymentRow[];
  change: Pick<ChangeSplit, "usd" | "zig">;
  idChecked: boolean;
};

/** The lines as the slip prints them: each line's amount after its discount, and its deposit after its empties. */
export function slipLines(cart: readonly CartItem[]): SlipSale["lines"] {
  return cart.map((item) => ({
    key: item.id,
    name: item.name,
    quantity: item.quantity,
    amount: Math.max(item.unitPrice * item.quantity - item.lineDiscountAmount, 0),
    deposit: lineDeposit(item),
    each: item.returnable ? item.depositAmount : null,
  }));
}

function Slip({ sale, wire }: { sale: SlipSale; wire: ReceiptWire | null }) {
  const listed = sale.lines.reduce((sum, line) => sum + line.amount + line.deposit, 0);
  // Order discounts, a promotion and points come off the sale, not a line.
  const off = Number((listed - sale.total).toFixed(2));
  const payments = sale.payments.filter((payment) => Number(payment.amount || "0") > 0);
  return (
    <div className="receipt-page">
      <div className="receipt">
        {wire ? <ReceiptHead wire={wire} /> : null}
        <hr />
        <div className="c t">Not yet a fiscal receipt</div>
        <div className="l">
          <span>Unsent {sale.tag}</span>
          <span>{receiptStamp(sale.at)}</span>
        </div>
        <div className="l">
          <span>{sale.tillLine}</span>
          <span />
        </div>
        {sale.customerName ? <div>Customer: {sale.customerName}</div> : null}
        <hr />
        {sale.lines.map((line) => (
          <React.Fragment key={line.key}>
            <div className="l">
              <span>
                {qty(line.quantity)} × {line.name}
              </span>
              <span>{figure(line.amount)}</span>
            </div>
            {line.deposit ? (
              <div className="l">
                <span>{depositRowLabel(line.deposit, line.each)}</span>
                <span>{figure(line.deposit)}</span>
              </div>
            ) : null}
          </React.Fragment>
        ))}
        <hr />
        {off > 0.004 ? (
          <div className="l">
            <span>Discounts</span>
            <span>{figure(-off)}</span>
          </div>
        ) : null}
        <div className="l t">
          <span>Total</span>
          <span>{usd(sale.total)}</span>
        </div>
        {payments.map((payment, index) => (
          <div key={index} className="l">
            <span>
              {receiptTenderLabel(payment.tenderType, payment.currency)}
              {payment.reference.trim() ? ` ${payment.reference.trim()}` : ""}
            </span>
            <span>{figure(Number(payment.amount))}</span>
          </div>
        ))}
        {sale.change.usd > 0.004 ? (
          <div className="l is-change">
            <span>Change</span>
            <span>{figure(sale.change.usd)}</span>
          </div>
        ) : null}
        {sale.change.zig > 0.004 ? (
          <div className="l is-change">
            <span>Change ZiG</span>
            <span>{figure(sale.change.zig)}</span>
          </div>
        ) : null}
        <hr />
        {sale.idChecked ? (
          <>
            <div className="c">ID checked, 18 or over</div>
            <div className="c strong">Not for sale to persons under 18</div>
          </>
        ) : null}
        <div className="c muted">Saved on the till with no connection. The sale number and fiscal receipt come when it is sent.</div>
        {wire ? <ReceiptFoot wire={wire} /> : null}
      </div>
    </div>
  );
}

/** The till's styles as text, so the frame needs nothing from the network. A sheet that cannot be read is skipped. */
function tillStyles(): string {
  return Array.from(document.styleSheets)
    .map((sheet) => {
      try {
        return Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n");
      } catch {
        return "";
      }
    })
    .join("\n");
}

/**
 * Prints the slip from a hidden frame. `rootClass` is the till root's classes
 * (`.tl` and its faces), which every till style hangs from.
 */
export function printSlip(sale: SlipSale, wire: ReceiptWire | null, rootClass: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.position = "fixed";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const view = frame.contentWindow;
  if (!doc || !view) {
    frame.remove();
    return;
  }
  doc.documentElement.lang = "en-GB";
  doc.title = `Unsent ${sale.tag}`;
  const style = doc.createElement("style");
  style.textContent = tillStyles();
  doc.head.appendChild(style);
  doc.body.style.margin = "0";
  const host = doc.createElement("div");
  host.className = rootClass;
  doc.body.appendChild(host);
  const root = createRoot(host);
  flushSync(() => root.render(<Slip sale={sale} wire={wire} />));
  const print = () => {
    view.focus();
    view.print();
    window.setTimeout(() => {
      root.unmount();
      frame.remove();
    }, 60_000);
  };
  // The till's faces are on the device already; wait for them so the slip prints in them.
  void doc.fonts.ready.then(print, print);
}

/* The last slip printed, by tag and time: Paid says "Slip printed" once it has gone to the printer. */
let printed: { tag: string; at: string } | null = null;
const printedListeners = new Set<() => void>();
function subscribePrinted(listener: () => void) {
  printedListeners.add(listener);
  return () => printedListeners.delete(listener);
}

/** Prints the slip and notes the time against its tag. */
export function printSavedSlip(sale: SlipSale, wire: ReceiptWire | null, rootClass: string) {
  printSlip(sale, wire, rootClass);
  printed = { tag: sale.tag, at: new Date().toISOString() };
  for (const listener of printedListeners) listener();
}

/** The "Slip printed" fact on Paid, once this sale's slip has been printed. */
export function SlipPrintedFact({ tag }: { tag: string }) {
  const last = React.useSyncExternalStore(subscribePrinted, () => printed, () => null);
  if (last?.tag !== tag) return null;
  return (
    <div className="fact">
      <Printer className="ic" />
      <dt>Slip printed</dt>
      <dd>{hhmm(last.at)}</dd>
    </div>
  );
}

/**
 * The slip on the shelf's side of the bench while Paid shows a sale saved on
 * the till. Paid sits in the sale column, so the slip is portalled into the
 * shelf beside it.
 */
export function ShelfSlip({ sale, wire }: { sale: SlipSale; wire: ReceiptWire | null }) {
  const [anchor, setAnchor] = React.useState<HTMLSpanElement | null>(null);
  const shelf = anchor?.closest(".bench")?.querySelector<HTMLElement>(":scope > .main") ?? null;
  return (
    <>
      <span ref={setAnchor} hidden />
      {shelf
        ? createPortal(
            <section className="shelf-slip" aria-label="Slip">
              <Slip sale={sale} wire={wire} />
            </section>,
            shelf,
          )
        : null}
    </>
  );
}
