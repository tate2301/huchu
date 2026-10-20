"use client";

import * as React from "react";
import Link from "next/link";

import { TableFoot, TableShell } from "@/components/core";
import { money } from "@/lib/books/format";
import { SPENDING_MODULES, SPENDING_TAB_LABEL, SPENDING_VIEWS, type SpendingPage, type SpendingQuery } from "@/lib/books/spending";

import { BkChip, BkQuietTools, BkTabs, BkTools } from "./bk-list";
import { BooksFinding } from "./figures";

/**
 * Books → Bills & spending → All spending (design/core-modules/boards/view/BkSpending.html):
 * every money-out document this month from every module, read by the core's
 * one money-out rule, so its total is Money's. The kind is the tab, so it is
 * not a column too. Read only: each row opens its own document.
 */
export function BkSpendingView({ data, onQuery, exportHref }: { data: SpendingPage; onQuery: (next: Partial<SpendingQuery>) => void; exportHref: string }) {
  const query = data.query;
  const c = data.currency;
  const filtered = Boolean(query.q || query.from || query.account);
  return (
    <div className="bk">
      <BooksFinding finding={data.finding} />
      <BkTabs label="Spending views" value={query.view} onChange={(view) => onQuery({ view })} items={SPENDING_VIEWS.map((view) => ({ value: view, label: SPENDING_TAB_LABEL[view], count: data.counts[view] }))} />
      <BkTools
        find="Search spending"
        query={query.q}
        onFind={(q) => onQuery({ q })}
        count={`${data.rows.length} ${query.month === "last" ? "last month" : "this month"}`}
        chips={
          <>
            <BkChip
              label="From"
              value={query.from ?? "Any module"}
              set={Boolean(query.from)}
              items={[
                { key: "any", label: "Any module", checked: !query.from, onSelect: () => onQuery({ from: null }) },
                { separator: true },
                ...SPENDING_MODULES.map((module) => ({ key: module, label: module, checked: query.from === module, onSelect: () => onQuery({ from: module }) })),
              ]}
            />
            <BkChip
              label="Paid from"
              value={query.account ?? "Any"}
              set={Boolean(query.account)}
              items={[
                { key: "any", label: "Any", checked: !query.account, onSelect: () => onQuery({ account: null }) },
                { separator: true },
                ...data.accounts.map((name) => ({ key: name, label: name, checked: query.account === name, onSelect: () => onQuery({ account: name }) })),
              ]}
            />
          </>
        }
        filters={[
          { key: "this", label: "This month", checked: query.month === "this", onSelect: () => onQuery({ month: "this" }) },
          { key: "last", label: "Last month", checked: query.month === "last", onSelect: () => onQuery({ month: "last" }) },
        ]}
        end={<BkQuietTools onSort={() => onQuery({ sort: query.sort === "newest" ? "largest" : "newest" })} sortLabel={query.sort === "newest" ? "Sort" : "Largest first"} exportHref={exportHref} />}
      />
      <TableShell
        label="All spending"
        foot={
          <TableFoot
            range={`${data.rows.length} in ${data.monthName}`}
            sums={[
              { label: "Gone out", value: money(data.total, c) },
              { label: "Bills", value: money(data.byKind.bills, c) },
              { label: "Payroll", value: money(data.byKind.payroll, c) },
            ]}
          />
        }
      >
        {data.rows.length === 0 ? (
          <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
            <b>{filtered ? "Nothing matches" : `Nothing has gone out in ${data.monthName}`}</b>
            <p className="muted">{filtered ? "Clear the search or the filters to see the rest." : "Bills paid, requisitions paid out, claims paid back, vouchers, till payouts and pay runs land here."}</p>
          </div>
        ) : (
          <table className="table" aria-label="All spending">
            <colgroup>
              <col style={{ width: 80 }} />
              <col />
              <col style={{ width: 90 }} />
              <col style={{ width: 180 }} />
              <col style={{ width: 170 }} />
              <col style={{ width: 190 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Date</th>
                <th>What</th>
                <th>From</th>
                <th>Paid from</th>
                <th>Document</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.key}>
                  <td className="muted">{row.date}</td>
                  <td className="fill truncate">
                    <span className="cell-lead">{row.what}</span>
                  </td>
                  <td className="muted">{row.module}</td>
                  <td className="muted truncate">{row.paidFrom ?? "—"}</td>
                  <td className="truncate">
                    {row.document && row.href ? (
                      <Link className="ref" href={row.href}>
                        {row.document}
                      </Link>
                    ) : row.document ? (
                      <span className="ref">{row.document}</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="num">{money(row.amount, c)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableShell>
    </div>
  );
}
