"use client";

import Link from "next/link";

import { money } from "@/lib/books/format";
import type { VaneOrdersView } from "@/lib/retail/buying/vane-orders";

/**
 * Orders Vane drafted (the PageVaneRetail board): the finding, then Vane's
 * drafts waiting to be sent above the shop's latest other orders. Each order
 * opens its own page, where a person checks it and sends it. Pure.
 */
export function VaneOrdersPageView({ data }: { data: VaneOrdersView }) {
  return (
    <div className="kbody">
      <div className="finding">
        <p className="lede-figure">
          {data.finding.fact} <span className="q">{data.finding.rest}</span>
        </p>
      </div>
      <div className="wt table-wrap" style={{ flex: "none" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Supplier</th>
              <th>Lines</th>
              <th className="num">Value</th>
              <th>State</th>
              <th>Delivers</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.id} className={row.state === "vane" ? "is-sel" : undefined}>
                <td>
                  <Link className="code" href={`/retail/buying/orders/${row.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                    {row.poNo}
                  </Link>
                </td>
                <td>
                  <span className="cell-lead truncate" title={row.supplier}>
                    {row.supplier}
                  </span>
                </td>
                <td className="muted">{row.lines}</td>
                <td className="num">{money(row.value)}</td>
                <td>
                  <span className={row.state === "vane" ? "status status-info" : row.state === "received" ? "status status-success" : "status"}>
                    {row.stateLabel}
                  </span>
                </td>
                <td className="muted">{row.delivers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
