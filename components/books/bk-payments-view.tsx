"use client";

import * as React from "react";
import Link from "next/link";

import { Button, Icon, SelectCell, TableFoot, TableShell, useSelection, Person } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { count, money } from "@/lib/books/format";
import { PAYMENT_BANK_LABEL, PAYMENT_PERIOD_LABEL, PAYMENT_PERIODS, PAYMENT_TAB_LABEL, PAYMENT_VIEWS, PAYMENTS_PAGE_SIZE, type PaymentQuery, type PaymentRow, type PaymentsView } from "@/lib/books/payments";

import { BkChip, BkQuietTools, BkState, BkTabs, BkTools, useBkLayout } from "./bk-list";
import { Cents } from "./figures";

/**
 * Books → Sales → Payments received (design/books/html/bk-payments.html): the
 * tabs, the search and filters, eight columns on one line each, the total, and
 * the one payment on no invoice whose customer owes. A void payment stays
 * listed, struck through, and in no sum. Selecting one offers Void to whoever may (the owner, or a
 * granted manager or accountant); the server refuses on its own.
 */
/** The totals row: on the fill, sticking to the bottom of the scroll, as the design draws it. */
const footCell: React.CSSProperties = { position: "sticky", bottom: 0, zIndex: 1, height: 40, background: "var(--color-fill)", color: "var(--color-ink)", fontWeight: 600, whiteSpace: "nowrap" };

