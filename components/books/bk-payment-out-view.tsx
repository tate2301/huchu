"use client";

import * as React from "react";
import Link from "next/link";

import type { PaymentOutRecordPage } from "@/lib/books/payment-out-record";
import { money } from "@/lib/books/format";

import { BkState } from "./bk-list";
import { Bleed, Callout, History, Named, PostingTable, RailSection, RecordHead, Section } from "./bk-record";

const TONE = { DRAFT: "plain", TO_APPROVE: "warning", APPROVED: "info", PAID: "success", VOIDED: "void" } as const;

/**
 * One payment made (design/books/html/bk-payment-made.html): the total and its
 * state; the warning when the supplier has no ITF263; the bill it clears; what
 * leaves the bank, withholding and IMTT worked out, the sums under the lines;
 * Posting, one heading with its figure beside it; its history. On the right,
 * the approval chain and the facts. Pure.
 */
export function BkPaymentOutView({ record }: { record: PaymentOutRecordPage }) {
  const c = record.currency;
  const unpaid = record.status === "DRAFT" || record.status === "TO_APPROVE" || record.status === "APPROVED";
  const clearance = unpaid && record.supplier && record.supplier.itf263 !== "Valid" && record.withheld > 0.004;
  const refusal = record.status === "TO_APPROVE" ? record.can.approve.reason : record.status === "APPROVED" ? record.can.pay.reason : null;
  const to = record.supplier?.name ?? "the supplier";
  return (
    <div className="bk bk-rec">
      <div className="bk-main">
        <RecordHead
          title={money(record.gross, c)}
          pill={<BkState tone={TONE[record.status]}>{record.state}</BkState>}
          line={[record.supplier ? <Link key="s" href={`/books/suppliers/${record.supplier.id}`}>{record.supplier.name}</Link> : null, record.number]}
        />

        {clearance && record.supplier ? (
          <Callout
            icon="warn"
            action={
              <Link className="btn" href={`/books/suppliers/${record.supplier.id}`}>
                Add their ITF263
              </Link>
            }
          >
            <b>{record.supplier.name} has {record.supplier.itf263 === "Expired" ? "no valid" : "no"} ITF263 on file.</b> {Math.round(record.withholding.rate * 100)}% is withheld and paid to ZIMRA by {record.withholding.dueBy}.
          </Callout>
        ) : null}
        {refusal ? (
          <Callout icon="warn">
            <b>{refusal}</b>
          </Callout>
        ) : null}

        {record.bill ? (
          <Section id="p1" title="Bills" sum={1}>
            <Bleed>
              <table className="table" aria-label="Bills">
                <colgroup>
                  <col style={{ width: 280 }} />
                  <col style={{ width: 160 }} />
                  <col style={{ width: 80 }} />
                  <col />
                  <col style={{ width: 130 }} />
                  <col style={{ width: 130 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Bill</th>
                    <th>Their FTI</th>
                    <th>Due</th>
                    <th />
                    <th className="num">Owing</th>
                    <th className="num">Paying</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <Link className="ref" href={`/books/bills/${record.bill.id}`}>
                        {record.bill.number}
                      </Link>
                    </td>
                    <td className="mono">{record.bill.theirFti ?? "—"}</td>
                    <td className="muted">{record.bill.due ?? "—"}</td>
                    <td />
                    <td className="num">{money(record.bill.owing, c)}</td>
                    <td className="num">{money(record.gross, c)}</td>
                  </tr>
                </tbody>
              </table>
            </Bleed>
          </Section>
        ) : null}

        <Section id="p2" title="What leaves the bank">
          <Bleed>
            <table className="table" aria-label="What leaves the bank">
              <colgroup>
                <col />
                <col style={{ width: 160 }} />
              </colgroup>
              <tbody>
                <tr>
                  <td>Bills paid</td>
                  <td className="num">{money(record.gross, c)}</td>
                </tr>
                {record.withheld > 0.004 ? (
                  <tr>
                    <td>
                      Withholding, {Math.round(record.withholding.rate * 100)}% <span className="muted">to ZIMRA by {record.withholding.dueBy}</span>
                    </td>
                    <td className="num">{money(-record.withheld, c)}</td>
                  </tr>
                ) : null}
              </tbody>
              <tfoot>
                <tr className="bk-sr t">
                  <td>Paid to {to}</td>
                  <td className="num">{money(record.paid, c)}</td>
                </tr>
                <tr className="bk-sr">
                  <td>IMTT, {Math.round(record.imttRate * 1000) / 10}% on the transfer</td>
                  <td className="num">{money(record.imtt, c)}</td>
                </tr>
                <tr className="bk-sr t">
                  <td>Leaves {record.from?.name ?? "the account"}</td>
                  <td className="num">{money(record.leaves, c)}</td>
                </tr>
              </tfoot>
            </table>
          </Bleed>
        </Section>

        <Section id="p3" title="Posting" sum={record.posting.length ? (record.entries === 1 ? "1 entry" : `${record.entries} entries`) : unpaid ? "Posts when paid" : null}>
          {record.posting.length ? <PostingTable rows={record.posting} /> : null}
        </Section>

        {record.history.length ? (
          <Section id="p4" title="History">
            <History items={record.history} faces={record.faces} />
          </Section>
        ) : null}
      </div>

      <aside className="rail" aria-label={`About ${record.number ?? "this payment"}`}>
        <RailSection
          title="Approval"
          rows={record.chain.map((step) => [
            step.label,
            step.person ? (
              <Named key={step.key} name={step.person.name} faces={record.faces} sub={step.sub} />
            ) : (
              <span key={step.key} className="muted">
                {step.sub ?? "Nobody yet"}
              </span>
            ),
          ])}
        />
        <RailSection
          title="Details"
          rows={[
            ["From", record.from ? `${record.from.name}, ${record.from.currency}` : "—"],
            [record.status === "PAID" || record.status === "VOIDED" ? "Paid on" : "Pay on", record.on],
            ["Reference", record.reference || "—"],
          ]}
        />
      </aside>
    </div>
  );
}
