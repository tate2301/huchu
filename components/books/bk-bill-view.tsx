"use client";

import * as React from "react";
import Link from "next/link";

import type { BillRecord } from "@/lib/books/bill-record";
import { FDMS_LABEL } from "@/lib/books/bills";
import type { ExpenseState } from "@/lib/books/expenses";
import { longDay, money } from "@/lib/books/format";

import { BkState } from "./bk-list";
import { Bleed, Callout, History, PostingTable, RailSection, RecordHead, Section } from "./bk-record";

const PILL: Record<ExpenseState, string> = { draft: "pill-n", "to-pay": "pill-info", "part-paid": "pill-info", paid: "pill-ok", overdue: "pill-warn", void: "pill-plain" };
const FDMS_TONE = { VALID: "success", NOT_CHECKED: "warning", NOT_VALID: "danger" } as const;
const STATE_TONE: Record<string, "info" | "success" | "warning" | "void" | "plain"> = { Draft: "plain", "To approve": "warning", Approved: "info", Paid: "success", Void: "void" };
const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));

/**
 * One bill (design/core-modules/boards/view/BkBill.html): the total and its
 * state, who and when; the FDMS check that holds its VAT; its lines and sums;
 * the order and goods receipt it matches; the payments on it; what it posted;
 * its history. On the right, their fiscal invoice and the details. Pure.
 */
