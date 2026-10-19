"use client";

import Link from "next/link";

import { Pill } from "@/components/core";
import { VaneDraftNote } from "@/components/vane/vane-draft-note";
import { money } from "@/lib/books/format";
import type { InvoiceRecord } from "@/lib/books/invoice-record";
import type { InvoiceState } from "@/lib/books/invoice-state";

const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, ""));

const TONE: Record<InvoiceState, "warn" | "ok" | "bad" | "plain"> = {
  draft: "warn",
  sent: "plain",
  "part-paid": "plain",
  overdue: "bad",
  paid: "ok",
  void: "bad",
};

/**
 * One invoice (PageVaneDraft): Vane's note when the draft is Vane's, the
 * finding, its lines and totals, and beside them what it is and what changed
 * since the quote; once void or credited, who did it and why, and the payments
 * a void left on account, which the owner may void too (in Payments). Pure:
 * the page feeds it, and owns Issue, Reverse and Delete.
 */
export function InvoiceRecordView({ invoice, canVoidPayments = false }: { invoice: InvoiceRecord; canVoidPayments?: boolean }) {
  const vaneDraft = invoice.madeByVane && invoice.status === "DRAFT";
  const quote = invoice.quote;
  return (
    <div style={{ flex: "1 1 auto", display: "flex", minHeight: 0 }}>
      <div className="kbody">
        {vaneDraft ? (
          <VaneDraftNote
            end={
              invoice.cardId ? (
                <Link href={`/vane?card=${invoice.cardId}`} style={{ color: "var(--color-muted)", fontSize: "var(--text-13)", whiteSpace: "nowrap" }}>
                  What I read
                </Link>
              ) : null
            }
          >
            <b style={{ fontWeight: 600 }}>Vane&rsquo;s draft.</b>{" "}
            {quote ? `Made from ${quote.number}${quote.accepted ? `, accepted on ${quote.accepted}` : ""}. ` : ""}
            {invoice.waiting ? "Check it, then issue it; nothing is sent or posted until you do." : "A person has taken it on; it is theirs now."}
          </VaneDraftNote>
        ) : null}
        <div className="finding">
          <p className="lede-figure">
            {invoice.fact}
            {invoice.rest ? <span className="q"> {invoice.rest}</span> : null}
          </p>
        </div>
        <div className="group-head" style={{ paddingTop: 16 }}>
          <h2>Lines</h2>
        </div>
        <div className="wt" style={{ flex: "none" }}>
          <table className="table">
            <colgroup>
              <col style={{ width: "100%" }} />
              <col />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th>Item</th>
                <th className="num">Quantity</th>
                <th className="num">Price</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line) => (
                <tr key={line.id}>
                  <td className="fill">
                    <span className="cell-lead truncate" title={line.description}>
                      {line.description}
                    </span>
                  </td>
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
            </tfoot>
          </table>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, padding: "14px 28px", fontVariantNumeric: "tabular-nums" }}>
          <span style={{ color: "var(--color-muted)" }}>
            {invoice.taxLabel} {money(invoice.taxTotal, invoice.currency)}
          </span>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Total {money(invoice.total, invoice.currency)}</span>
        </div>
      </div>
      <aside className="kaside" style={{ width: 320 }} aria-label={`Invoice ${invoice.number}`}>
        <span className="sec-title">Invoice</span>
        <dl className="attrs">
          <Attr term="Customer">{invoice.customer.name}</Attr>
          {invoice.deal ? <Attr term="For">{invoice.deal}</Attr> : quote ? <Attr term="For">{quote.number}</Attr> : null}
          <Attr term="Date">{invoice.date}</Attr>
          <Attr term="Due">{invoice.status === "DRAFT" ? invoice.dueTerms : invoice.due}</Attr>
          <Attr term="Status">
            <Pill tone={TONE[invoice.state.key]}>{invoice.state.label}</Pill>
          </Attr>
          <Attr term="Made by">{invoice.madeBy}</Attr>
          {invoice.issuedBy ? <Attr term="Issued by">{invoice.issuedBy}</Attr> : null}
          {invoice.status !== "DRAFT" && invoice.status !== "VOIDED" ? (
            <Attr term="Owed">
              <span className="mono">{money(invoice.balance, invoice.currency)}</span>
            </Attr>
          ) : null}
          {invoice.voided ? (
            <Attr term="Voided">
              {[invoice.voided.by, invoice.voided.on].filter(Boolean).join(", ")}
              {invoice.voided.reason ? <span className="muted" style={{ display: "block" }}>{invoice.voided.reason}</span> : null}
            </Attr>
          ) : null}
          {invoice.onAccount.length ? (
            <Attr term="On account">
              {invoice.onAccount.map((payment) => (
                <span key={payment.id} style={{ display: "block" }}>
                  <span className="mono">{payment.number}</span>, <span className="mono">{money(payment.amount, invoice.currency)}</span>
                  {payment.voided ? (
                    <span className="muted">, void</span>
                  ) : canVoidPayments ? (
                    <>
                      {" "}
                      <Link
                        href={`/books/payments?void=${encodeURIComponent(payment.id)}&number=${encodeURIComponent(payment.number)}`}
                        style={{ color: "var(--color-danger)" }}
                        aria-label={`Void ${payment.number}`}
                      >
                        Void
                      </Link>
                    </>
                  ) : null}
                </span>
              ))}
            </Attr>
          ) : null}
          {invoice.credits.map((note) => (
            <Attr key={note.number} term={note.voided ? "Credit, void" : "Credited"}>
              <span className="mono">{money(note.total, invoice.currency)}</span>, {note.date}
              <span className="muted truncate" style={{ display: "block" }} title={note.number}>
                {note.reason ?? note.number}
              </span>
            </Attr>
          ))}
        </dl>
        {quote ? (
          <>
            <span style={{ marginTop: 8 }}>
              <span className="sec-title">What changed since the quote</span>
            </span>
            {invoice.changes.length === 0 ? (
              <dl className="attrs">
                <Attr term="Nothing">Lines and prices as accepted</Attr>
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

function Attr({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <>
      <dt>{term}</dt>
      <dd>{children}</dd>
    </>
  );
}
