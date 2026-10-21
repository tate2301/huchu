"use client";

import * as React from "react";
import Link from "next/link";

import { QrCode } from "@/components/sheet-form/qr-code";
import { Icon } from "@/components/core";
import type { InvoiceRecordPage } from "@/lib/books/invoice-record";
import type { InvoiceState } from "@/lib/books/invoice-state";

import { Amt, BkBlock, BkFacts, BkHistory, BkRecord, BkRecordHead, BkSectionHead, None, St, type BkTone } from "./ui";

const STATE_TONE: Record<InvoiceState, BkTone> = { draft: "draft", sent: "info", "part-paid": "info", paid: "done", overdue: "warn", void: "void" };
const FISCAL_TONE: Record<"Valid" | "Failed" | "Pending" | "Void", BkTone> = { Valid: "done", Failed: "bad", Pending: "warn", Void: "void" };
const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, ""));

/** The record's big figure and the line under it: what is owing, and what was paid. */
function owing(invoice: InvoiceRecordPage): { big: number; note: string } {
  if (invoice.status === "DRAFT") return { big: invoice.total, note: "to invoice, not issued yet" };
  if (invoice.status === "VOIDED") return { big: invoice.total, note: "void" };
  if (invoice.balance <= 0.005) return { big: invoice.total, note: "paid in full" };
  return { big: invoice.balance, note: invoice.paid > 0.005 ? `owing, ${invoice.paid.toFixed(2)} paid` : "owing, nothing paid yet" };
}

/**
 * The chase on an owing invoice (`.k-steps`): issued, due, then what comes
 * next. Only what the records hold is marked done; the rest is the plan.
 */
function chase(invoice: InvoiceRecordPage): { steps: string[]; at: number } | null {
  if (invoice.status !== "ISSUED" || invoice.balance <= 0.005) return null;
  const steps = [`Issued, ${invoice.date}`, invoice.due === "No due date" ? "No due date" : `Due, ${invoice.due}`];
  if (invoice.daysOverdue > 0) {
    steps.push("Send a reminder, today", `Call ${invoice.customer.contact ?? invoice.customer.name}`);
    return { steps, at: 2 };
  }
  steps.push("Reminder on the due date");
  return { steps, at: 1 };
}

/**
 * One invoice (bk-invoice): who it is to, its state and the big figure; the
 * facts; its lines with net, VAT and total; payments and credits; the chase.
 * Beside it, Fiscal, Posting and History. Pure: the page holds the actions.
 */
