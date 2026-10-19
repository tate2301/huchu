"use client";

import * as React from "react";
import Link from "next/link";

import { Icon } from "@/components/core";
import { money } from "@/lib/books/format";
import type { InvoiceRecordPage } from "@/lib/books/invoice-record";
import type { InvoiceState } from "@/lib/books/invoice-state";

const PILL: Record<InvoiceState, string> = { draft: "pill-n", sent: "pill-info", "part-paid": "pill-info", paid: "pill-ok", overdue: "pill-warn", void: "pill-plain" };
const plain = (n: number) => new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, ""));

function Section({ id, title, sum, children }: { id: string; title: string; sum?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <div className="group-head">
        <h2 id={id}>{title}</h2>
        {sum !== undefined && sum !== null ? <span className="sum">{sum}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Boxed({ children }: { children: React.ReactNode }) {
  return <div className="bk-bleed">{children}</div>;
}

/**
 * One invoice (design/core-modules/boards/view/BkInvoice.html): the total and
 * its state, who and when; its lines and sums; the payments on it with their
 * bank line; what it posted; its history. On the right, the fiscal block and
 * the details. Pure: the page feeds it and holds the actions.
 */
export function BkInvoiceView({ invoice }: { invoice: InvoiceRecordPage }) {
  const board = invoice.board;
  const draft = invoice.status === "DRAFT";
  const credited = invoice.credits.filter((note) => !note.voided).reduce((sum, note) => sum + note.total, 0);
  const writtenOff = Math.max(0, Math.round((invoice.total - invoice.paid - credited - invoice.balance) * 100) / 100);
  const due = draft ? `Due ${invoice.due}` : invoice.state.key === "overdue" ? `Was due ${invoice.due}` : invoice.due === "No due date" ? invoice.due : `Due ${invoice.due}`;
  return (
    <div className="bk bk-rec">
      <div className="bk-main">
        <div className="bk-hd">
          <div className="tr">
            <div className="bk-title">{money(invoice.total, invoice.currency)}</div>
            <span className={`pill ${PILL[invoice.state.key]}`}>{invoice.stateLabel}</span>
          </div>
          <div className="ml">
            <span>{invoice.customer.name}</span>
            <i>·</i>
            <span>{due}</span>
          </div>
        </div>

        {invoice.waiting || (invoice.madeByVane && draft) ? (
          <div className="bk-box bk-callout">
            <Icon name="foryou" />
            <span className="grow">
              <b>Vane drafted this{invoice.quote ? ` from ${invoice.quote.number}` : ""}.</b> {invoice.changes.length ? invoice.changes.join("; ") + "." : "Check it, then issue it as yours."}
            </span>
          </div>
        ) : null}
        {invoice.voided ? (
          <div className="bk-box warn bk-callout">
            <Icon name="warn" />
            <span className="grow">
              <b>Voided{invoice.voided.on ? ` ${invoice.voided.on}` : ""}{invoice.voided.by ? ` by ${invoice.voided.by}` : ""}.</b> {invoice.voided.reason ?? ""}
            </span>
          </div>
        ) : null}

        <Section id="l1" title="Lines" sum={invoice.lines.length === 1 ? "1 line" : `${invoice.lines.length} lines`}>
          <Boxed>
            <table className="table" aria-label="Lines">
              <colgroup>
                <col />
                <col style={{ width: 120 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 140 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Quantity</th>
                  <th className="num">Price</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((line) => (
                  <tr key={line.id}>
                    <td>
                      <span className="cell-lead">{line.description}</span>
                    </td>
                    <td>{qty(line.quantity)}</td>
                    <td className="num">{money(line.unitPrice, invoice.currency)}</td>
                    <td className="num">{money(line.quantity * line.unitPrice, invoice.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Boxed>
          <div className="bk-sums">
            <div>
              <span>Before VAT</span>
              <span>{money(invoice.subTotal, invoice.currency)}</span>
            </div>
            <div>
              <span>{invoice.taxLabel === "VAT" ? "VAT" : `VAT at ${invoice.taxLabel.replace(/^VAT /, "")}`}</span>
              <span>{money(invoice.taxTotal, invoice.currency)}</span>
            </div>
            <div className="t">
              <span>Total</span>
              <span>{money(invoice.total, invoice.currency)}</span>
            </div>
            {invoice.paid > 0.005 ? (
              <div>
                <span>Paid</span>
                <span>{money(-invoice.paid, invoice.currency)}</span>
              </div>
            ) : null}
            {credited > 0.005 ? (
              <div>
                <span>Credited</span>
                <span>{money(-credited, invoice.currency)}</span>
              </div>
            ) : null}
            {writtenOff > 0.005 ? (
              <div>
                <span>Written off</span>
                <span>{money(-writtenOff, invoice.currency)}</span>
              </div>
            ) : null}
            {!draft && invoice.status !== "VOIDED" ? (
              <div className="t">
                <span>Left to pay</span>
                <span>{money(invoice.balance, invoice.currency)}</span>
              </div>
            ) : null}
          </div>
        </Section>

        {board && board.payments.length > 0 ? (
          <Section id="l2" title="Payments" sum={board.payments.length}>
            <Boxed>
              <table className="table" aria-label="Payments">
                <colgroup>
                  <col style={{ width: 120 }} />
                  <col style={{ width: 80 }} />
                  <col />
                  <col style={{ width: 140 }} />
                  <col style={{ width: 130 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Payment</th>
                    <th>Date</th>
                    <th>How</th>
                    <th>Bank line</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {board.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>
                        <span className="ref">{payment.number}</span>
                      </td>
                      <td className="muted">{payment.date}</td>
                      <td>
                        <span className="cell-lead">{payment.how}</span>
                      </td>
                      <td>
                        {payment.bankLine === "Matched" ? (
                          <span className="status status-success">Matched</span>
                        ) : payment.bankLine === "To match" ? (
                          <span className="status status-warning" style={{ color: "var(--color-ink)", fontWeight: 500 }}>
                            To match
                          </span>
                        ) : (
                          <span className="muted">{payment.bankLine}</span>
                        )}
                      </td>
                      <td className="num" style={payment.voided ? { textDecoration: "line-through", color: "var(--color-muted)" } : undefined}>
                        {money(payment.amount, invoice.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Boxed>
          </Section>
        ) : null}

        {board && board.posting.length === 0 && !draft && invoice.status !== "VOIDED" ? (
          <Section id="l4" title="Posting" sum="Not posted">
            <p className="bk-note">
              <Icon name="warn" />
              <span>
                Nothing has reached the ledger for {invoice.number} yet. <Link href="/books/needs-posting">Needs posting</Link> shows why, and posts it.
              </span>
            </p>
          </Section>
        ) : null}
        {board && board.posting.length > 0 ? (
          <Section id="l4" title="Posting" sum={board.entries === 1 ? "1 entry" : `${board.entries} entries`}>
            <Boxed>
              <table className="table" aria-label="Posting">
                <colgroup>
                  <col style={{ width: 120 }} />
                  <col style={{ width: 80 }} />
                  <col />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 120 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Entry</th>
                    <th>Date</th>
                    <th>Account</th>
                    <th className="num">Debit</th>
                    <th className="num">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {board.posting.map((line, index) => (
                    <tr key={index}>
                      <td>{line.entry ? <span className="ref">{line.entry}</span> : null}</td>
                      <td className="muted">{line.date}</td>
                      <td>
                        <span className="cell-lead">{line.account}</span>
                      </td>
                      <td className="num">{line.debit !== null ? plain(line.debit) : ""}</td>
                      <td className="num">{line.credit !== null ? plain(line.credit) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Boxed>
          </Section>
        ) : null}

        {board && board.history.length > 0 ? (
          <Section id="l5" title="History">
            <div className="bk-bleed">
              <ol className="bk-tl">
                {board.history.map((item, index) => (
                  <li key={index}>
                    <span className={item.tone ? `d ${item.tone}` : "d"} />
                    <span>{item.text}</span>
                    <time>{item.when}</time>
                  </li>
                ))}
              </ol>
            </div>
          </Section>
        ) : null}
      </div>

      <aside className="rail" aria-label={`About ${invoice.number}`}>
        {!draft ? (
          <section>
            <div className="sec-title">
              <Icon name="fiscal" /> Fiscal{" "}
              <span className="end">
                {board?.fiscal ? (
                  <span className={`pill ${board.fiscal.status === "Valid" ? "pill-ok" : board.fiscal.status === "Failed" ? "pill-bad" : "pill-warn"}`}>{board.fiscal.status}</span>
                ) : (
                  <span className="pill pill-n">Not sent</span>
                )}
              </span>
            </div>
            <dl className="attrs" style={{ gridTemplateColumns: "minmax(0,1fr)", rowGap: 2 }}>
              <dt>Verification code</dt>
              <dd className="mono">{board?.fiscal?.code ?? "—"}</dd>
              <dt style={{ marginTop: 8 }}>Fiscal day</dt>
              <dd>{board?.fiscal?.day ?? "—"}</dd>
              <dt style={{ marginTop: 8 }}>Signed</dt>
              <dd>{board?.fiscal?.signed ?? (board?.fiscal?.error ? `Not signed: ${board.fiscal.error}` : board?.fiscal ? "Not yet" : "No fiscal device signs it")}</dd>
            </dl>
          </section>
        ) : null}
        <section>
          <div className="sec-title">Details</div>
          <dl className="attrs">
            <dt>Issued</dt>
            <dd>
              {board?.issued ?? (draft ? "Not yet" : invoice.date)}
              {!board?.issued && invoice.quote ? (
                <>
                  , from <Link href={`/books/quotes?q=${encodeURIComponent(invoice.quote.number)}`}>{invoice.quote.number}</Link>
                </>
              ) : null}
            </dd>
            <dt>Terms</dt>
            <dd>{invoice.dueTerms}</dd>
            <dt>Rate</dt>
            <dd>{board?.rate ?? "—"}</dd>
            <dt>Made by</dt>
            <dd>{invoice.madeBy}</dd>
          </dl>
        </section>
      </aside>
    </div>
  );
}
