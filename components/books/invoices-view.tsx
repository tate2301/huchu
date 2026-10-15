"use client";

import * as React from "react";

import { Button, ButtonGroup, Icon, SelectCell, TableFoot, TableShell, useSelection } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { money } from "@/lib/books/format";
import type { InvoiceRow, InvoicesView } from "@/lib/books/invoices";
import { INVOICE_PERIOD_LABEL, INVOICE_PERIODS, INVOICE_VIEW_LABEL, INVOICE_VIEWS, type InvoiceQuery } from "@/lib/books/invoices";

import { BooksFinding } from "./figures";

export type InvoiceColumns = { when: boolean; total: boolean };

function StateCell({ row }: { row: InvoiceRow }) {
  if (row.state === "overdue") {
    return (
      <span className="status status-warning" style={{ color: "var(--color-ink)", fontWeight: 500 }}>
        {row.stateLabel}
      </span>
    );
  }
  if (row.state === "paid") return <span className="status status-success">{row.stateLabel}</span>;
  if (row.state === "void") return <span className="status status-danger">{row.stateLabel}</span>;
  return <span className="status">{row.stateLabel}</span>;
}

/**
 * Books → Invoices (design/core-modules/html/books-invoices.html): the list
 * full-bleed, the finding at its head, and the footer's sums. Selecting rows
 * raises the selection footer with what they owe and Send reminders and Print
 * statements. Pure: the page and the fixture feed it.
 */
