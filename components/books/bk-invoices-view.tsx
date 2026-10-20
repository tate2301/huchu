"use client";

import * as React from "react";
import Link from "next/link";

import { Button, SelectCell, TableFoot, TableShell, useSelection, Person } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { money } from "@/lib/books/format";
import {
  INVOICE_PERIOD_LABEL,
  INVOICE_PERIODS,
  INVOICE_TAB_LABEL,
  INVOICE_VIEWS,
  type InvoiceQuery,
  type InvoiceRow,
  type InvoicesView,
} from "@/lib/books/invoices";
import type { InvoiceState } from "@/lib/books/invoice-state";

import { BkChip, BkQuietTools, BkState, BkTabs, BkTools } from "./bk-list";
import { BooksFinding } from "./figures";

const TONE: Record<InvoiceState, Parameters<typeof BkState>[0]["tone"]> = {
  draft: "plain",
  sent: "info",
  "part-paid": "info",
  paid: "success",
  overdue: "warning",
  void: "void",
};

/** What the selection bar can do with the rows, each through an endpoint that exists today (the full bulk set is P4). */
export type InvoiceBulk = {
  remind: (rows: InvoiceRow[]) => void;
  statements: (rows: InvoiceRow[]) => void;
  issue: (rows: InvoiceRow[]) => void;
  exportRows: (rows: InvoiceRow[]) => void;
  deleteDrafts: (rows: InvoiceRow[]) => void;
};

/**
 * Books → Sales → Invoices (design/core-modules/boards/view/BkInvoices.html, and
 * BkInvoicesBulk with rows selected): the finding, the tabs with their counts,
 * the search and filters, six columns, and the footer's sums. Selecting rows
 * raises the selection bar: Send reminders, and More for the rest.
 */
