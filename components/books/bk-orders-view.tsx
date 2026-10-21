"use client";

import * as React from "react";
import Link from "next/link";

import { TableFoot, TableShell } from "@/components/core";
import { ORDER_STATE_LABEL, ORDER_TAB_LABEL, ORDER_VIEWS, ORDERS_PAGE_SIZE, type OrderQuery, type OrderRow, type OrdersPage } from "@/lib/books/orders";
import { PERIOD_LABEL, PERIODS } from "@/lib/books/period";

import { BkChip, BkQuietTools, BkState, BkTabs, BkTools, useBkLayout } from "./bk-list";
import { Cents } from "./figures";

const TONE: Record<OrderRow["status"], Parameters<typeof BkState>[0]["tone"]> = {
  DRAFT: "plain",
  TO_APPROVE: "warning",
  SENT: "info",
  PARTIAL: "info",
  RECEIVED: "success",
  CLOSED: "plain",
  CANCELLED: "void",
};

/**
 * Books → Bills & spending → Purchase orders (design/books/html/bk-orders.html):
 * the tabs by state with their counts, the search with Supplier and Site, and
 * eight columns on one line each: what was ordered, what has come in (the
 * latest goods receipt and how many lines it filled) and what has been billed.
 */
export function BkOrdersView({ data, onQuery, exportHref }: { data: OrdersPage; exportHref: string; onQuery: (next: Partial<OrderQuery>) => void }) {
  const query = data.query;
  const source = React.useMemo(() => data.rows, [data.rows]);
  const layout = useBkLayout(
    "orders",
    [
      { key: "supplier", label: "Supplier", nth: 2 },
      { key: "site", label: "Site", nth: 3 },
      { key: "ordered", label: "Ordered", nth: 4 },
      { key: "received", label: "Received", nth: 5 },
      { key: "billed", label: "Billed", nth: 6 },
      { key: "state", label: "State", nth: 7 },
    ],
    [
      { key: "supplier", label: "Supplier", by: (row: OrderRow) => row.supplier.name },
      { key: "site", label: "Site", by: (row: OrderRow) => row.site ?? "No site" },
      { key: "state", label: "State", by: (row: OrderRow) => ORDER_STATE_LABEL[row.status] },
    ],
    source,
  );
  const supplier = data.suppliers.find((option) => option.id === query.supplier);
  const site = data.sites.find((option) => option.id === query.site);
  const { from, to, of } = data.range;
  const filtered = Boolean(query.q || query.supplier || query.site || query.period !== "any");

  return (
    <div className="bk">
      <BkTabs label="Order views" value={query.view} onChange={(view) => onQuery({ view, page: 1 })} items={ORDER_VIEWS.map((view) => ({ value: view, label: ORDER_TAB_LABEL[view], count: data.counts[view] }))} />
      <BkTools
        find="Search orders"
        query={query.q}
        onFind={(q) => onQuery({ q, page: 1 })}
        count={of.toLocaleString("en-GB")}
        chips={
          <>
            <BkChip
              label="Supplier"
              value={supplier?.name ?? "Any"}
              set={Boolean(supplier)}
              items={[
                { key: "any", label: "Any supplier", checked: !query.supplier, onSelect: () => onQuery({ supplier: null, page: 1 }) },
                { separator: true },
                ...data.suppliers.map((option) => ({ key: option.id, label: option.name, checked: query.supplier === option.id, onSelect: () => onQuery({ supplier: option.id, page: 1 }) })),
              ]}
            />
            <BkChip
              label="Site"
              value={site?.name ?? "Any"}
              set={Boolean(site)}
              items={[
                { key: "any", label: "Any site", checked: !query.site, onSelect: () => onQuery({ site: null, page: 1 }) },
                { separator: true },
                ...data.sites.map((option) => ({ key: option.id, label: option.name, checked: query.site === option.id, onSelect: () => onQuery({ site: option.id, page: 1 }) })),
              ]}
            />
          </>
        }
        filters={PERIODS.map((period) => ({ key: period, label: PERIOD_LABEL[period], checked: query.period === period, onSelect: () => onQuery({ period, page: 1 }) }))}
        end={<BkQuietTools middle={layout.tools} onSort={() => onQuery({ sort: query.sort === "newest" ? "oldest" : "newest", page: 1 })} sortLabel={query.sort === "newest" ? "Sort" : "Oldest first"} exportHref={exportHref} />}
      />
      <div className={layout.wrap} style={{ display: "contents" }}>
        {layout.style}
        <TableShell
          label="Purchase orders"
          foot={
            of > ORDERS_PAGE_SIZE ? (
              <TableFoot
                range={`${from} to ${to} of ${of}`}
                page={{
                  onPrevious: query.page > 1 ? () => onQuery({ page: query.page - 1 }) : undefined,
                  onNext: to < of ? () => onQuery({ page: query.page + 1 }) : undefined,
                }}
              />
            ) : undefined
          }
        >
          {data.rows.length === 0 ? (
            <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
              <b>{filtered ? "No order matches" : `No ${ORDER_TAB_LABEL[query.view].toLowerCase()} orders`}</b>
              {filtered ? <p className="muted">Clear the search or the filters to see the rest.</p> : null}
            </div>
          ) : (
            <table className="table" aria-label="Purchase orders">
              <colgroup>
                <col style={{ width: 112 }} />
                <col />
                <col style={{ width: 168 }} />
                <col style={{ width: 88 }} />
                <col style={{ width: 232 }} />
                <col style={{ width: 168 }} />
                <col style={{ width: 128 }} />
                <col style={{ width: 128 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Supplier</th>
                  <th>Site</th>
                  <th>Ordered</th>
                  <th>Received</th>
                  <th>Billed</th>
                  <th>State</th>
                  <th className="num">Ordered, {data.currency}</th>
                </tr>
              </thead>
              <tbody>
                {layout.rows((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.retail ? (
                        <Link className="ref" href={`/retail/buying/orders/${row.id}`}>
                          {row.number}
                        </Link>
                      ) : (
                        <span className="ref">{row.number}</span>
                      )}
                    </td>
                    <td className="truncate">
                      <span className="cell-lead">{row.supplier.name}</span>
                    </td>
                    <td className="truncate">{row.site ?? <span className="muted">—</span>}</td>
                    <td className="muted">{row.ordered}</td>
                    <td className="truncate">
                      {row.receipt ? (
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className="meter" style={{ width: 56, flex: "none" }} role="meter" aria-valuenow={row.received} aria-valuemin={0} aria-valuemax={100} aria-label={`${row.received}% received`}>
                            <i style={{ width: `${row.received}%` }} />
                          </span>
                          <span className="truncate">
                            {row.receipt.number}
                            <span className="muted">
                              , {row.receipt.lines} of {row.receipt.of} lines
                            </span>
                          </span>
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="truncate">
                      {row.bill || row.draftBills ? (
                        <>
                          {row.bill ? <span className="ref">{row.bill}</span> : null}
                          {row.draftBills ? <span className="muted">{row.bill ? " + " : ""}{row.draftBills} draft{row.draftBills === 1 ? "" : "s"}</span> : null}
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <BkState tone={TONE[row.status]}>{ORDER_STATE_LABEL[row.status]}</BkState>
                    </td>
                    <td className="num">
                      <Cents value={row.amount} currency={data.currency} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TableShell>
      </div>
    </div>
  );
}