export function BkBillView({ bill }: { bill: BillRecord }) {
  const draft = bill.status === "DRAFT";
  const sums: Array<{ label: string; amount: number; total?: boolean }> = [
    { label: "Before VAT", amount: bill.subTotal },
    { label: bill.taxLabel, amount: bill.taxTotal },
    { label: "Total", amount: bill.total, total: true },
    ...(!draft && bill.status !== "VOIDED" ? [{ label: "Paid", amount: bill.paid }] : []),
    ...(bill.debitNotes > 0.005 ? [{ label: "Debit notes", amount: -bill.debitNotes }] : []),
    ...(bill.writtenOff > 0.005 ? [{ label: "Written off", amount: -bill.writtenOff }] : []),
    ...(!draft && bill.status !== "VOIDED" ? [{ label: "Left to pay", amount: bill.balance, total: true }] : []),
  ];
  const waiting = bill.payments.filter((payment) => payment.status === "TO_APPROVE").length;
  const vatWaits = bill.taxTotal > 0.005 && bill.status !== "VOIDED";
  return (
    <div className="bk bk-rec">
      <div className="bk-main">
        <RecordHead title={money(bill.total, bill.currency)} pill={<span className={`pill ${PILL[bill.state]}`}>{bill.stateLabel}</span>} line={[bill.supplier.name, bill.dueLine]} />

        {vatWaits && bill.fti.fdms === "NOT_CHECKED" ? (
          <Callout icon="fiscal">
            <b>Not checked on FDMS yet.</b> Its {money(bill.taxTotal, bill.currency)} of VAT waits until it shows Valid.
          </Callout>
        ) : vatWaits && bill.fti.fdms === "NOT_VALID" ? (
          <Callout icon="warn">
            <b>Not valid on FDMS.</b> Its {money(bill.taxTotal, bill.currency)} of VAT is not claimed. Ask {bill.supplier.name} for a valid fiscal invoice.
          </Callout>
        ) : null}
        {bill.needsReview ? (
          <Callout tone="plain" icon="list">
            <b>Made from a goods receipt.</b> Check it against their invoice, then record it.
          </Callout>
        ) : null}

        <Section id="b1" title="Lines" sum={bill.lines.length === 1 ? "1 line" : `${bill.lines.length} lines`}>
          <Bleed>
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
                {bill.lines.map((line) => (
                  <tr key={line.id}>
                    <td>
                      <span className="cell-lead">{line.description}</span>
                    </td>
                    <td>{qty(line.quantity)}</td>
                    <td className="num">{money(line.unitPrice, bill.currency)}</td>
                    <td className="num">{money(line.amount, bill.currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {sums.map((row) => (
                  <tr className={row.total ? "bk-sr t" : "bk-sr"} key={row.label}>
                    <td colSpan={3} className="num">
                      {row.label}
                    </td>
                    <td className="num">{money(row.amount, bill.currency)}</td>
                  </tr>
                ))}
              </tfoot>
            </table>
          </Bleed>
        </Section>

        {bill.match ? (
          <Section id="b2" title="Order and goods received" sum={bill.match.differs ? `${bill.match.differs} ${bill.match.differs === 1 ? "line differs" : "lines differ"}` : "All match"}>
            <Bleed>
              <table className="table" aria-label="Matches">
                <colgroup>
                  <col />
                  <col style={{ width: 160 }} />
                  <col style={{ width: 170 }} />
                  <col style={{ width: 130 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>{bill.match.order ? `Ordered, ${bill.match.order.number}` : "Ordered"}</th>
                    <th>{bill.match.receipt ? `Received, ${bill.match.receipt.number}` : "Received"}</th>
                    <th>On this bill</th>
                  </tr>
                </thead>
                <tbody>
                  {bill.match.rows.map((row) => (
                    <tr key={row.item}>
                      <td>
                        <span className="cell-lead">{row.item}</span>
                      </td>
                      <td>{row.ordered ?? <span className="muted">—</span>}</td>
                      <td>{row.received ?? <span className="muted">—</span>}</td>
                      <td>{row.differs ? <BkState tone="warning">{row.billed ?? "Not billed"}</BkState> : (row.billed ?? <span className="muted">—</span>)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Bleed>
          </Section>
        ) : null}

        {bill.payments.length ? (
          <Section id="b4" title="Payments" sum={waiting ? `${waiting} to approve` : bill.payments.length}>
            <Bleed>
              <table className="table" aria-label="Payments">
                <colgroup>
                  <col style={{ width: 120 }} />
                  <col style={{ width: 80 }} />
                  <col />
                  <col style={{ width: 130 }} />
                  <col style={{ width: 130 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Payment</th>
                    <th>Date</th>
                    <th>From</th>
                    <th>State</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {bill.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>
                        <Link className="ref" href={`/books/payments-made?q=${encodeURIComponent(payment.number === "Draft" ? bill.supplier.name : payment.number)}`}>
                          {payment.number}
                        </Link>
                      </td>
                      <td className="muted">{payment.date}</td>
                      <td>
                        <span className="cell-lead">{payment.from ?? "—"}</span>
                      </td>
                      <td>
                        <BkState tone={STATE_TONE[payment.state] ?? "plain"}>{payment.state}</BkState>
                      </td>
                      <td className="num" style={payment.status === "VOIDED" ? { textDecoration: "line-through", color: "var(--color-muted)" } : undefined}>
                        {money(payment.amount, bill.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Bleed>
          </Section>
        ) : null}

        {bill.posting.length ? (
          <Section id="b5" title="Posting" sum={bill.entries === 1 ? "1 entry" : `${bill.entries} entries`}>
            <PostingTable rows={bill.posting} />
          </Section>
        ) : !draft && bill.status !== "VOIDED" ? (
          <Section id="b5" title="Posting" sum="Not posted">
            <p className="bk-note">
              <span>
                Nothing has reached the ledger for {bill.number} yet. <Link href="/books/needs-posting">Needs posting</Link> shows why, and posts it.
              </span>
            </p>
          </Section>
        ) : null}

        {bill.history.length ? (
          <Section id="b6" title="History">
            <History items={bill.history} />
          </Section>
        ) : null}
      </div>

      <aside className="rail" aria-label={`About ${bill.number}`}>
        <RailSection
          title="Their fiscal invoice"
          rows={[
            ["Number", bill.fti.number ? <span className="mono">{bill.fti.number}</span> : "Not entered yet"],
            ["Dated", `${longDay(bill.fti.dated)} ${bill.fti.dated.slice(0, 4)}`],
            ["FDMS", <BkState key="fdms" tone={FDMS_TONE[bill.fti.fdms]}>{FDMS_LABEL[bill.fti.fdms]}</BkState>],
            ["Their VAT no.", bill.supplier.vatNumber ?? "Not registered"],
          ]}
        />
        <RailSection
          title="Details"
          rows={[
            ["Supplier", <Link key="s" href={`/books/suppliers/${bill.supplier.id}`}>{bill.supplier.name}</Link>],
            ["Terms", bill.supplier.terms],
            ["For", bill.details.for ?? "—"],
            ["Order", bill.match?.order ? <Link key="o" href={`/books/orders?q=${encodeURIComponent(bill.match.order.number)}`}>{bill.match.order.number}</Link> : "None"],
          ]}
        />
      </aside>
    </div>
  );
}
