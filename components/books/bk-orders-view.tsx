"use client";

import * as React from "react";
import Link from "next/link";

import { Button, SelectCell, TableFoot, TableShell, useSelection } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { money } from "@/lib/books/format";
import { ORDER_TAB_LABEL, ORDER_VIEWS, type OrderQuery, type OrderRow, type OrdersPage } from "@/lib/books/orders";
import { PERIOD_LABEL, PERIODS } from "@/lib/books/period";

import { BkChip, BkQuietTools, BkTabs, BkTools } from "./bk-list";
import { BooksFinding } from "./figures";

const SOURCE_WORD = { retail: "The shop", books: "Books' own" } as const;

/**
 * Books → Bills & spending → Purchase orders (design/core-modules/boards/view/BkOrders.html):
 * what is on order and not yet received, the tabs by state, the search with
 * Supplier and For, and six columns with how much has come in. A selection is
 * sent, approved (not by its maker) or cancelled; the server refuses on its own.
 */
export function BkOrdersView({
  data,
  onQuery,
  exportHref,
  onMove,
  more,
}: {
  data: OrdersPage;
  exportHref: string;
  onQuery: (next: Partial<OrderQuery>) => void;
  onMove: (move: "submit" | "approve", rows: OrderRow[]) => void;
  more: (rows: OrderRow[]) => MenuEntry[];
}) {
  const ids = React.useMemo(() => data.rows.map((row) => row.id), [data.rows]);
  const selection = useSelection(ids);
  const query = data.query;
  const selected = data.rows.filter((row) => selection.isSelected(row.id));
  const drafts = selected.filter((row) => row.status === "DRAFT" && !row.retail);
  const waiting = selected.filter((row) => row.status === "TO_APPROVE" && row.createdById !== data.me);
  const own = selected.filter((row) => row.status === "TO_APPROVE" && row.createdById === data.me);
  const supplier = data.suppliers.find((option) => option.id === query.supplier);
  const { from, to, of } = data.range;
  const filtered = Boolean(query.q || query.supplier || query.source || query.period !== "any");

  return (
    <div className="bk">
      <BooksFinding finding={data.finding} />
      <BkTabs label="Order views" value={query.view} onChange={(view) => onQuery({ view, page: 1 })} items={ORDER_VIEWS.map((view) => ({ value: view, label: ORDER_TAB_LABEL[view], count: data.counts[view] }))} />
      <BkTools
        find="Search orders"
        query={query.q}
        onFind={(q) => onQuery({ q, page: 1 })}
        count={`${of.toLocaleString("en-GB")} ${ORDER_TAB_LABEL[query.view].toLowerCase()}`}
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
              label="For"
              value={query.source ? SOURCE_WORD[query.source] : "Any job"}
              set={Boolean(query.source)}
              items={[
                { key: "any", label: "Any job", checked: !query.source, onSelect: () => onQuery({ source: null, page: 1 }) },
                { separator: true },
                { key: "books", label: "Books' own", checked: query.source === "books", onSelect: () => onQuery({ source: "books", page: 1 }) },
                { key: "retail", label: "The shop", checked: query.source === "retail", onSelect: () => onQuery({ source: "retail", page: 1 }) },
              ]}
            />
          </>
        }
        filters={PERIODS.map((period) => ({ key: period, label: PERIOD_LABEL[period], checked: query.period === period, onSelect: () => onQuery({ period, page: 1 }) }))}
        end={<BkQuietTools onSort={() => onQuery({ sort: query.sort === "newest" ? "oldest" : "newest", page: 1 })} sortLabel={query.sort === "newest" ? "Sort" : "Oldest first"} exportHref={exportHref} />}
      />
      <TableShell
        label="Purchase orders"
        foot={
          <TableFoot
            range={of === 0 ? "None" : `${from} to ${to} of ${of}`}
            sums={[{ label: "On order", value: money(data.onOrder, data.currency) }]}
            page={{
              onPrevious: query.page > 1 ? () => onQuery({ page: query.page - 1 }) : undefined,
              onNext: to < of ? () => onQuery({ page: query.page + 1 }) : undefined,
            }}
            selection={{
              count: selected.length,
              sum: { label: "Total", value: money(selected.reduce((sum, row) => sum + row.amount, 0), data.currency) },
              onClear: selection.clear,
              note: own.length ? `${own.map((row) => row.number).join(", ")} ${own.length === 1 ? "is" : "are"} yours, so skipped` : undefined,
              actions: (
                <>
                  {drafts.length && data.can.create ? (
                    <Button icon="send" onClick={() => onMove("submit", drafts)}>
                      Send {drafts.length}
                    </Button>
                  ) : null}
                  {waiting.length && data.can.approve ? (
                    <Button icon="check" onClick={() => onMove("approve", waiting)}>
                      Approve {waiting.length}
                    </Button>
                  ) : null}
                  <MenuButton label="More" items={more(selected)}>
                    More
                  </MenuButton>
                </>
              ),
            }}
          />
        }
      >
        {data.rows.length === 0 ? (
          <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
            <b>{filtered ? "No order matches" : `No ${ORDER_TAB_LABEL[query.view].toLowerCase()} orders`}</b>
            <p className="muted">{filtered ? "Clear the search or the filters to see the rest." : "Make one with New order. Orders made in the shop show here too."}</p>
          </div>
        ) : (
          <table className="table" aria-label="Purchase orders">
            <colgroup>
              <col style={{ width: 44 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 240 }} />
              <col />
              <col style={{ width: 120 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 160 }} />
            </colgroup>
            <thead>
              <tr>
                <SelectCell head checked={selection.all} indeterminate={selection.some} onChange={selection.toggleAll} label="Select every row on this page" />
                <th>Order</th>
                <th>Supplier</th>
                <th>For</th>
                <th>Expected</th>
                <th>Received</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id} aria-selected={selection.isSelected(row.id) || undefined}>
                  <SelectCell checked={selection.isSelected(row.id)} onChange={() => selection.toggle(row.id)} label={`Select ${row.number}`} />
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
                  <td className="fill truncate">{row.forWhat ? <span className="cell-lead">{row.forWhat}</span> : <span className="muted">—</span>}</td>
                  <td>
                    <span className="muted">{row.expected ?? "—"}</span>
                  </td>
                  <td>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="meter" style={{ width: 56 }} role="meter" aria-valuenow={row.received} aria-valuemin={0} aria-valuemax={100} aria-label={`${row.received}% received`}>
                        <i style={{ width: `${row.received}%` }} />
                      </span>
                      <span className="muted">{row.received}%</span>
                    </span>
                  </td>
                  <td className="num">{money(row.amount, data.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableShell>
    </div>
  );
}