export function BkInvoiceView({ invoice }: { invoice: InvoiceRecordPage }) {
  const board = invoice.board;
  const draft = invoice.status === "DRAFT";
  const head = owing(invoice);
  const plan = chase(invoice);
  const fiscal = board?.fiscal ?? null;
  const late = invoice.daysOverdue > 0 ? `${invoice.daysOverdue} ${invoice.daysOverdue === 1 ? "day" : "days"} late` : null;
  const payments = board?.payments ?? [];
  const credits = invoice.credits;
  const moved = payments.length + credits.length;
  const posting = board?.posting ?? [];
  const debit = posting.reduce((sum, row) => sum + (row.debit ?? 0), 0);
  const credit = posting.reduce((sum, row) => sum + (row.credit ?? 0), 0);

  const side = (
    <>
      {fiscal ? (
        <section className="k-blk">
          <div className="k-bh">
            <Icon name="fiscal" />
            <b>Fiscal</b>
            <St tone={FISCAL_TONE[fiscal.status]}>{fiscal.status}</St>
          </div>
          <div className="k-fis">
            {fiscal.qr ? (
              <QrCode payload={fiscal.qr} label={`Fiscal code ${fiscal.code ?? ""}`} size={72} />
            ) : (
              <span className="k-qrph">
                <Icon name="clock" />
              </span>
            )}
            <dl className="attrs">
              <dt>Verification</dt>
              <dd className="mono">{fiscal.code ?? "Not signed yet"}</dd>
              <dt>Fiscal day</dt>
              <dd>{fiscal.day != null ? `Day ${fiscal.day}${fiscal.signed ? `, ${fiscal.signed}` : ""}` : "—"}</dd>
              {fiscal.error ? (
                <>
                  <dt>Refused</dt>
                  <dd>{fiscal.error}</dd>
                </>
              ) : null}
            </dl>
          </div>
        </section>
      ) : null}
      {posting.length ? (
        <BkBlock icon="posting" title="Posting" code={posting[0]?.entry} meta={posting[0]?.date}>
          <table className="bkt dense k-pt" aria-label="Posting">
            <thead>
              <tr>
                <th>Account</th>
                <th className="r">Debit</th>
                <th className="r">Credit</th>
              </tr>
            </thead>
            <tbody>
              {posting.map((row, index) => (
                <tr key={index}>
                  <td>
                    <span className="k-ac">
                      <span className="mono">{row.account.split(" ")[0]}</span>
                      {row.account.split(" ").slice(1).join(" ")}
                    </span>
                  </td>
                  <td className="r">{row.debit != null ? <Amt value={row.debit} currency={invoice.currency} /> : null}</td>
                  <td className="r">{row.credit != null ? <Amt value={row.credit} currency={invoice.currency} /> : null}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>{Math.abs(debit - credit) < 0.005 ? "Balanced" : "Not balanced"}</td>
                <td className="r">
                  <Amt value={debit} currency={invoice.currency} />
                </td>
                <td className="r">
                  <Amt value={credit} currency={invoice.currency} />
                </td>
              </tr>
            </tfoot>
          </table>
        </BkBlock>
      ) : null}
      {board?.history.length ? (
        <BkBlock icon="history" title="History">
          <BkHistory
            items={board.history.map((item) => {
              const who = Object.keys(board.faces ?? {}).find((name) => item.text.startsWith(`${name} `)) ?? null;
              return { who, what: who ? item.text.slice(who.length + 1) : item.text, when: item.when, avatarUrl: who ? (board.faces?.[who] ?? null) : null };
            })}
          />
        </BkBlock>
      ) : null}
    </>
  );

  return (
    <BkRecord side={side}>
      <BkRecordHead
        title={<Link href={`/books/customers/${invoice.customer.id}`}>{invoice.customer.name}</Link>}
        meta={[
          <St key="state" tone={STATE_TONE[invoice.state.key]}>
            {invoice.stateLabel}
          </St>,
          ...(late ? [late] : []),
          ...(invoice.replacedBy
            ? [
                <Link key="replaced" href={`/books/invoices/${invoice.replacedBy.id}`}>
                  Replaced by {invoice.replacedBy.number}
                </Link>,
              ]
            : invoice.voided
              ? [`Voided${invoice.voided.on ? ` ${invoice.voided.on}` : ""}${invoice.voided.reason ? `: ${invoice.voided.reason}` : ""}`]
              : []),
          ...(invoice.customer.code ? [<span key="code" className="mono">{invoice.customer.code}</span>] : []),
          ...(invoice.customer.vat ? [`VAT ${invoice.customer.vat}`] : []),
          ...(invoice.customer.tin ? [`TIN ${invoice.customer.tin}`] : []),
        ]}
        big={<Amt value={head.big} currency={invoice.currency} />}
        bigNote={head.note}
      />
      <BkFacts
        items={[
          { label: "Issued", value: invoice.issuedOn ?? "On issue" },
          { label: "Due", value: invoice.dueOn ?? "No due date" },
          { label: "Currency", value: board?.rate.startsWith("None") || !board ? `${invoice.currency}, base` : `${invoice.currency}, at ${board.rate}` },
          invoice.quote
            ? { label: "Quote", value: <Link href={`/books/quotes/${invoice.quote.id}`}>{invoice.quote.number}</Link> }
            : { label: "Cost centre", value: board?.costCentre ?? "None" },
        ]}
      />
      <BkSectionHead title="Lines" sum={String(invoice.lines.length)} />
      <table className="bkt k-lines" aria-label="Lines">
        <thead data-band="head">
          <tr>
            <th>Item</th>
            <th className="r">Qty</th>
            <th className="r">Price</th>
            <th>Tax</th>
            <th className="r">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((line) => (
            <tr key={line.id} data-band="row">
              <td>
                <span className="who">{line.description}</span>
              </td>
              <td className="r mono">{qty(line.quantity)}</td>
              <td className="r">
                <Amt value={line.unitPrice} currency={invoice.currency} />
              </td>
              <td>{line.tax ? <span className="mono k-tax">{line.tax}</span> : <None />}</td>
              <td className="r">
                <Amt value={line.amount} currency={invoice.currency} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="k-tf">
          <tr>
            <td colSpan={4}>Net</td>
            <td className="r">
              <Amt value={invoice.subTotal} currency={invoice.currency} />
            </td>
          </tr>
          <tr>
            <td colSpan={4}>{invoice.taxLabel === "VAT" ? "VAT" : `VAT at ${invoice.taxLabel.replace(/^VAT /, "")}`}</td>
            <td className="r">
              <Amt value={invoice.taxTotal} currency={invoice.currency} />
            </td>
          </tr>
          <tr className="k-gt">
            <td colSpan={4}>Total</td>
            <td className="r">
              <Amt value={invoice.total} currency={invoice.currency} />
            </td>
          </tr>
        </tfoot>
      </table>
      {!draft ? (
        <>
          <BkSectionHead title="Payments and credits" sum={moved ? String(moved) : "Nothing yet"} />
          {moved ? (
            <table className="bkt" aria-label="Payments and credits">
              <thead data-band="head">
                <tr>
                  <th>Number</th>
                  <th>Date</th>
                  <th>How</th>
                  <th>Bank line</th>
                  <th className="r">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} data-band="row">
                    <td>
                      <Link className="bkw-ref" href={`/books/payments?payment=${payment.id}`}>
                        {payment.number}
                      </Link>
                    </td>
                    <td className="muted">{payment.date}</td>
                    <td className="muted">{payment.how}</td>
                    <td>
                      <St tone={payment.bankLine === "Matched" ? "done" : payment.bankLine === "Void" ? "void" : payment.bankLine === "To match" ? "warn" : "draft"}>{payment.bankLine}</St>
                    </td>
                    <td className="r">
                      <Amt value={payment.voided ? 0 : payment.amount} currency={invoice.currency} />
                    </td>
                  </tr>
                ))}
                {credits.map((note) => (
                  <tr key={note.number} data-band="row">
                    <td>
                      <span className="bkw-ref">{note.number}</span>
                    </td>
                    <td className="muted">{note.date}</td>
                    <td className="muted">{note.reason ?? "Credit note"}</td>
                    <td>{note.voided ? <St tone="void">Void</St> : <None />}</td>
                    <td className="r">
                      <Amt value={note.voided ? 0 : note.total} currency={invoice.currency} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="k-empty">Nothing paid or credited yet.</p>
          )}
        </>
      ) : null}
      {plan ? (
        <>
          <BkSectionHead title="The chase" />
          <div className="k-chase">
            <ol className="k-steps">
              {plan.steps.map((step, index) => (
                <li key={step} className={index < plan.at ? "is-done" : index === plan.at ? "is-now" : undefined}>
                  <Icon name={index < plan.at ? "done" : "clock"} />
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </>
      ) : null}
    </BkRecord>
  );
}
