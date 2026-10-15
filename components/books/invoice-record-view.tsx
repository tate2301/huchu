"use client";

import { Finding, GroupHead } from "@/components/core";
import { VaneDraftNote } from "@/components/vane/vane-draft-note";
import { money } from "@/lib/books/format";
import type { InvoiceRecord } from "@/lib/books/invoice-record";

/** Figures keep their width; the name column takes the rest. */
const NUM = { width: "9rem" } as const;

const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, ""));

/**
 * One invoice (PageVaneDraft): Vane's note when the draft is Vane's, the
 * finding, its lines and totals, and beside them what it is and what changed
 * since the quote. Pure: the page feeds it, and owns Issue and Delete.
 */
export function InvoiceRecordView({ invoice }: { invoice: InvoiceRecord }) {
  const vaneDraft = invoice.madeByVane && invoice.status === "DRAFT";
  return (
    <div style={{ flex: "1 1 auto", display: "flex", minHeight: 0 }}>
      <div className="kbody">
        {vaneDraft ? (
          <VaneDraftNote>
            Vane&rsquo;s draft.{" "}
            {invoice.quote ? `Made from ${invoice.quote.number}${invoice.quote.accepted ? `, accepted on ${invoice.quote.accepted}` : ""}. ` : ""}
            Check it, then issue it; nothing is sent or posted until you do.
          </VaneDraftNote>
        ) : null}
        <Finding fact={invoice.fact} rest={invoice.rest ?? undefined} />
        <GroupHead title="Lines" sum={`${invoice.lines.length}`} />
        <div className="wt">
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th className="num" style={NUM}>Quantity</th>
                <th className="num" style={NUM}>Price</th>
                <th className="num" style={NUM}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line) => (
                <tr key={line.id}>
                  <td className="fill">{line.description}</td>
                  <td className="num">{qty(line.quantity)}</td>
                  <td className="num">{money(line.unitPrice, invoice.currency)}</td>
                  <td className="num">{money(line.amount, invoice.currency)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="fill">Subtotal</td>
                <td className="num" />
                <td className="num" />
                <td className="num">{money(invoice.subTotal, invoice.currency)}</td>
              </tr>
              <tr>
                <td className="fill">VAT</td>
                <td className="num" />
                <td className="num" />
                <td className="num">{money(invoice.taxTotal, invoice.currency)}</td>
              </tr>
              <tr>
                <td className="fill">
                  <b>Total</b>
                </td>
                <td className="num" />
                <td className="num" />
                <td className="num">
                  <b>{money(invoice.total, invoice.currency)}</b>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <aside className="kaside" aria-label="Invoice" style={{ width: 320 }}>
        <span className="sec-title">Invoice</span>
        <dl className="attrs">
          <dt>Customer</dt>
          <dd>{invoice.customer.name}</dd>
          {invoice.quote ? (
            <>
              <dt>For</dt>
              <dd>
                {invoice.quote.number}
                {invoice.quote.accepted ? `, accepted ${invoice.quote.accepted}` : ""}
              </dd>
            </>
          ) : null}
          <dt>Date</dt>
          <dd>{invoice.date}</dd>
          <dt>Due</dt>
          <dd>{invoice.due}</dd>
          <dt>Status</dt>
          <dd>{invoice.stateLabel}</dd>
          <dt>Made by</dt>
          <dd>{invoice.madeBy}</dd>
          {invoice.status !== "DRAFT" ? (
            <>
              <dt>Owed</dt>
              <dd className="mono">{money(invoice.balance, invoice.currency)}</dd>
            </>
          ) : null}
        </dl>
        {invoice.quote ? (
          <>
            <span className="sec-title">What changed since the quote</span>
            {invoice.changes.length === 0 ? (
              <dl className="attrs">
                <dt>Nothing</dt>
                <dd>Lines and prices as accepted</dd>
              </dl>
            ) : (
              <ul style={{ margin: 0, paddingLeft: "var(--space-16)", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                {invoice.changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            )}
          </>
        ) : null}
      </aside>
    </div>
  );
}