export function BkInvoicesView({
  data,
  onQuery,
  exportHref,
  bulk,
  busy = false,
  canIssue,
  canDeleteDrafts,
  undoEntries,
}: {
  data: InvoicesView;
  onQuery: (next: Partial<InvoiceQuery>) => void;
  exportHref: string;
  bulk: InvoiceBulk;
  busy?: boolean;
  canIssue: boolean;
  canDeleteDrafts: boolean;
  /** Void and Delete permanently over the selection, as the person's role allows (P4, §5.13). */
  undoEntries?: (rows: InvoiceRow[]) => MenuEntry[];
}) {
  const ids = React.useMemo(() => data.rows.map((row) => row.id), [data.rows]);
  const selection = useSelection(ids);
  const query = data.query;
  const selected = data.rows.filter((row) => selection.isSelected(row.id));
  const drafts = selected.filter((row) => row.state === "draft");
  const total = selected.reduce((sum, row) => sum + row.total, 0);
  const customer = data.customers.find((option) => option.id === query.customer);
  const { from, to, of } = data.range;
  const filtered = Boolean(query.q || query.customer || query.currency || query.period !== "any");

  const more: MenuEntry[] = [
    { key: "statements", icon: "print", label: "Print statements", onSelect: () => bulk.statements(selected) },
    ...(canIssue && drafts.length > 0
      ? [{ key: "issue", icon: "send" as const, label: drafts.length === 1 ? "Issue 1 draft" : `Issue ${drafts.length} drafts`, onSelect: () => bulk.issue(drafts) }]
      : []),
    { key: "export", icon: "export", label: selected.length === 1 ? "Export 1 row" : `Export ${selected.length} rows`, onSelect: () => bulk.exportRows(selected) },
    ...(canDeleteDrafts && drafts.length > 0
      ? [
          { separator: true as const },
          {
            key: "delete",
            icon: "x" as const,
            danger: true,
            label: drafts.length === 1 ? "Delete 1 draft" : `Delete ${drafts.length} drafts`,
            onSelect: () => bulk.deleteDrafts(drafts),
          },
        ]
      : []),
  ];
  const undo = undoEntries?.(selected) ?? [];
  if (undo.length) {
    if (!more.some((entry) => "separator" in entry)) more.push({ separator: true });
    more.push(...undo);
  }

  return (
    <div className="bk">
      <BooksFinding finding={data.finding} />
      <BkTabs
        label="Invoice views"
        value={query.view}
        onChange={(view) => onQuery({ view, page: 1 })}
        items={INVOICE_VIEWS.map((view) => ({ value: view, label: INVOICE_TAB_LABEL[view], count: data.counts[view] }))}
      />
      <BkTools
        find="Search invoices"
        query={query.q}
        onFind={(q) => onQuery({ q, page: 1 })}
        count={`${data.rows.length} of ${of}`}
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
              label="Currency"
              value={query.currency ?? "Any"}
              set={Boolean(query.currency)}
              items={[
                { key: "any", label: "Any currency", checked: !query.currency, onSelect: () => onQuery({ currency: null, page: 1 }) },
                { separator: true },
                ...data.currencies.map((code) => ({ key: code, label: code, checked: query.currency === code, onSelect: () => onQuery({ currency: code, page: 1 }) })),
              ]}
            />
          </>
        }
        filters={INVOICE_PERIODS.map((period) => ({ key: period, label: INVOICE_PERIOD_LABEL[period], checked: query.period === period, onSelect: () => onQuery({ period, page: 1 }) }))}
        end={<BkQuietTools onSort={() => onQuery({ sort: query.sort === "newest" ? "oldest" : "newest", page: 1 })} sortLabel={query.sort === "newest" ? "Sort" : "Oldest first"} exportHref={exportHref} />}
      />
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
              sum: { label: "Total", value: money(total, data.currency) },
              onClear: selection.clear,
              actions: (
                <>
                  <Button icon="whatsapp" busy={busy} disabled={busy} onClick={() => bulk.remind(selected)}>
                    Send reminders
                  </Button>
                  <MenuButton label="More" items={more}>
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
            <b>{filtered || query.view !== "all" ? "No invoice matches" : "No invoices yet"}</b>
            <p className="muted">{filtered || query.view !== "all" ? "Clear the search or the filters to see the rest." : "Write one with New invoice."}</p>
          </div>
        ) : (
          <table className="table" aria-label="Invoices">
            <colgroup>
              <col style={{ width: 44 }} />
              <col style={{ width: 120 }} />
              <col />
              <col style={{ width: 130 }} />
              <col style={{ width: 220 }} />
              <col style={{ width: 160 }} />
              <col style={{ width: 150 }} />
            </colgroup>
            <thead>
              <tr>
                <SelectCell head checked={selection.all} indeterminate={selection.some} onChange={selection.toggleAll} label="Select every row on this page" />
                <th>Invoice</th>
                <th>Customer</th>
                <th>State</th>
                <th>When</th>
                <th className="num">Total</th>
                <th className="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id} aria-selected={selection.isSelected(row.id) || undefined}>
                  <SelectCell checked={selection.isSelected(row.id)} onChange={() => selection.toggle(row.id)} label={`Select ${row.number}`} />
                  <td>
                    <Link className={row.state === "draft" ? "muted" : "ref"} href={`/books/invoices/${row.id}`}>
                      {row.number}
                    </Link>
                  </td>
                  <td>
                    <span className="cell-lead">
                      <Person name={row.customer.name} src={row.customer.image} />
                    </span>
                  </td>
                  <td>
                    <BkState tone={TONE[row.state]}>{row.stateLabel}</BkState>
                  </td>
                  <td>
                    {row.fiscalFailed ? <span style={{ color: "var(--color-danger)" }}>Not signed by FDMS</span> : <span className="muted">{row.when}</span>}
                  </td>
                  <td className="num muted">{money(row.total, row.currency)}</td>
                  {row.balance > 0 && row.state !== "draft" ? (
                    <td className="num" style={{ color: "var(--color-ink)", fontWeight: 500 }}>
                      {money(row.balance, row.currency)}
                    </td>
                  ) : (
                    <td className="num muted">—</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableShell>
    </div>
  );
}
