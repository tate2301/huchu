"use client";

import Link from "next/link";

import { Pill, VaneMark } from "@/components/core";
import { money } from "@/lib/books/format";
import type { InvoicePage } from "@/lib/books/invoice-page";

const quantity = (value: number) => (Number.isInteger(value) ? String(value) : value.toLocaleString("en-GB", { maximumFractionDigits: 2 }));

/**
 * One invoice in Books, and Vane's draft invoice (the PageVaneDraft board):
 * Vane's note over it while it waits for a person, the finding, its lines
 * and totals, and the invoice's facts beside them with what changed since
 * the quote. Pure: the page feeds it.
 */
export function InvoicePageView({ data }: { data: InvoicePage }) {
  const vane = data.vane;
  return (
    <div style={{ flex: "1 1 auto", display: "flex", minHeight: 0 }}>
      <div className="kbody">
        {vane ? (
          <div
            role="note"
            style={{
              margin: "18px 28px 0",
              padding: "12px 14px",
              borderRadius: 10,
              background: "var(--color-ground)",
              border: "1px solid var(--color-line)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <VaneMark size={16} />
            <span style={{ flex: "1 1 auto", minWidth: 0 }}>
              <b style={{ fontWeight: 600 }}>Vane’s draft.</b>{" "}
              {vane.madeFrom ? `${vane.madeFrom} ` : null}
              {vane.waiting
                ? "Check it, then issue it; nothing is sent or posted until you do."
                : "A person has taken it on; it is theirs now."}
            </span>
            {vane.cardId ? (
              <Link href={`/vane?card=${vane.cardId}`} style={{ color: "var(--color-muted)", fontSize: 12.5, whiteSpace: "nowrap" }}>
                What I read
              </Link>
            ) : null}
          </div>
        ) : null}
        <div className="finding">
          <p className="lede-figure">
            {data.finding.fact}
            {data.finding.rest ? <span className="q"> {data.finding.rest}</span> : null}
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
              {data.lines.map((line) => (
                <tr key={line.id}>
                  <td className="fill">
                    <span className="cell-lead truncate" title={line.description}>
                      {line.description}
                    </span>
                  </td>
                  <td className="num">{quantity(line.quantity)}</td>
                  <td className="num">{money(line.unitPrice, data.currency)}</td>
                  <td className="num">{money(line.amount, data.currency)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="fill">Subtotal</td>
                <td className="num" />
                <td className="num" />
                <td className="num">{money(data.subTotal, data.currency)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 4,
            padding: "14px 28px",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span style={{ color: "var(--color-muted)" }}>
            {data.taxLabel} {money(data.taxTotal, data.currency)}
          </span>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Total {money(data.total, data.currency)}</span>
        </div>
      </div>
      <aside className="kaside" style={{ width: 320 }} aria-label={`Invoice ${data.number}`}>
        <span className="sec-title">Invoice</span>
        <dl className="attrs">
          {data.attrs.map((attr) => (
            <Attr key={attr.term} term={attr.term}>
              {attr.tone ? <Pill tone={attr.tone}>{attr.value}</Pill> : attr.value}
            </Attr>
          ))}
        </dl>
        {data.changes ? (
          <>
            <span style={{ marginTop: 8 }}>
              <span className="sec-title">What changed since the quote</span>
            </span>
            <dl className="attrs">
              {data.changes.length === 0 ? (
                <Attr term="Nothing">Lines and prices as accepted</Attr>
              ) : (
                data.changes.map((change, index) => (
                  <Attr key={`${change.term}-${index}`} term={change.term}>
                    {change.value}
                  </Attr>
                ))
              )}
            </dl>
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