export function BkPaymentsView({
  data,
  onQuery,
  exportHref,
  canVoid,
  onVoid,
  onExport,
  undoEntries,
  matchHref,
}: {
  data: PaymentsView;
  onQuery: (next: Partial<PaymentQuery>) => void;
  exportHref: string;
  canVoid: boolean;
  onVoid: (row: PaymentRow) => void;
  onExport: (rows: PaymentRow[]) => void;
  /** Void and Delete permanently over the selection, as the person's role allows (P4, §5.13). */
  undoEntries?: (rows: PaymentRow[]) => MenuEntry[];
  /** Bank → To match, where payments wait for their statement line. */
  matchHref: string;
}) {
  const ids = React.useMemo(() => data.rows.map((row) => row.id), [data.rows]);
  const source = React.useMemo(() => data.rows, [data?.rows]);
  const layout = useBkLayout("payments", [{ key: "customer", label: "Customer", nth: 3 }, { key: "date", label: "Date", nth: 4 }, { key: "into", label: "Into", nth: 5 }, { key: "how", label: "How", nth: 6 }, { key: "paid", label: "Paid", nth: 7 }, { key: "bank", label: "Bank", nth: 8 }], [{ key: "customer", label: "Customer", by: (row) => row.customer ?? "On account" }, { key: "into", label: "Into", by: (row) => row.into ?? "No account" }, { key: "how", label: "How", by: (row) => row.method }], source);
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
        count={of.toLocaleString("en-GB")}
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
              label="Account"
              value={account?.name ?? "Any"}
              set={Boolean(account)}
              items={[
                { key: "any", label: "Any account", checked: !query.account, onSelect: () => onQuery({ account: null, page: 1 }) },
                { separator: true },
                ...data.accounts.map((option) => ({ key: option.id, label: option.name, checked: query.account === option.id, onSelect: () => onQuery({ account: option.id, page: 1 }) })),
              ]}
            />
            <BkChip
              label="Date"
              value={query.period === "any" ? "Any" : PAYMENT_PERIOD_LABEL[query.period]}
              set={query.period !== "any"}
              items={PAYMENT_PERIODS.map((period) => ({ key: period, label: PAYMENT_PERIOD_LABEL[period], checked: query.period === period, onSelect: () => onQuery({ period, page: 1 }) }))}
            />
          </>
        }
        filters={PAYMENT_PERIODS.map((period) => ({ key: period, label: PAYMENT_PERIOD_LABEL[period], checked: query.period === period, onSelect: () => onQuery({ period, page: 1 }) }))}
        end={<BkQuietTools middle={layout.tools} onSort={() => onQuery({ sort: query.sort === "newest" ? "oldest" : "newest", page: 1 })} sortLabel={query.sort === "newest" ? "Sort" : "Oldest first"} exportHref={exportHref} extra={<Link className="btn btn-quiet" href={matchHref}><Icon name="match" />Match bank lines</Link>} />}
      />
      <div className={layout.wrap} style={{ display: "contents" }}>
{layout.style}
<TableShell
        label="Payments received"
        foot={
          <TableFoot
            range={of === 0 ? "None" : `${from}–${to} of ${of} · Rows ${PAYMENTS_PAGE_SIZE}`}
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
          <>
            <table className="table" aria-label="Payments received">
              <colgroup>
                <col style={{ width: 44 }} />
                <col style={{ width: 112 }} />
                <col />
                <col style={{ width: 88 }} />
                <col style={{ width: 176 }} />
                <col style={{ width: 136 }} />
                <col style={{ width: 128 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 144 }} />
              </colgroup>
              <thead>
                <tr>
                  <SelectCell head checked={selection.all} indeterminate={selection.some} onChange={selection.toggleAll} label="Select every payment" />
                  <th>Number</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Into</th>
                  <th>How</th>
                  <th>Paid</th>
                  <th>Bank</th>
                  <th className="num">Amount, {data.currency}</th>
                </tr>
              </thead>
              <tbody>
                {layout.rows((row) => (
                  <tr key={row.id} aria-selected={selection.isSelected(row.id) || undefined}>
                    <SelectCell checked={selection.isSelected(row.id)} onChange={() => selection.toggle(row.id)} label={`Select ${row.number}`} />
                    <td>
                      <span className="ref">{row.number}</span>
                    </td>
                    <td>
                      <span className="cell-lead">{row.customer ? <Person name={row.customer} src={row.customerImage} /> : "Not named"}</span>
                    </td>
                    <td className="muted">{row.received}</td>
                    <td>{row.into ?? <span className="muted">—</span>}</td>
                    <td className="muted">{row.method}</td>
                    <td>
                      {row.voided ? (
                        <span className="muted" title={row.voided.reason ?? undefined}>
                          Void{row.voided.by ? `, ${row.voided.by}` : ""} {row.voided.on}
                        </span>
                      ) : row.invoiceId ? (
                        <Link className="ref" href={`/books/invoices/${row.invoiceId}`}>
                          {row.invoice}
                        </Link>
                      ) : (
                        <BkState tone="warning">On account</BkState>
                      )}
                    </td>
                    <td>
                      {row.bank ? <BkState tone={row.bank === "matched" ? "void" : "warning"}>{PAYMENT_BANK_LABEL[row.bank]}</BkState> : <span className="muted">—</span>}
                    </td>
                    <td className="num" style={row.voided ? { textDecoration: "line-through", color: "var(--color-muted)" } : undefined}>
                      <Cents value={row.amount} currency={row.currency} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={footCell} />
                  <td style={footCell} colSpan={7}>
                    {count(of, "payment")}
                  </td>
                  <td style={footCell} className="num">
                    <Cents value={data.received} currency={data.currency} />
                  </td>
                </tr>
              </tfoot>
            </table>
            {data.allocate ? (
              <div className="bk-box warn bk-callout" data-note="warn">
                <Icon name="warn" />
                <span className="grow">
                  <b>
                    {data.allocate.customer} paid <Cents value={data.allocate.amount} currency={data.allocate.currency} /> with no invoice named.
                  </b>{" "}
                  They owe <Cents value={data.allocate.invoice.owed} currency={data.allocate.currency} /> on {data.allocate.invoice.number}. Allocate it there?
                </span>
                <Link className="btn" href={`/books/invoices/${data.allocate.invoice.id}`}>
                  <Icon name="check" />
                  Allocate to {data.allocate.invoice.number}
                </Link>
              </div>
            ) : null}
          </>
        )}
      </TableShell>
</div>
    </div>
  );
}
