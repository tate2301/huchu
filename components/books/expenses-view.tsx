"use client";

import * as React from "react";

import { Button, ButtonGroup, Icon, TableFoot, TableShell } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import {
  EXPENSE_PERIOD_LABEL,
  EXPENSE_PERIODS,
  EXPENSE_VIEW_LABEL,
  EXPENSE_VIEWS,
  type ExpenseQuery,
  type ExpenseRow,
  type ExpensesView,
} from "@/lib/books/expenses";
import { money } from "@/lib/books/format";

import { BooksFinding } from "./figures";

function StateCell({ row }: { row: ExpenseRow }) {
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
 * Books → Expenses: the bills Payables records, on the kit's page as Books →
 * Invoices is (the tools row, the finding at the list's head, the table and
 * the footer's sums). Pure: the page feeds it.
 */
export function ExpensesPageView({
  data,
  onQuery,
  exportHref,
}: {
  data: ExpensesView;
  onQuery: (next: Partial<ExpenseQuery>) => void;
  exportHref: string;
}) {
  const [q, setQ] = React.useState(data.query.q);

  // Typing filters after a pause, not on every key.
  React.useEffect(() => {
    if (q === data.query.q) return;
    const timer = window.setTimeout(() => onQuery({ q, page: 1 }), 300);
    return () => window.clearTimeout(timer);
  }, [q, data.query.q, onQuery]);

  const supplier = data.suppliers.find((option) => option.id === data.query.supplier);
  const { from, to, of } = data.range;
  const query = data.query;
  const filtered = Boolean(query.q || query.supplier) || query.view !== "all" || query.period !== "any";

  return (
    <>
      <div className="tools tl-m">
        <MenuButton
          icon="grid"
          label="Views"
          items={EXPENSE_VIEWS.map((view) => ({
            key: view,
            label: EXPENSE_VIEW_LABEL[view],
            checked: query.view === view,
            onSelect: () => onQuery({ view, page: 1 }),
          }))}
        >
          {EXPENSE_VIEW_LABEL[query.view]}
        </MenuButton>
        <label className="input-wrap tl-find">
          <Icon name="search" />
          <input type="search" aria-label="Search this list" placeholder="Search this list" value={q} onChange={(event) => setQ(event.target.value)} />
        </label>
        <MenuButton
          variant="quiet"
          icon="pipeline"
          iconEnd={undefined}
          label="When it was received"
          items={EXPENSE_PERIODS.map((period) => ({
            key: period,
            label: EXPENSE_PERIOD_LABEL[period],
            checked: query.period === period,
            onSelect: () => onQuery({ period, page: 1 }),
          }))}
        >
          {query.period === "any" ? "Filter" : EXPENSE_PERIOD_LABEL[query.period]}
        </MenuButton>
        <MenuButton
          variant="quiet"
          icon="users"
          label="Supplier"
          items={[
            { key: "any", label: "Any supplier", checked: !query.supplier, onSelect: () => onQuery({ supplier: null, page: 1 }) },
            { separator: true },
            ...data.suppliers.map((option) => ({
              key: option.id,
              label: option.name,
              checked: query.supplier === option.id,
              onSelect: () => onQuery({ supplier: option.id, page: 1 }),
            })),
          ]}
        >
          {supplier?.name ?? "Any supplier"}
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
        label="Expenses"
        foot={
          <TableFoot
            range={of === 0 ? "None" : `${from} to ${to} of ${of}`}
            sums={[
              { label: "To pay", value: money(data.toPay, data.currency) },
              { label: "Overdue", value: money(data.overdue, data.currency) },
            ]}
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
            <b>{filtered ? "No bill matches" : "No bills yet"}</b>
            <p className="muted">{filtered ? "Clear the search or the filters to see the rest." : "Enter one with New bill."}</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Bill</th>
                <th>Supplier</th>
                <th>State</th>
                <th>When</th>
                <th className="num">Total</th>
                <th className="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <span className="code">{row.number}</span>
                  </td>
                  <td>
                    <span className="cell-lead">{row.supplier.name}</span>
                  </td>
                  <td>
                    <StateCell row={row} />
                  </td>
                  <td className="muted">{row.when}</td>
                  <td className="num">{money(row.total, row.currency)}</td>
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
