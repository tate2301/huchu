"use client";

import * as React from "react";

import { Button, ButtonGroup, Icon, Status, TableFoot, TableShell, Person } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { money } from "@/lib/books/format";
import {
  PAYMENT_PERIOD_LABEL,
  PAYMENT_PERIODS,
  PAYMENT_VIEW_LABEL,
  PAYMENT_VIEWS,
  type PaymentQuery,
  type PaymentRow,
  type PaymentsView,
} from "@/lib/books/payments";

import { BooksFinding } from "./figures";

/**
 * Books → Payments: the receipts Receivables records, on the kit's page as
 * Books → Invoices is (the tools row, the finding at the list's head, the
 * table and the footer's sum). A void payment stays in the list, marked Void
 * with who, when and why, and is in no sum. Pure: the page feeds it.
 */
export function PaymentsPageView({
  data,
  onQuery,
  exportHref,
  rowMenu,
}: {
  /** A row's menu (Void), when this person may use it; none draws no menu. */
  rowMenu?: (row: PaymentRow) => MenuEntry[] | null;
  data: PaymentsView;
  onQuery: (next: Partial<PaymentQuery>) => void;
  exportHref: string;
}) {
  const [q, setQ] = React.useState(data.query.q);

  // Typing filters after a pause, not on every key.
  React.useEffect(() => {
    if (q === data.query.q) return;
    const timer = window.setTimeout(() => onQuery({ q, page: 1 }), 300);
    return () => window.clearTimeout(timer);
  }, [q, data.query.q, onQuery]);

  const { from, to, of } = data.range;
  const query = data.query;
  const filtered = Boolean(query.q) || query.view !== "all" || query.period !== "any";
  const menus = new Map(data.rows.map((row) => [row.id, rowMenu?.(row) ?? null]));
  const anyMenu = [...menus.values()].some((items) => items && items.length > 0);

  return (
    <>
      <div className="tools tl-m">
        <MenuButton
          icon="grid"
          label="Views"
          items={PAYMENT_VIEWS.map((view) => ({
            key: view,
            label: PAYMENT_VIEW_LABEL[view],
            checked: query.view === view,
            onSelect: () => onQuery({ view, page: 1 }),
          }))}
        >
          {PAYMENT_VIEW_LABEL[query.view]}
        </MenuButton>
        <label className="input-wrap tl-find">
          <Icon name="search" />
          <input type="search" aria-label="Search this list" placeholder="Search this list" value={q} onChange={(event) => setQ(event.target.value)} />
        </label>
        <MenuButton
          variant="quiet"
          icon="pipeline"
          iconEnd={undefined}
          label="When it came in"
          items={PAYMENT_PERIODS.map((period) => ({
            key: period,
            label: PAYMENT_PERIOD_LABEL[period],
            checked: query.period === period,
            onSelect: () => onQuery({ period, page: 1 }),
          }))}
        >
          {query.period === "any" ? "Filter" : PAYMENT_PERIOD_LABEL[query.period]}
        </MenuButton>
        <div className="end">
          <ButtonGroup aria-label="This list">
            <Button icon="sort" onClick={() => onQuery({ sort: query.sort === "newest" ? "oldest" : "newest", page: 1 })}>
              {query.sort === "newest" ? "Newest first" : "Oldest first"}
            </Button>
            <a className="btn" href={exportHref} download>
              <Icon name="export" />
              Export
            </a>
          </ButtonGroup>
        </div>
      </div>
      <TableShell
        label="Payments"
        foot={
          <TableFoot
            range={of === 0 ? "None" : `${from} to ${to} of ${of}`}
            sums={[{ label: "Received", value: money(data.received, data.currency) }]}
            page={{
              onPrevious: query.page > 1 ? () => onQuery({ page: query.page - 1 }) : undefined,
              onNext: to < of ? () => onQuery({ page: query.page + 1 }) : undefined,
            }}
          />
        }
      >
        <BooksFinding finding={data.finding} />
        {data.rows.length === 0 ? (
          <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
            <b>{filtered ? "No payment matches" : "No payments yet"}</b>
            <p className="muted">{filtered ? "Clear the search or the filters to see the rest." : "Record one with Add a receipt."}</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Receipt</th>
                <th>Customer</th>
                <th>Invoice</th>
                <th>Received</th>
                <th>Method</th>
                <th className="num">Amount</th>
                {anyMenu ? <th aria-label="Actions" style={{ width: 44 }} /> : null}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <span className="code">{row.number}</span>
                    {row.voided ? (
                      <span
                        className="truncate"
                        style={{ display: "block", maxWidth: 320 }}
                        title={[`Voided ${row.voided.on}`, row.voided.by ? `by ${row.voided.by}` : null, row.voided.reason].filter(Boolean).join(", ")}
                      >
                        <Status tone="danger">Void</Status>{" "}
                        <span className="muted">
                          {row.voided.on}
                          {row.voided.by ? (
                            <>
                              , <Person name={row.voided.by} src={row.voided.byImage} />
                            </>
                          ) : null}
                          {row.voided.reason ? `: ${row.voided.reason}` : ""}
                        </span>
                      </span>
                    ) : null}
                  </td>
                  <td>{row.customer ? <span className="cell-lead"><Person name={row.customer} src={row.customerImage} /></span> : <span className="muted">Not on an invoice</span>}</td>
                  <td>{row.invoice ? <span className="code">{row.invoice}</span> : <span className="muted">—</span>}</td>
                  <td className="muted">{row.received}</td>
                  <td>{row.method}</td>
                  <td
                    className="num"
                    style={row.voided ? { color: "var(--color-muted)", textDecoration: "line-through" } : { color: "var(--color-ink)", fontWeight: 500 }}
                    aria-label={row.voided ? `${money(row.amount, row.currency)}, void` : undefined}
                  >
                    {money(row.amount, row.currency)}
                  </td>
                  {anyMenu ? (
                    <td style={{ width: 44, paddingBlock: 0 }}>
                      {menus.get(row.id)?.length ? (
                        <MenuButton variant="quiet" iconOnly icon="more" iconEnd={undefined} align="end" aria-label={`More for ${row.number}`} label={`More for ${row.number}`} items={menus.get(row.id)!} />
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableShell>
    </>
  );
}
