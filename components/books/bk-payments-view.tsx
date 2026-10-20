"use client";

import * as React from "react";
import Link from "next/link";

import { Button, SelectCell, TableFoot, TableShell, useSelection, Person } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { money } from "@/lib/books/format";
import { PAYMENT_PERIOD_LABEL, PAYMENT_PERIODS, PAYMENT_TAB_LABEL, PAYMENT_VIEWS, type PaymentQuery, type PaymentRow, type PaymentsView } from "@/lib/books/payments";

import { BkChip, BkQuietTools, BkTabs, BkTools } from "./bk-list";
import { BooksFinding } from "./figures";

/**
 * Books → Sales → Payments received (design/core-modules/boards/view/BkPaymentsIn.html):
 * this month's money in and what of it sits on account, the tabs, the search
 * and filters, and six columns. A void payment stays listed, struck through,
 * and in no sum. Selecting one offers Void to whoever may (the owner, or a
 * granted manager or accountant); the server refuses on its own.
 */
export function BkPaymentsView({
  data,
  onQuery,
  exportHref,
  canVoid,
  onVoid,
  onExport,
  undoEntries,
}: {
  data: PaymentsView;
  onQuery: (next: Partial<PaymentQuery>) => void;
  exportHref: string;
  canVoid: boolean;
  onVoid: (row: PaymentRow) => void;
  onExport: (rows: PaymentRow[]) => void;
  /** Void and Delete permanently over the selection, as the person's role allows (P4, §5.13). */
  undoEntries?: (rows: PaymentRow[]) => MenuEntry[];
}) {
  const ids = React.useMemo(() => data.rows.map((row) => row.id), [data.rows]);
  const selection = useSelection(ids);
  const query = data.query;
  const selected = data.rows.filter((row) => selection.isSelected(row.id));
  const live = selected.filter((row) => !row.voided);
  const customer = data.customers.find((option) => option.id === query.customer);
  const account = data.accounts.find((option) => option.id === query.account);
  const { from, to, of } = data.range;
  const filtered = Boolean(query.q || query.customer || query.account || query.period !== "any");

  return (
    <div className="bk">
      <BooksFinding finding={data.finding} />
      <BkTabs
        label="Payment views"
        value={query.view}
        onChange={(view) => onQuery({ view, page: 1 })}
        items={PAYMENT_VIEWS.map((view) => ({ value: view, label: PAYMENT_TAB_LABEL[view], count: data.counts[view] }))}
      />
      <BkTools
        find="Search payments"
        query={query.q}
        onFind={(q) => onQuery({ q, page: 1 })}
        count={of === 1 ? "1 payment" : `${of.toLocaleString("en-GB")} payments`}
        chips={
          <>
            <BkChip
              label="Customer"
              value={customer?.name ?? "Any"}
              set={Boolean(customer)}
              items={[
                { key: "any", label: "Any customer", checked: !query.customer, onSelect: () => onQuery({ customer: null, page: 1 }) },
                { separator: true },
                ...data.customers.map((option) => ({ key: option.id, label: <Person name={option.name} src={option.image} />, checked: query.customer === option.id, onSelect: () => onQuery({ customer: option.id, page: 1 }) })),
              ]}
            />
            <BkChip
              label="Into"
              value={account?.name ?? "Any account"}
              set={Boolean(account)}
              items={[
                { key: "any", label: "Any account", checked: !query.account, onSelect: () => onQuery({ account: null, page: 1 }) },
                { separator: true },
                ...data.accounts.map((option) => ({ key: option.id, label: option.name, checked: query.account === option.id, onSelect: () => onQuery({ account: option.id, page: 1 }) })),
              ]}
            />
          </>
        }
        filters={PAYMENT_PERIODS.map((period) => ({ key: period, label: PAYMENT_PERIOD_LABEL[period], checked: query.period === period, onSelect: () => onQuery({ period, page: 1 }) }))}
        end={<BkQuietTools onSort={() => onQuery({ sort: query.sort === "newest" ? "oldest" : "newest", page: 1 })} sortLabel={query.sort === "newest" ? "Sort" : "Oldest first"} exportHref={exportHref} />}
      />
      <TableShell
        label="Payments received"
        foot={
          <TableFoot
            range={of === 0 ? "None" : `${from} to ${to} of ${of}`}
            sums={[
              { label: data.month.name, value: money(data.month.amount, data.currency) },
              { label: "On account", value: money(data.month.onAccount, data.currency) },
            ]}
            page={{
              onPrevious: query.page > 1 ? () => onQuery({ page: query.page - 1 }) : undefined,
              onNext: to < of ? () => onQuery({ page: query.page + 1 }) : undefined,
            }}
            selection={{
              count: selected.length,
              sum: { label: "Total", value: money(live.reduce((sum, row) => sum + row.amount, 0), data.currency) },
              onClear: selection.clear,
              actions: (
                <>
                  <Button icon="export" onClick={() => onExport(selected)}>
                    Export
                  </Button>
                  {undoEntries && undoEntries(selected).length ? (
                    <MenuButton label="More" items={undoEntries(selected)}>
                      More
                    </MenuButton>
                  ) : canVoid && live.length === 1 ? (
                    <Button variant="danger" icon="x" onClick={() => onVoid(live[0])}>
                      Void {live[0].number}
                    </Button>
                  ) : null}
                </>
              ),
            }}
          />
        }
      >
        {data.rows.length === 0 ? (
          <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
            <b>{filtered || query.view !== "all" ? "No payment matches" : "No payments yet"}</b>
            <p className="muted">{filtered || query.view !== "all" ? "Clear the search or the filters to see the rest." : "Record one with Record a payment."}</p>
          </div>
        ) : (
          <table className="table" aria-label="Payments received">
            <colgroup>
              <col style={{ width: 44 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 230 }} />
              <col />
              <col style={{ width: 170 }} />
              <col style={{ width: 190 }} />
            </colgroup>
            <thead>
              <tr>
                <SelectCell head checked={selection.all} indeterminate={selection.some} onChange={selection.toggleAll} label="Select every row on this page" />
                <th>Payment</th>
                <th>Date</th>
                <th>Customer</th>
                <th>For</th>
                <th>Into</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id} aria-selected={selection.isSelected(row.id) || undefined}>
                  <SelectCell checked={selection.isSelected(row.id)} onChange={() => selection.toggle(row.id)} label={`Select ${row.number}`} />
                  <td>
                    <span className="ref">{row.number}</span>
                  </td>
                  <td className="muted">{row.received}</td>
                  <td>
                    <span className="cell-lead">{row.customer ? <Person name={row.customer} src={row.customerImage} /> : "Not named"}</span>
                  </td>
                  <td className="fill">
                    {row.voided ? (
                      <span className="muted" title={row.voided.reason ?? undefined}>
                        Void
                        {row.voided.by ? (
                          <>
                            , <Person name={row.voided.by} src={row.voided.byImage} />
                          </>
                        ) : null}{" "}
                        {row.voided.on}
                      </span>
                    ) : row.invoiceId ? (
                      <Link className="ref" href={`/books/invoices/${row.invoiceId}`}>
                        {row.invoice}
                      </Link>
                    ) : (
                      <span className="muted">On account</span>
                    )}
                  </td>
                  <td className="muted">{row.into}</td>
                  <td className="num" style={row.voided ? { textDecoration: "line-through", color: "var(--color-muted)" } : undefined}>
                    {money(row.amount, row.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableShell>
    </div>
  );
}
