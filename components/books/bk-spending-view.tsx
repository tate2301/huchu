"use client";

import * as React from "react";
import Link from "next/link";

import { TableShell } from "@/components/core";
import { count } from "@/lib/books/format";
import { SPENDING_MONTH_LABEL, SPENDING_SOURCES, SPENDING_TAB_LABEL, SPENDING_VIEWS, type SpendingPage, type SpendingQuery } from "@/lib/books/spending";

import { BkChip, BkQuietTools, BkState, BkTabs, BkTools, useBkLayout } from "./bk-list";
import { Cents } from "./figures";

/**
 * Books → Bills & spending → All spending (design/core-modules/boards/view/BkSpending.html):
 * every money-out document this month from every module, read by the core's
 * one money-out rule, so its total is Money's. Read only: each row opens its
 * own document.
 */
export function BkSpendingView({ data, onQuery, exportHref }: { data: SpendingPage; onQuery: (next: Partial<SpendingQuery>) => void; exportHref: string }) {
  const query = data.query;
  const c = data.currency;
  const source = React.useMemo(() => data.rows, [data.rows]);
  const layout = useBkLayout(
    "spending",
    [{ key: "kind", label: "Kind", nth: 2 }, { key: "for", label: "For", nth: 3 }, { key: "date", label: "Date", nth: 4 }, { key: "paid", label: "Paid from", nth: 5 }, { key: "source", label: "Source", nth: 6 }, { key: "state", label: "State", nth: 7 }],
    [{ key: "kind", label: "Kind", by: (row) => row.kindLabel }, { key: "source", label: "Source", by: (row) => row.source }, { key: "paid", label: "Paid from", by: (row) => row.paidFrom ?? "No account" }, { key: "state", label: "State", by: (row) => row.state }],
    source,
  );
  const filtered = Boolean(query.q || query.from || query.account || query.month !== "this");
  const clear = () => onQuery({ q: "", from: null, account: null, month: "this" });
  return (
    <div className="bk">
      <BkTabs label="Spending views" value={query.view} onChange={(view) => onQuery({ view })} items={SPENDING_VIEWS.map((view) => ({ value: view, label: SPENDING_TAB_LABEL[view], count: data.counts[view] }))} />
      <BkTools
        find="Search spending"
        query={query.q}
        onFind={(q) => onQuery({ q })}
        count={String(data.rows.length)}
        chips={
          <>
            <BkChip
              label="Date"
              value={data.since}
              set={query.month !== "this"}
              items={[
                { key: "this", label: SPENDING_MONTH_LABEL.this, checked: query.month === "this", onSelect: () => onQuery({ month: "this" }) },
                { key: "last", label: SPENDING_MONTH_LABEL.last, checked: query.month === "last", onSelect: () => onQuery({ month: "last" }) },
              ]}
            />
            <BkChip
              label="Source"
              value={query.from ?? "Any"}
              set={Boolean(query.from)}
              items={[
                { key: "any", label: "Any source", checked: !query.from, onSelect: () => onQuery({ from: null }) },
                { separator: true },
                ...SPENDING_SOURCES.map((name) => ({ key: name, label: name, checked: query.from === name, onSelect: () => onQuery({ from: name }) })),
              ]}
            />
            <BkChip
              label="Account"
              value={query.account ?? "Any"}
              set={Boolean(query.account)}
              items={[
                { key: "any", label: "Any account", checked: !query.account, onSelect: () => onQuery({ account: null }) },
                { separator: true },
                ...data.accounts.map((name) => ({ key: name, label: name, checked: query.account === name, onSelect: () => onQuery({ account: name }) })),
              ]}
            />
          </>
        }
        filters={[{ key: "clear", label: "Clear filters", disabled: !filtered, onSelect: clear }]}
        end={<BkQuietTools middle={layout.tools} onSort={() => onQuery({ sort: query.sort === "newest" ? "largest" : "newest" })} sortLabel={query.sort === "newest" ? "Sort" : "Largest first"} exportHref={exportHref} />}
      />
      <div className={layout.wrap} style={{ display: "contents" }}>
        {layout.style}
        <TableShell label="All spending">
          {data.rows.length === 0 ? (
            <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
              <b>{filtered || query.view !== "all" ? "Nothing matches" : `Nothing has gone out in ${data.monthName}`}</b>
            </div>
          ) : (
            <table className="table" aria-label="All spending">
              <colgroup>
                <col style={{ width: 112 }} />
                <col style={{ width: 150 }} />
                <col />
                <col style={{ width: 80 }} />
                <col style={{ width: 180 }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 128 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Kind</th>
                  <th>For</th>
                  <th>Date</th>
                  <th>Paid from</th>
                  <th>Source</th>
                  <th>State</th>
                  <th className="num">Amount, {c}</th>
                </tr>
              </thead>
              <tbody>
                {layout.rows((row) => (
                  <tr key={row.key}>
                    <td className="truncate">
                      {row.document && row.href ? (
                        <Link className="ref" href={row.href}>
                          {row.document}
                        </Link>
                      ) : row.document ? (
                        <span className="ref">{row.document}</span>
                      ) : row.href ? (
                        <Link className="muted" href={row.href}>
                          No number
                        </Link>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="muted truncate">{row.kindLabel}</td>
                    <td className="fill truncate">
                      <span className="cell-lead">{row.what}</span>
                    </td>
                    <td className="muted">{row.date}</td>
                    <td className="truncate">{row.paidFrom ?? <span className="muted">—</span>}</td>
                    <td className="muted">{row.source}</td>
                    <td>
                      <BkState tone={row.stateTone}>{row.state}</BkState>
                    </td>
                    <td className="num">
                      <Cents value={row.amount} currency={c} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bk-sr t">
                  <td colSpan={7}>{count(data.rows.length, "document")}</td>
                  <td className="num">
                    <Cents value={Math.round(data.rows.reduce((sum, row) => sum + row.amount, 0) * 100) / 100} currency={c} />
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </TableShell>
      </div>
    </div>
  );
}
