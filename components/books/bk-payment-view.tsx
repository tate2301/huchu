"use client";

import * as React from "react";
import Link from "next/link";

import { Icon, Person } from "@/components/core";
import { money } from "@/lib/books/format";
import type { InvoiceState } from "@/lib/books/invoice-state";
import type { PaymentRecordPage } from "@/lib/books/payment-record";

import { Said } from "./bk-record";

const PAYMENT_PILL: Record<PaymentRecordPage["state"]["key"], string> = {
  received: "pill-ok",
  "on-account": "pill-info",
  void: "pill-plain",
};

const INVOICE_PILL: Record<InvoiceState, string> = {
  draft: "pill-n",
  sent: "pill-info",
  "part-paid": "pill-info",
  paid: "pill-ok",
  overdue: "pill-warn",
  void: "pill-plain",
};

const plain = (n: number) => new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

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

export function BkPaymentView({ payment }: { payment: PaymentRecordPage }) {
  const approval = payment.crmDocument?.approval ?? null;
  const bankPill =
    payment.bankLine === "Matched"
      ? "pill-ok"
      : payment.bankLine === "To match"
        ? "pill-warn"
        : "pill-n";

  return (
    <>
      <div className="bk bk-rec bk-has-ph">
        <div className="bk-main">
          <div className="bk-hd">
            <div className="tr">
              <div
                className="bk-title"
                style={payment.voided ? { textDecoration: "line-through", color: "var(--color-muted)" } : undefined}
              >
                {money(payment.amount, payment.currency)}
              </div>
              <span className={`pill ${PAYMENT_PILL[payment.state.key]}`}>{payment.stateLabel}</span>
            </div>
            <div className="ml">
              {payment.customer.id ? (
                <Link href={`/books/customers/${payment.customer.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <Person name={payment.customer.name} src={payment.customer.image} />
                </Link>
              ) : (
                <Person name={payment.customer.name} src={payment.customer.image} />
              )}
              <i>·</i>
              <span>
                {payment.date} · {payment.into}
              </span>
            </div>
          </div>

          {payment.voided ? (
            <div className="bk-box warn bk-callout">
              <Icon name="warn" />
              <span className="grow">
                <b>
                  Voided{payment.voided.on ? ` ${payment.voided.on}` : ""}
                  {payment.voided.by ? (
                    <>
                      {" by "}
                      <Person name={payment.voided.by} src={payment.faces?.[payment.voided.by]} />
                    </>
                  ) : null}
                  .
                </b>{" "}
                {payment.voided.reason ?? ""}
              </span>
            </div>
          ) : payment.state.key === "on-account" ? (
            <div className="bk-box bk-callout">
              <Icon name="payments" />
              <span className="grow">
                <b>Money on account.</b> Held as credit for {payment.customer.name}, ready to apply to an invoice.
              </span>
            </div>
          ) : null}

          <Section id="p-applied" title="Applied to" sum={payment.invoice ? "1 invoice" : "On account"}>
            <Boxed>
              <table className="table" aria-label="Applied to">
                <colgroup>
                  <col style={{ width: 150 }} />
                  <col style={{ width: 90 }} />
                  <col />
                  <col style={{ width: 140 }} />
                  <col style={{ width: 140 }} />
                  <col style={{ width: 140 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Date</th>
                    <th>State</th>
                    <th className="num">Invoice total</th>
                    <th className="num">This payment</th>
                    <th className="num">Left to pay</th>
                  </tr>
                </thead>
                <tbody>
                  {payment.invoice ? (
                    <tr>
                      <td>
                        <Link href={`/books/invoices/${payment.invoice.id}`} className="ref">
                          {payment.invoice.number}
                        </Link>
                      </td>
                      <td className="muted">{payment.invoice.date}</td>
                      <td>
                        <span className={`pill ${INVOICE_PILL[payment.invoice.stateKey]}`}>{payment.invoice.stateLabel}</span>
                      </td>
                      <td className="num muted">{money(payment.invoice.total, payment.currency)}</td>
                      <td className="num" style={{ fontWeight: 500 }}>
                        {money(payment.amount, payment.currency)}
                      </td>
                      <td className="num">{payment.invoice.balance > 0.005 ? money(payment.invoice.balance, payment.currency) : "—"}</td>
                    </tr>
                  ) : (
                    <tr>
                      <td>
                        <span className="cell-lead">On account</span>
                      </td>
                      <td className="muted">{payment.date}</td>
                      <td>
                        <span className="pill pill-info">Customer credit</span>
                      </td>
                      <td className="num muted">—</td>
                      <td className="num" style={{ fontWeight: 500 }}>
                        {money(payment.amount, payment.currency)}
                      </td>
                      <td className="num muted">—</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Boxed>
          </Section>

          {payment.posting.length === 0 && !payment.voided ? (
            <Section id="p-posting" title="Posting" sum="Not posted">
              <p className="bk-note">
                <Icon name="warn" />
                <span>
                  Nothing has reached the ledger for {payment.number} yet. <Link href="/books/needs-posting">Needs posting</Link> shows why, and posts it.
                </span>
              </p>
            </Section>
          ) : null}

          {payment.posting.length > 0 ? (
            <Section id="p-posting" title="Posting" sum={payment.entries === 1 ? "1 entry" : `${payment.entries} entries`}>
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
                    {payment.posting.map((line, index) => (
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

          {payment.history.length > 0 ? (
            <Section id="p-history" title="History">
              <div className="bk-bleed">
                <ol className="bk-tl">
                  {payment.history.map((item, index) => (
                    <li key={index}>
                      <span className={item.tone ? `d ${item.tone}` : "d"} />
                      <span>
                        <Said text={item.text} faces={payment.faces} />
                      </span>
                      <time>{item.when}</time>
                    </li>
                  ))}
                </ol>
              </div>
            </Section>
          ) : null}
        </div>

        <aside className="rail" aria-label={`About ${payment.number}`}>
          <section>
            <div className="sec-title">
              <Icon name="bank" /> Bank & receipt{" "}
              <span className="end">
                <span className={`pill ${bankPill}`}>{payment.bankLine}</span>
              </span>
            </div>
            <dl className="attrs" style={{ gridTemplateColumns: "minmax(0,1fr)", rowGap: 2 }}>
              <dt>Into</dt>
              <dd>{payment.into}</dd>
              <dt style={{ marginTop: 8 }}>Method</dt>
              <dd>{payment.method}</dd>
              <dt style={{ marginTop: 8 }}>Reference</dt>
              <dd className="mono">{payment.reference ?? "—"}</dd>
              {approval ? (
                <>
                  <dt style={{ marginTop: 8 }}>Client link</dt>
                  <dd>
                    <Link href={`/a/${approval.token}`} target="_blank" rel="noreferrer" className="ref">
                      Open receipt link
                    </Link>
                  </dd>
                </>
              ) : null}
            </dl>
          </section>

          <section>
            <div className="sec-title">Details</div>
            <dl className="attrs">
              <dt>Customer</dt>
              <dd>
                {payment.customer.id ? (
                  <Link href={`/books/customers/${payment.customer.id}`}>{payment.customer.name}</Link>
                ) : (
                  payment.customer.name
                )}
              </dd>
              <dt>Received</dt>
              <dd>{payment.date}</dd>
              {payment.invoice ? (
                <>
                  <dt>Invoice</dt>
                  <dd>
                    <Link href={`/books/invoices/${payment.invoice.id}`} className="ref">
                      {payment.invoice.number}
                    </Link>
                  </dd>
                </>
              ) : null}
              {payment.deal ? (
                <>
                  <dt>Deal</dt>
                  <dd>{payment.dealId ? <Link href={`/crm/deals/${payment.dealId}`}>{payment.deal}</Link> : payment.deal}</dd>
                </>
              ) : null}
              {payment.lead && !payment.deal ? (
                <>
                  <dt>Lead</dt>
                  <dd>{payment.leadId ? <Link href={`/crm/leads/${payment.leadId}`}>{payment.lead}</Link> : payment.lead}</dd>
                </>
              ) : null}
              <dt>Rate</dt>
              <dd>{payment.rate}</dd>
              <dt>Recorded by</dt>
              <dd>
                <Said text={payment.madeBy} faces={payment.faces} />
              </dd>
            </dl>
          </section>
        </aside>
      </div>

      <div className="bk-ph-only">
        <div className="bk-ph-b" style={{ gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ alignSelf: "flex-start" }}>
              <span className={`pill ${PAYMENT_PILL[payment.state.key]}`}>{payment.stateLabel}</span>
            </span>
            <div className="num" style={{ fontSize: 34, fontWeight: 600, color: "var(--color-ink)", letterSpacing: "var(--tracking-display)", textAlign: "left" }}>
              {money(payment.amount, payment.currency)}
            </div>
            <span style={{ fontSize: 15, color: "var(--color-ink-2)" }}>
              <Person name={payment.customer.name} src={payment.customer.image} />
              {payment.customer.contact ? ` · ${payment.customer.contact}` : ""}
            </span>
          </div>
          <div className="bk-ph-list">
            <div className="bk-ph-row">
              <span>Received</span>
              <span>{payment.date}</span>
            </div>
            <div className="bk-ph-row">
              <span>Into</span>
              <span>{payment.into}</span>
            </div>
            <div className="bk-ph-row">
              <span>Invoice</span>
              <span>
                {payment.invoice ? (
                  <Link href={`/books/invoices/${payment.invoice.id}`} className="ref">
                    {payment.invoice.number}
                  </Link>
                ) : (
                  "On account"
                )}
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
