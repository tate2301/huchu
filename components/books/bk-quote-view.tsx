"use client";

import * as React from "react";
import Link from "next/link";

import { Icon, Person } from "@/components/core";
import { money } from "@/lib/books/format";
import type { InvoiceState } from "@/lib/books/invoice-state";
import type { QuoteRecordPage } from "@/lib/books/quote-record";
import type { QuoteTab } from "@/lib/books/quotes-view";

import { Said } from "./bk-record";

const QUOTE_PILL: Record<QuoteTab, string> = {
  draft: "pill-n",
  sent: "pill-info",
  accepted: "pill-ok",
  expired: "pill-warn",
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

export function BkQuoteView({ quote }: { quote: QuoteRecordPage }) {
  const draft = quote.status === "DRAFT";
  const approval = quote.crmDocument?.approval ?? null;
  const sums: Array<{ label: string; amount: number; total?: boolean }> = [
    { label: "Before VAT", amount: quote.subTotal },
    { label: quote.taxLabel === "VAT" ? "VAT" : `VAT at ${quote.taxLabel.replace(/^VAT /, "")}`, amount: quote.taxTotal },
    { label: "Total", amount: quote.total, total: true },
  ];

  const validityLine =
    quote.validUntil === "No expiry"
      ? "No expiry date"
      : quote.state.key === "expired"
        ? `Ran out ${quote.validUntil}`
        : draft
          ? `Valid ${quote.validUntil}`
          : `Valid until ${quote.validUntil}`;

  const approvalStatusLabel = !approval
    ? "Not sent"
    : approval.status === "APPROVED"
      ? "Accepted"
      : approval.status === "DECLINED"
        ? "Changes requested"
        : approval.status === "REVOKED"
          ? "Withdrawn"
          : approval.firstViewedAt
            ? "Viewed"
            : "Sent";

  const approvalPill = !approval
    ? "pill-n"
    : approval.status === "APPROVED"
      ? "pill-ok"
      : approval.status === "DECLINED"
        ? "pill-warn"
        : approval.status === "REVOKED"
          ? "pill-plain"
          : "pill-info";

  return (
    <>
      <div className="bk bk-rec bk-has-ph">
        <div className="bk-main">
          <div className="bk-hd">
            <div className="tr">
              <div className="bk-title">{money(quote.total, quote.currency)}</div>
              <span className={`pill ${QUOTE_PILL[quote.state.key]}`}>{quote.stateLabel}</span>
              {quote.version > 1 ? <span className="pill pill-n">v{quote.version}</span> : null}
            </div>
            <div className="ml">
              <Link href={`/books/customers/${quote.customer.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                <Person name={quote.customer.name} src={quote.customer.image} />
              </Link>
              <i>·</i>
              <span>{validityLine}</span>
            </div>
          </div>

          {quote.waiting || (quote.madeByVane && draft) ? (
            <div className="bk-box bk-callout">
              <Icon name="foryou" />
              <span className="grow">
                <b>Vane drafted this quote.</b> Check the lines and pricing, then issue it as yours.
              </span>
            </div>
          ) : null}

          {quote.supersededBy ? (
            <div className="bk-box warn bk-callout">
              <Icon name="warn" />
              <span className="grow">
                <b>Replaced by v{quote.supersededBy.version}.</b>{" "}
                <Link href={`/books/quotes/${quote.supersededBy.id}`} className="ref">
                  {quote.supersededBy.number}
                </Link>{" "}
                is the current version of this quote.
              </span>
            </div>
          ) : null}

          {quote.voided && !quote.supersededBy ? (
            <div className="bk-box warn bk-callout">
              <Icon name="warn" />
              <span className="grow">
                <b>
                  Voided{quote.voided.on ? ` ${quote.voided.on}` : ""}
                  {quote.voided.by ? (
                    <>
                      {" by "}
                      <Person name={quote.voided.by} src={quote.faces?.[quote.voided.by]} />
                    </>
                  ) : null}
                  .
                </b>{" "}
                {quote.voided.reason ?? ""}
              </span>
            </div>
          ) : null}

          {approval?.status === "DECLINED" ? (
            <div className="bk-box warn bk-callout">
              <Icon name="warn" />
              <span className="grow">
                <b>{approval.responderName || quote.customer.name} asked for changes.</b>{" "}
                {approval.responseNote ? `"${approval.responseNote}" — ` : ""}Use <b>Revise</b> to issue the next version on the same client link.
              </span>
            </div>
          ) : approval?.status === "APPROVED" ? (
            <div className="bk-box bk-callout">
              <Icon name="check" />
              <span className="grow">
                <b>Accepted by {approval.responderName || quote.customer.name}.</b>{" "}
                {approval.responseNote ? `"${approval.responseNote}"` : "Ready to convert to an invoice."}
              </span>
            </div>
          ) : null}

          <Section id="q-lines" title="Lines" sum={quote.lines.length === 1 ? "1 line" : `${quote.lines.length} lines`}>
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
                  {quote.lines.map((line) => (
                    <tr key={line.id}>
                      <td>
                        <span className="cell-lead">{line.description}</span>
                      </td>
                      <td>{qty(line.quantity)}</td>
                      <td className="num">{money(line.unitPrice, quote.currency)}</td>
                      <td className="num">{money(line.quantity * line.unitPrice, quote.currency)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {sums.map((row) => (
                    <tr className={row.total ? "bk-sr t" : "bk-sr"} key={row.label}>
                      <td colSpan={3} className="num">
                        {row.label}
                      </td>
                      <td className="num">{money(row.amount, quote.currency)}</td>
                    </tr>
                  ))}
                </tfoot>
              </table>
            </Boxed>
          </Section>

          {quote.invoices.length > 0 ? (
            <Section id="q-invoices" title="Invoices raised" sum={quote.invoices.length}>
              <Boxed>
                <table className="table" aria-label="Invoices raised">
                  <colgroup>
                    <col style={{ width: 140 }} />
                    <col style={{ width: 100 }} />
                    <col />
                    <col style={{ width: 140 }} />
                    <col style={{ width: 140 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Date</th>
                      <th>State</th>
                      <th className="num">Total</th>
                      <th className="num">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quote.invoices.map((inv) => (
                      <tr key={inv.id}>
                        <td>
                          <Link href={`/books/invoices/${inv.id}`} className="ref">
                            {inv.number}
                          </Link>
                        </td>
                        <td className="muted">{inv.date}</td>
                        <td>
                          <span className={`pill ${INVOICE_PILL[inv.stateKey]}`}>{inv.stateLabel}</span>
                        </td>
                        <td className="num">{money(inv.total, quote.currency)}</td>
                        <td className="num">{inv.balance > 0.005 ? money(inv.balance, quote.currency) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Boxed>
            </Section>
          ) : null}

          {quote.notes ? (
            <Section id="q-notes" title="Notes">
              <p className="bk-note">
                <span>{quote.notes}</span>
              </p>
            </Section>
          ) : null}

          {quote.history.length > 0 ? (
            <Section id="q-history" title="History">
              <div className="bk-bleed">
                <ol className="bk-tl">
                  {quote.history.map((item, index) => (
                    <li key={index}>
                      <span className={item.tone ? `d ${item.tone}` : "d"} />
                      <span>
                        <Said text={item.text} faces={quote.faces} />
                      </span>
                      <time>{item.when}</time>
                    </li>
                  ))}
                </ol>
              </div>
            </Section>
          ) : null}
        </div>

        <aside className="rail" aria-label={`About ${quote.number}`}>
          <section>
            <div className="sec-title">
              <Icon name="send" /> Client approval{" "}
              <span className="end">
                <span className={`pill ${approvalPill}`}>{approvalStatusLabel}</span>
              </span>
            </div>
            <dl className="attrs" style={{ gridTemplateColumns: "minmax(0,1fr)", rowGap: 2 }}>
              <dt>Client link</dt>
              <dd>
                {approval ? (
                  <Link href={`/a/${approval.token}`} target="_blank" rel="noreferrer" className="ref">
                    Open approval page
                  </Link>
                ) : (
                  <span className="muted">Not generated yet</span>
                )}
              </dd>
              {approval?.responderName ? (
                <>
                  <dt style={{ marginTop: 8 }}>Responder</dt>
                  <dd>{approval.responderName}</dd>
                </>
              ) : null}
            </dl>
          </section>

          <section>
            <div className="sec-title">Details</div>
            <dl className="attrs">
              <dt>Customer</dt>
              <dd>
                <Link href={`/books/customers/${quote.customer.id}`}>{quote.customer.name}</Link>
              </dd>
              <dt>Dated</dt>
              <dd>{quote.date}</dd>
              <dt>Valid until</dt>
              <dd>{quote.validUntil}</dd>
              {quote.deal ? (
                <>
                  <dt>Deal</dt>
                  <dd>{quote.dealId ? <Link href={`/crm/deals/${quote.dealId}`}>{quote.deal}</Link> : quote.deal}</dd>
                </>
              ) : null}
              {quote.lead && !quote.deal ? (
                <>
                  <dt>Lead</dt>
                  <dd>{quote.leadId ? <Link href={`/crm/leads/${quote.leadId}`}>{quote.lead}</Link> : quote.lead}</dd>
                </>
              ) : null}
              {quote.supersedes ? (
                <>
                  <dt>Replaces</dt>
                  <dd>
                    <Link href={`/books/quotes/${quote.supersedes.id}`} className="ref">
                      {quote.supersedes.number}
                    </Link>{" "}
                    (v{quote.supersedes.version})
                  </dd>
                </>
              ) : null}
              {quote.revisionNote ? (
                <>
                  <dt>Why revised</dt>
                  <dd>{quote.revisionNote}</dd>
                </>
              ) : null}
              <dt>Rate</dt>
              <dd>{quote.rate}</dd>
              <dt>Made by</dt>
              <dd>
                <Said text={quote.madeBy} faces={quote.faces} />
              </dd>
            </dl>
          </section>
        </aside>
      </div>

      <div className="bk-ph-only">
        <div className="bk-ph-b" style={{ gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ alignSelf: "flex-start" }}>
              <span className={`pill ${QUOTE_PILL[quote.state.key]}`}>{quote.stateLabel}</span>
            </span>
            <div className="num" style={{ fontSize: 34, fontWeight: 600, color: "var(--color-ink)", letterSpacing: "var(--tracking-display)", textAlign: "left" }}>
              {money(quote.total, quote.currency)}
            </div>
            <span style={{ fontSize: 15, color: "var(--color-ink-2)" }}>
              <Person name={quote.customer.name} src={quote.customer.image} />
              {quote.customer.contact ? ` · ${quote.customer.contact}` : ""}
            </span>
          </div>
          <div className="bk-ph-list">
            <div className="bk-ph-row">
              <span>Dated</span>
              <span>{quote.date}</span>
            </div>
            <div className="bk-ph-row">
              <span>Valid until</span>
              <span>{quote.validUntil}</span>
            </div>
            <div className="bk-ph-row">
              <span>Approval</span>
              <span>{approvalStatusLabel}</span>
            </div>
          </div>
          <div className="bk-ph-list">
            <b style={{ fontSize: 15, color: "var(--color-ink)" }}>{quote.lines.length === 1 ? "1 line" : `${quote.lines.length} lines`}</b>
            {quote.lines.map((line) => (
              <div className="bk-ph-row" style={{ fontSize: 14 }} key={line.id}>
                <span className="truncate">{line.quantity === 1 ? line.description : `${line.description}, ${qty(line.quantity)}`}</span>
                <span className="num">{money(line.quantity * line.unitPrice, quote.currency)}</span>
              </div>
            ))}
            <div className="bk-ph-row" style={{ fontSize: 14 }}>
              <span>{sums[1]!.label}</span>
              <span className="num">{money(quote.taxTotal, quote.currency)}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
