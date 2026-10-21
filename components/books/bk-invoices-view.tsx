"use client";

import * as React from "react";
import Link from "next/link";

import { Button, useSelection } from "@/components/core";
import { MenuButton, type MenuEntry, type MenuItem } from "@/components/core/menu";
import {
  INVOICE_DUE_LABEL,
  INVOICE_DUES,
  INVOICE_SOURCE_LABEL,
  INVOICE_SOURCES,
  INVOICE_TAB_LABEL,
  INVOICE_VIEWS,
  PAGE_SIZE,
  type InvoiceQuery,
  type InvoiceRow,
  type InvoicesView,
} from "@/lib/books/invoices";
import type { InvoiceState } from "@/lib/books/invoice-state";

import { Amt, BkFilter, BkPager, BkScroll, BkSelectionBar, BkTabs, BkTools, None, St, Worksheet, type BkTone, type WsColumn } from "./ui";

const STATE_TONE: Record<InvoiceState, BkTone> = { draft: "draft", sent: "info", "part-paid": "info", paid: "done", overdue: "warn", void: "void" };
const FDMS_TONE: Record<NonNullable<InvoiceRow["fdms"]>, BkTone> = { Valid: "done", Pending: "warn", Failed: "bad" };

/** What a selection can do, each row through its own route; the server checks every row. */
export type InvoiceBulk = {
  remind: (rows: InvoiceRow[]) => void;
  statements: (rows: InvoiceRow[]) => void;
  exportRows: (rows: InvoiceRow[]) => void;
  issue: (rows: InvoiceRow[]) => void;
  deleteDrafts: (rows: InvoiceRow[]) => void;
};

