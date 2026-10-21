"use client";

import * as React from "react";
import Link from "next/link";

import { ButtonLink, Icon, Person, type IconName } from "@/components/core";
import { money } from "@/lib/books/format";
import type { InvoiceRecordPage } from "@/lib/books/invoice-record";
import type { InvoiceState } from "@/lib/books/invoice-state";

import { Callout, Said } from "./bk-record";

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

/**
 * The chase: where an overdue invoice has got to and what is next. Told from
 * the invoice itself (issued, fell due, how late); no reminder log is kept yet
 * (NOTES, model proposal), so nothing here claims a message was sent or read.
 */
function Chase({ invoice }: { invoice: InvoiceRecordPage }) {
  const steps: Array<{ key: string; label: string; when: string; state: "done" | "next" | "later"; icon: IconName }> = [
    { key: "issued", label: "Issued", when: invoice.date, state: "done", icon: "check" },
    { key: "due", label: "Fell due", when: invoice.due, state: "done", icon: "calendar" },
    { key: "remind", label: "Remind on WhatsApp", when: "Today", state: "next", icon: "whatsapp" },
    { key: "call", label: "Call the customer", when: "After the reminder", state: "later", icon: "clock" },
  ];
  return (
    <Section id="l3" title="The chase" sum={<span className="bk-late">{invoice.daysOverdue} {invoice.daysOverdue === 1 ? "day" : "days"} late</span>}>
      <ol className="bk-chase">
        {steps.map((step) => (
          <li className={step.state} key={step.key}>
            <span className="node">
              <Icon name={step.icon} />
            </span>
            <span className="what">{step.label}</span>
            <span className="when">{step.when}</span>
          </li>
        ))}
      </ol>
    </Section>
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
  // The sums as the lines table's foot (the board's `sums()`): the label beside its amount, under Amount.
  const sums: Array<{ label: string; amount: number; total?: boolean }> = [
    { label: "Before VAT", amount: invoice.subTotal },
    { label: invoice.taxLabel === "VAT" ? "VAT" : `VAT at ${invoice.taxLabel.replace(/^VAT /, "")}`, amount: invoice.taxTotal },
    { label: "Total", amount: invoice.total, total: true },
    ...(invoice.paid > 0.005 ? [{ label: "Paid", amount: -invoice.paid }] : []),
    ...(credited > 0.005 ? [{ label: "Credited", amount: -credited }] : []),
    ...(writtenOff > 0.005 ? [{ label: "Written off", amount: -writtenOff }] : []),
    ...(!draft && invoice.status !== "VOIDED" ? [{ label: "Left to pay", amount: invoice.balance, total: true }] : []),
  ];
  const overdue = invoice.state.key === "overdue" && invoice.daysOverdue > 0;
  const due = draft ? `Due ${invoice.due}` : overdue ? `${invoice.daysOverdue} ${invoice.daysOverdue === 1 ? "day" : "days"} late` : invoice.due === "No due date" ? invoice.due : `Due ${invoice.due}`;
  const phoneState = invoice.state.key === "overdue" && invoice.daysOverdue > 0 ? `Overdue, ${invoice.daysOverdue} ${invoice.daysOverdue === 1 ? "day" : "days"}` : invoice.stateLabel;
  const fiscal = board?.fiscal;
  return (
    <>
    <div className="bk bk-rec bk-has-ph">
      <div className="bk-main">
        <div className="bk-hd">
          <div className="tr">
            <div className="bk-title">{money(invoice.total, invoice.currency)}</div>
            <span className={`pill ${PILL[invoice.state.key]}`}>{invoice.stateLabel}</span>
          </div>
          <div className="ml">
            <span>
              <Person name={invoice.customer.name} src={invoice.customer.image} />
            </span>
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
              <b>
                Voided{invoice.voided.on ? ` ${invoice.voided.on}` : ""}
                {invoice.voided.by ? (
                  <>
                    {" by "}
                    <Person name={invoice.voided.by} src={invoice.faces?.[invoice.voided.by]} />
                  </>
                ) : null}
                .
              </b>{" "}
              {invoice.voided.reason ?? ""}
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
              <tfoot>
                {sums.map((row) => (
                  <tr className={row.total ? "bk-sr t" : "bk-sr"} key={row.label}>
                    <td colSpan={3} className="num">
                      {row.label}
                    </td>
                    <td className="num">{money(row.amount, invoice.currency)}</td>
                  </tr>
                ))}
              </tfoot>
            </table>
          </Boxed>
        </Section>

        {overdue && invoice.balance > 0.005 ? <Chase invoice={invoice} /> : null}

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
          <Callout icon="warn" action={<ButtonLink href="/books/needs-posting" icon="list">Needs posting</ButtonLink>}>
            <b>Not posted yet.</b>
          </Callout>
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
                    <span>
                      <Said text={item.text} faces={board.faces} />
                    </span>
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
      </aside>
    </div>

    {/* At phone width (BkInvoicePhone): the state, the total and who; the dates and the fiscal state; the lines. */}
    <div className="bk-ph-only">
      <div className="bk-ph-b" style={{ gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ alignSelf: "flex-start" }}>
            <span className={`pill ${PILL[invoice.state.key]}`}>{phoneState}</span>
          </span>
          <div className="num" style={{ fontSize: 34, fontWeight: 600, color: "var(--color-ink)", letterSpacing: "var(--tracking-display)", textAlign: "left" }}>
            {money(invoice.total, invoice.currency)}
          </div>
          <span style={{ fontSize: 15, color: "var(--color-ink-2)" }}>
            <Person name={invoice.customer.name} src={invoice.customer.image} />
            {invoice.customer.contact ? ` · ${invoice.customer.contact}` : ""}
          </span>
        </div>
        <div className="bk-ph-list">
          <div className="bk-ph-row">
            <span>Issued</span>
            <span>{draft ? "Not yet" : invoice.date}</span>
          </div>
          <div className="bk-ph-row">
            <span>Due</span>
            <span>{invoice.due}</span>
          </div>
          {!draft ? (
            <div className="bk-ph-row">
              <span>FDMS</span>
              <span>
                {fiscal ? (
                  <span className={`status ${fiscal.status === "Valid" ? "status-success" : fiscal.status === "Failed" ? "status-danger" : "status-warning"}`}>{fiscal.status}</span>
                ) : (
                  <span className="muted">Not sent</span>
                )}
              </span>
            </div>
          ) : null}
          {invoice.paid > 0.005 && invoice.balance > 0.005 ? (
            <div className="bk-ph-row">
              <span>Left to pay</span>
              <span className="num">{money(invoice.balance, invoice.currency)}</span>
            </div>
          ) : null}
        </div>
        <div className="bk-ph-list">
          <b style={{ fontSize: 15, color: "var(--color-ink)" }}>{invoice.lines.length === 1 ? "1 line" : `${invoice.lines.length} lines`}</b>
          {invoice.lines.map((line) => (
            <div className="bk-ph-row" style={{ fontSize: 14 }} key={line.id}>
              <span className="truncate">{line.quantity === 1 ? line.description : `${line.description}, ${qty(line.quantity)}`}</span>
              <span className="num">{money(line.quantity * line.unitPrice, invoice.currency)}</span>
            </div>
          ))}
          <div className="bk-ph-row" style={{ fontSize: 14 }}>
            <span>{sums[1]!.label}</span>
            <span className="num">{money(invoice.taxTotal, invoice.currency)}</span>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}