export function InvoicesPageView({
  data,
  onQuery,
  onSendReminders,
  onPrintStatements,
  exportHref,
  sending = false,
  initialSelection = [],
  initialColumns = { when: true, total: true },
  explore = null,
  vane = null,
}: {
  /** After Export, in its group: Explore this list (ExploreSuggest). */
  explore?: React.ReactNode;
  /** Last in the row: Vane's suggestions for this list (ExploreSuggest). */
  vane?: React.ReactNode;
  data: InvoicesView;
  onQuery: (next: Partial<InvoiceQuery>) => void;
  onSendReminders: (rows: InvoiceRow[]) => void;
  onPrintStatements: (rows: InvoiceRow[]) => void;
  exportHref: string;
  sending?: boolean;
  /** For the fixture: the rows the board draws selected. */
  initialSelection?: string[];
  initialColumns?: InvoiceColumns;
}) {
  const ids = React.useMemo(() => data.rows.map((row) => row.id), [data.rows]);
  const selection = useSelection(ids);
  const [columns, setColumns] = React.useState(initialColumns);
  const [q, setQ] = React.useState(data.query.q);

  React.useEffect(() => {
    for (const id of initialSelection) selection.toggle(id, true);
    // Only the first render: the board's selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Typing filters after a pause, not on every key.
  React.useEffect(() => {
    if (q === data.query.q) return;
    const timer = window.setTimeout(() => onQuery({ q, page: 1 }), 300);
    return () => window.clearTimeout(timer);
  }, [q, data.query.q, onQuery]);

  const selected = data.rows.filter((row) => selection.isSelected(row.id));
  const owing = selected.reduce((sum, row) => sum + row.balance, 0);
  const customer = data.customers.find((option) => option.id === data.query.customer);
  const { from, to, of } = data.range;
  const query = data.query;

  return (
    <>
      <div className="tools tl-m">
        <MenuButton
          icon="grid"
          label="Views"
          items={INVOICE_VIEWS.map((view) => ({
            key: view,
            label: INVOICE_VIEW_LABEL[view],
            checked: query.view === view,
            onSelect: () => onQuery({ view, page: 1 }),
          }))}
        >
          {INVOICE_VIEW_LABEL[query.view]}
        </MenuButton>
        <label className="input-wrap tl-find" style={{ flex: "0 1 240px", minWidth: 140 }}>
          <Icon name="search" />
          <input type="search" aria-label="Search this list" placeholder="Search this list" value={q} onChange={(event) => setQ(event.target.value)} />
        </label>
        <MenuButton
          variant="quiet"
          icon="pipeline"
          iconEnd={undefined}
          label="When it was written"
          items={INVOICE_PERIODS.map((period) => ({
            key: period,
            label: INVOICE_PERIOD_LABEL[period],
            checked: query.period === period,
            onSelect: () => onQuery({ period, page: 1 }),
          }))}
        >
          {query.period === "any" ? "Filter" : INVOICE_PERIOD_LABEL[query.period]}
        </MenuButton>
        <MenuButton
          variant="quiet"
          icon="users"
          label="Customer"
          items={[
            { key: "any", label: "Any customer", checked: !query.customer, onSelect: () => onQuery({ customer: null, page: 1 }) },
            { separator: true },
            ...data.customers.map((option) => ({
              key: option.id,
              label: option.name,
              checked: query.customer === option.id,
              onSelect: () => onQuery({ customer: option.id, page: 1 }),
            })),
          ]}
        >
          {customer?.name ?? "Any customer"}
        </MenuButton>
        <div className="end">
          <ButtonGroup aria-label="This list">
            <Button icon="sort" onClick={() => onQuery({ sort: query.sort === "newest" ? "oldest" : "newest", page: 1 })}>
              {query.sort === "newest" ? "Newest first" : "Oldest first"}
            </Button>
            <MenuButton
              icon="eye"
              iconEnd={undefined}
              align="end"
              label="Columns"
              items={[
                { key: "when", label: "When", checked: columns.when, onSelect: () => setColumns((c) => ({ ...c, when: !c.when })) },
                { key: "total", label: "Total", checked: columns.total, onSelect: () => setColumns((c) => ({ ...c, total: !c.total })) },
              ]}
            >
              Columns
            </MenuButton>
            <a className="btn" href={exportHref} download>
              <Icon name="export" />
              Export
            </a>
            {explore}
          </ButtonGroup>
          {vane}
        </div>
      </div>
      <TableShell
        label="Invoices"
        foot={
          <TableFoot
            range={of === 0 ? "None" : `${from} to ${to} of ${of}`}
            sums={[
              { label: "Owed", value: money(data.owed, data.currency) },
              { label: "Overdue", value: money(data.overdue, data.currency) },
            ]}
            page={{
              onPrevious: query.page > 1 ? () => onQuery({ page: query.page - 1 }) : undefined,
              onNext: to < of ? () => onQuery({ page: query.page + 1 }) : undefined,
            }}
            selection={{
              count: selected.length,
              sum: { label: "Owing", value: money(owing, data.currency) },
              onClear: selection.clear,
              actions: (
                <>
                  <Button icon="remind" busy={sending} disabled={sending} onClick={() => onSendReminders(selected)}>
                    Send reminders
                  </Button>
                  <Button icon="print" onClick={() => onPrintStatements(selected)}>
                    Print statements
                  </Button>
                </>
              ),
            }}
          />
        }
      >
        <BooksFinding finding={data.finding} />
        {data.rows.length === 0 ? (
          <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
            <b>{query.q || query.customer || query.view !== "all" || query.period !== "any" ? "No invoice matches" : "No invoices yet"}</b>
            <p className="muted">
              {query.q || query.customer || query.view !== "all" || query.period !== "any"
                ? "Clear the search or the filters to see the rest."
                : "Write one with New invoice."}
            </p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <SelectCell head checked={selection.all} indeterminate={selection.some} onChange={selection.toggleAll} label="Select every invoice on this page" />
                <th>Invoice</th>
                <th>Customer</th>
                <th>State</th>
                {columns.when ? <th>When</th> : null}
                {columns.total ? <th className="num">Total</th> : null}
                <th className="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id} aria-selected={selection.isSelected(row.id) || undefined}>
                  <SelectCell checked={selection.isSelected(row.id)} onChange={() => selection.toggle(row.id)} label={`Select ${row.number}`} />
                  <td>
                    <span className="code">{row.number}</span>
                  </td>
                  <td>
                    <span className="cell-lead">{row.customer.name}</span>
                  </td>
                  <td>
                    <StateCell row={row} />
                  </td>
                  {columns.when ? <td className="muted">{row.when}</td> : null}
                  {columns.total ? <td className="num">{money(row.total, row.currency)}</td> : null}
                  {row.balance > 0 ? (
                    <td className="num" style={{ color: "var(--color-ink)", fontWeight: 500 }}>
                      {money(row.balance, row.currency)}
                    </td>
                  ) : (
                    <td className="num">—</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableShell>
    </>
  );
}