/**
 * Books → Sales → Invoices (bk-invoices): the tabs on their own row, the
 * filters on the row below, then one worksheet: the number, the customer,
 * issued, due, the state, FDMS, the total, the balance and the note, with the
 * page's totals. On the Books screens a selection sends reminders, prints
 * statements, exports or voids (`bulk`); without them a row only opens.
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
  /** Null without the Books screens: no selection. */
  bulk: InvoiceBulk | null;
  busy?: boolean;
  canIssue: boolean;
  canDeleteDrafts: boolean;
  /** Void and Delete permanently over the selection, as the person's role allows. */
  undoEntries: (rows: InvoiceRow[]) => MenuEntry[];
}) {
  const ids = React.useMemo(() => data.rows.map((row) => row.id), [data.rows]);
  const selection = useSelection(ids);
  const query = data.query;
  const selected = bulk ? data.rows.filter((row) => selection.isSelected(row.id)) : [];
  const drafts = selected.filter((row) => row.state === "draft");
  const customer = data.customers.find((option) => option.id === query.customer);
  const filtered = Boolean(query.q || query.customer || query.due !== "any" || query.source);
  const currency = data.currency;

  const undo = undoEntries(selected);
  const voidEntry = undo.find((entry): entry is MenuItem => "key" in entry && entry.action === "void");
  const more: MenuEntry[] = [
    ...(canIssue && drafts.length ? [{ key: "issue", icon: "send" as const, label: drafts.length === 1 ? "Issue 1 draft" : `Issue ${drafts.length} drafts`, onSelect: () => bulk?.issue(drafts) }] : []),
    ...(canDeleteDrafts && drafts.length ? [{ key: "delete-drafts", icon: "x" as const, danger: true, label: drafts.length === 1 ? "Delete 1 draft" : `Delete ${drafts.length} drafts`, onSelect: () => bulk?.deleteDrafts(drafts) }] : []),
    ...undo.filter((entry) => entry !== voidEntry),
  ];

  const columns: Array<WsColumn<InvoiceRow>> = [
    {
      key: "number",
      head: "Number",
      cell: (row) =>
        row.state === "draft" ? (
          <Link className="none" href={`/books/invoices/${row.id}`}>
            {row.number}
          </Link>
        ) : (
          <Link className="bkw-ref" href={`/books/invoices/${row.id}`}>
            {row.number}
          </Link>
        ),
    },
    { key: "customer", head: "Customer", cell: (row) => <span className="who">{row.customer.name}</span> },
    { key: "issued", head: "Issued", className: "muted", cell: (row) => row.issued ?? "—" },
    { key: "due", head: "Due", className: "muted", cell: (row) => row.due ?? "—" },
    { key: "state", head: "State", cell: (row) => <St tone={STATE_TONE[row.state]}>{row.stateLabel}</St> },
    { key: "fdms", head: "FDMS", cell: (row) => (row.fdms ? <St tone={FDMS_TONE[row.fdms]}>{row.fdms}</St> : <None />) },
    { key: "total", head: `Total, ${currency}`, right: true, cell: (row) => <Amt value={row.total} currency={row.currency} /> },
    {
      key: "balance",
      head: "Balance",
      right: true,
      cell: (row) => (row.balance > 0.005 && row.state !== "draft" && row.state !== "void" ? <Amt value={row.balance} currency={row.currency} /> : <None />),
    },
    { key: "note", head: "Note", className: "muted k-nt", cell: (row) => row.note },
  ];
  const totals = columns.map((column, index) =>
    index === 0 ? (
      <>
        <span className="mono">{data.rows.length}</span> of {data.range.of.toLocaleString("en-GB")}
      </>
    ) : column.key === "total" ? (
      <Amt value={data.sums.total} currency={currency} />
    ) : column.key === "balance" ? (
      <Amt value={data.sums.balance} currency={currency} />
    ) : null,
  );

  return (
    <>
      <BkTabs label="Invoices" value={query.view} onChange={(view) => onQuery({ view, page: 1 })} items={INVOICE_VIEWS.map((view) => ({ value: view, label: INVOICE_TAB_LABEL[view], count: data.counts[view] }))} />
      <BkTools
        find="Search invoices"
        query={query.q}
        onFind={(q) => onQuery({ q, page: 1 })}
        count={data.range.of}
        filters={
          <>
            <BkFilter
              label="Customer"
              value={customer?.name ?? "Any"}
              items={[
                { key: "any", label: "Any customer", checked: !query.customer, onSelect: () => onQuery({ customer: null, page: 1 }) },
                { separator: true },
                ...data.customers.map((option) => ({ key: option.id, label: option.name, checked: query.customer === option.id, onSelect: () => onQuery({ customer: option.id, page: 1 }) })),
              ]}
            />
            <BkFilter
              label="Due"
              value={INVOICE_DUE_LABEL[query.due]}
              items={INVOICE_DUES.map((due) => ({ key: due, label: INVOICE_DUE_LABEL[due], checked: query.due === due, onSelect: () => onQuery({ due, page: 1 }) }))}
            />
            <BkFilter
              label="Source"
              value={query.source ? INVOICE_SOURCE_LABEL[query.source] : "Books, CRM"}
              items={[
                { key: "any", label: "Books, CRM", checked: !query.source, onSelect: () => onQuery({ source: null, page: 1 }) },
                ...INVOICE_SOURCES.map((source) => ({ key: source, label: INVOICE_SOURCE_LABEL[source], checked: query.source === source, onSelect: () => onQuery({ source, page: 1 }) })),
              ]}
            />
          </>
        }
        end={
          <>
            <Button variant="quiet" icon="sort" onClick={() => onQuery({ sort: query.sort === "newest" ? "oldest" : "newest", page: 1 })}>
              {query.sort === "newest" ? "Sort" : "Oldest first"}
            </Button>
            <a className="btn" href={exportHref}>
              Export
            </a>
          </>
        }
      />
      <BkScroll>
        <Worksheet
          label="invoices"
          rows={data.rows}
          rowKey={(row) => row.id}
          columns={columns}
          openHref={(row) => `/books/invoices/${row.id}`}
          selection={bulk ? { ...selection, selected: selection.selected, labelOf: (row) => row.number } : undefined}
          totals={totals}
          empty={filtered ? "No invoice matches. Clear the search or the filters." : query.view === "all" ? "No invoices yet." : `No ${INVOICE_TAB_LABEL[query.view].toLowerCase()} invoices.`}
        />
      </BkScroll>
      <BkPager page={query.page} size={PAGE_SIZE} total={data.range.of} onPage={(page) => onQuery({ page })} />
      {bulk ? (
        <BkSelectionBar count={selected.length} sum={<>Owing <Amt value={selected.reduce((total, row) => total + row.balance, 0)} currency={currency} /></>} onClear={selection.clear}>
          <Button icon="whatsapp" shortcut="S" busy={busy} disabled={busy} onClick={() => bulk.remind(selected)}>
            Send reminders
          </Button>
          <Button icon="print" onClick={() => bulk.statements(selected)}>
            Print statements
          </Button>
          <Button icon="export" onClick={() => bulk.exportRows(selected)}>
            Export
          </Button>
          {voidEntry ? (
            <Button icon="history" data-action="void" disabled={voidEntry.disabled} title={voidEntry.title} onClick={voidEntry.onSelect}>
              Void
            </Button>
          ) : null}
          {more.length ? (
            <MenuButton label="More" items={more}>
              More
            </MenuButton>
          ) : null}
        </BkSelectionBar>
      ) : null}
    </>
  );
}
