"use client";

import * as React from "react";
import Link from "next/link";

import { ButtonLink } from "@/components/core";
import type { BillRecordPage } from "@/lib/books/bill-record";
import { FDMS_LABEL } from "@/lib/books/bills-labels";
import type { ExpenseState } from "@/lib/books/expenses";
import { money, weekdayDay } from "@/lib/books/format";

import { BkState } from "./bk-list";
import { Bleed, Callout, History, Named, PostingTable, RailSection, RecordHead, Section, Strip } from "./bk-record";

const PILL: Record<ExpenseState, string> = { draft: "pill-n", "to-pay": "pill-info", "part-paid": "pill-info", paid: "pill-ok", overdue: "pill-warn", void: "pill-plain" };
const FDMS_TONE = { VALID: "success", NOT_CHECKED: "warning", NOT_VALID: "danger" } as const;
const STATE_TONE: Record<string, "info" | "success" | "warning" | "void" | "plain"> = { Draft: "plain", "To approve": "warning", Approved: "info", Paid: "success", Void: "void" };
const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));

/**
 * One bill (design/core-modules/boards/view/BkBill.html): the total and its
 * state; the limit warning on a bill waiting for the owner; the facts row (their
 * invoice, FDMS, date, cost centre); its lines and sums; the order and goods
 * receipt it matches; the payments on it; one Posting section (none until
 * something posted; a warning with Needs posting when a recorded bill has not);
 * its history. On the right, who approves. Pure.
 */
export function BkBillView({ bill }: { bill: BillRecordPage }) {
  const draft = bill.status === "DRAFT";
  // Over the limit, a draft waits for the owner; the page's `can.approve` only says whether this person is that owner.
  const toApprove = draft && bill.total > bill.limit + 0.004 && !bill.details.approvedBy;
  const stateLabel = toApprove ? "To approve" : bill.stateLabel;
  const vatNote = bill.fti.fdms === "NOT_CHECKED" && bill.taxTotal > 0.005 ? ", waiting for FDMS" : bill.fti.fdms === "NOT_VALID" && bill.taxTotal > 0.005 ? ", not claimed" : "";
  const sums: Array<{ label: string; amount: number; total?: boolean }> = [
    { label: "Net", amount: bill.subTotal },
    { label: `VAT input${vatNote}`, amount: bill.taxTotal },
    { label: "Total", amount: bill.total, total: true },
    ...(!draft && bill.status !== "VOIDED" ? [{ label: "Paid", amount: bill.paid }] : []),
    ...(bill.debitNotes > 0.005 ? [{ label: "Debit notes", amount: -bill.debitNotes }] : []),
    ...(bill.writtenOff > 0.005 ? [{ label: "Written off", amount: -bill.writtenOff }] : []),
    ...(!draft && bill.status !== "VOIDED" ? [{ label: "Left to pay", amount: bill.balance, total: true }] : []),
  ];
  const paymentsWaiting = bill.payments.filter((payment) => payment.status === "TO_APPROVE").length;
  const vatWaits = bill.taxTotal > 0.005 && bill.status !== "VOIDED";
  const unposted = !draft && bill.status !== "VOIDED" && bill.posting.length === 0;
  const what = bill.lines[0]?.description ?? null;
  return (
    <div className="bk bk-rec">
      <div className="bk-main">
        <RecordHead
          title={money(bill.total, bill.currency)}
          pill={<span className={`pill ${toApprove ? "pill-warn" : PILL[bill.state]}`}>{stateLabel}</span>}
          line={[bill.supplier.name, what, bill.supplier.vatNumber ? `VAT ${bill.supplier.vatNumber}` : null, bill.dueLine]}
        />

        {toApprove ? (
          <Callout icon="warn">
            <b>Over the {money(bill.limit, bill.currency)} limit for bills.</b> The owner approves.{bill.details.madeBy ? ` ${bill.details.madeBy} recorded it and can't approve their own bill.` : ""}
          </Callout>
        ) : null}
        {vatWaits && bill.fti.fdms === "NOT_VALID" ? (
          <Callout icon="warn">
            <b>Not valid on FDMS.</b> Its {money(bill.taxTotal, bill.currency)} of VAT is not claimed.
          </Callout>
        ) : null}
        {bill.needsReview ? (
          <Callout tone="plain" icon="list">
            <b>Made from a goods receipt.</b> Check it against their invoice.
          </Callout>
        ) : null}

        <Strip
          tiles={[
            { label: "Their FTI", value: bill.fti.number ? <span className="mono">{bill.fti.number}</span> : "—" },
            { label: "FDMS", value: <BkState tone={FDMS_TONE[bill.fti.fdms]}>{FDMS_LABEL[bill.fti.fdms]}</BkState> },
            { label: "Dated", value: `${weekdayDay(bill.fti.dated)} ${bill.fti.dated.slice(0, 4)}` },
            { label: "Cost centre", value: bill.details.for ?? "—" },
          ]}
        />

        <Section id="b1" title="Lines" sum={bill.lines.length === 1 ? "1 line" : `${bill.lines.length} lines`}>
          <Bleed>
            <table className="table" aria-label="Lines">
              <colgroup>
                <col />
                <col style={{ width: 160 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 140 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Account</th>
                  <th>Tax</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {bill.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="truncate">
                      <span className="cell-lead">{line.description}</span>
                      {Math.abs(line.quantity - 1) > 0.0001 ? <span className="muted"> · {qty(line.quantity)} at {money(line.unitPrice, bill.currency)}</span> : null}
                    </td>
                    <td className="muted">—</td>
                    <td>{line.taxRate > 0 ? <span className="mono">{line.taxRate}%</span> : <span className="muted">—</span>}</td>
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
          <Section id="b4" title="Payments" sum={paymentsWaiting ? `${paymentsWaiting} to approve` : bill.payments.length}>
            <Bleed>
              <table className="table" aria-label="Payments">
                <colgroup>
                  <col style={{ width: 120 }} />
                  <col style={{ width: 80 }} />
                  <col />
                  <col style={{ width: 140 }} />
                  <col style={{ width: 130 }} />
                  <col style={{ width: 130 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Payment</th>
                    <th>Date</th>
                    <th>From</th>
                    <th className="num">Withheld, 30%</th>
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
                      <td className="num">{payment.withheld > 0 ? money(payment.withheld, bill.currency) : <span className="muted">—</span>}</td>
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
        ) : null}
        {unposted ? (
          <Callout
            icon="warn"
            action={
              <ButtonLink href="/books/needs-posting" icon="list">
                Needs posting
              </ButtonLink>
            }
          >
            <b>Not posted yet.</b>
          </Callout>
        ) : null}

        {bill.history.length ? (
          <Section id="b6" title="History">
            <History items={bill.history} faces={bill.faces} />
          </Section>
        ) : null}
      </div>

      <aside className="rail" aria-label={`About ${bill.number}`}>
        <RailSection
          title="Approval"
          rows={[
            ["Recorded by", <Named key="m" name={bill.details.madeBy} faces={bill.faces} />],
            ...(toApprove || bill.details.approvedBy ? ([[toApprove ? "Approves" : "Approved by", <Named key="a" name={bill.details.approvedBy ?? bill.owner} faces={bill.faces} />]] as Array<[string, React.ReactNode]>) : []),
          ]}
        />
        <RailSection
          title="Details"
          rows={[
            ["Supplier", <Link key="s" href={`/books/suppliers/${bill.supplier.id}`}>{bill.supplier.name}</Link>],
            ["Terms", bill.supplier.terms],
          ]}
        />
      </aside>
    </div>
  );
}
