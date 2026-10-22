"use client";

import * as React from "react";
import Link from "next/link";

import { Button, useSelection } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { BILL_TAB_LABEL, BILL_VIEWS, BILLS_PAGE_SIZE, FDMS_LABEL, type BillQuery, type BillRow, type BillsView } from "@/lib/books/bills";
import { PERIOD_LABEL, PERIODS } from "@/lib/books/period";

import { Amt, BkFilter, BkNote, BkPager, BkScroll, BkSelectionBar, BkTabs, BkTools, None, St, Worksheet, type BkTone, type WsColumn } from "./ui";

const FDMS_TONE: Record<NonNullable<BillRow["fdms"]>, BkTone> = { VALID: "done", NOT_CHECKED: "warn", NOT_VALID: "bad" };

/** A bill's state as bk-bills writes it: recorded and owing is "Recorded"; late is "Overdue". */
const STATE: Record<BillRow["state"], { label: string; tone: BkTone }> = {
  "to-pay": { label: "Recorded", tone: "info" },
  "part-paid": { label: "Part paid", tone: "info" },
  overdue: { label: "Overdue", tone: "warn" },
  paid: { label: "Paid", tone: "done" },
  draft: { label: "Draft", tone: "draft" },
  void: { label: "Void", tone: "void" },
};

/**
 * Books → Bills & spending → Bills (bk-bills): the tabs on their own row, the
 * filters on the row below, then one worksheet: the bill, the supplier, their
 * FTI and its FDMS check, dated, due, its state, the total and what is still
 * owed, with the page's totals. A selection pays one supplier's bills or does
 * More. A bill not checked on FDMS is the one warning, with Check on FDMS.
 */
export function BkBillsView({
  data,
  onQuery,
  exportHref,
  onPay,
  more,
}: {
  data: BillsView;
  onQuery: (next: Partial<BillQuery>) => void;
  exportHref: string;
  onPay: (rows: BillRow[]) => void;
  more: (rows: BillRow[]) => MenuEntry[];
}) {
  const ids = React.useMemo(() => data.rows.map((row) => row.id), [data.rows]);
  const selection = useSelection(ids);
  const query = data.query;
  const selected = data.rows.filter((row) => selection.isSelected(row.id));
  const payable = selected.filter((row) => (row.state === "to-pay" || row.state === "overdue" || row.state === "part-paid") && row.balance > 0.005);
  const oneSupplier = new Set(payable.map((row) => row.supplier.id)).size === 1;
  const supplier = data.suppliers.find((option) => option.id === query.supplier);
  const notes = query.view === "debit-notes";
  const filtered = Boolean(query.q || query.supplier || query.fdms || query.period !== "any");
  const unchecked = data.rows.find((row) => row.fdms === "NOT_CHECKED" && row.state !== "void" && row.state !== "draft");
  const currency = data.currency;

  const columns: Array<WsColumn<BillRow>> = [
    {
      key: "number",
      head: notes ? "Debit note" : "Number",
      cell: (row) => (
        <Link className="bkw-ref" href={row.href}>
          {row.number}
        </Link>
      ),
    },
    { key: "supplier", head: "Supplier", cell: (row) => <span className="who">{row.supplier.name}</span> },
    notes
      ? { key: "bill", head: "Bill", cell: (row) => (row.matches.bill ? <span className="bkw-ref">{row.matches.bill}</span> : <None />) }
      : { key: "fti", head: "Their FTI", className: "mono k-fti", cell: (row) => row.fti ?? <None /> },
    ...(notes ? [] : [{ key: "fdms", head: "FDMS", cell: (row: BillRow) => (row.fdms ? <St tone={FDMS_TONE[row.fdms]}>{row.fdms === "VALID" ? "Valid" : FDMS_LABEL[row.fdms]}</St> : <None />) }]),
    { key: "dated", head: "Dated", className: "muted", cell: (row) => row.dated },
    { key: "due", head: "Due", className: "muted", cell: (row) => row.due ?? <None /> },
    { key: "state", head: "State", cell: (row) => <St tone={STATE[row.state].tone}>{notes ? row.stateLabel : STATE[row.state].label}</St> },
    { key: "total", head: `Total, ${currency}`, right: true, cell: (row) => <Amt value={row.total} currency={row.currency === currency ? null : row.currency} /> },
    { key: "balance", head: "Balance", right: true, cell: (row) => (row.balance > 0.005 && row.state !== "void" ? <Amt value={row.balance} currency={row.currency === currency ? null : row.currency} /> : <None />) },
  ];
  const sum = (pick: (row: BillRow) => number) => data.rows.filter((row) => row.currency === currency && row.state !== "void").reduce((total, row) => total + pick(row), 0);
  const totals = columns.map((column, index) =>
    index === 0 ? `${data.rows.length} ${notes ? "debit notes" : data.rows.length === 1 ? "bill" : "bills"}` : column.key === "total" ? <Amt value={sum((row) => row.total)} currency={null} /> : column.key === "balance" ? <Amt value={sum((row) => row.balance)} currency={null} /> : null,
  );

  return (
    <>
      <BkTabs label="Bills" value={query.view} onChange={(view) => onQuery({ view, page: 1 })} items={BILL_VIEWS.map((view) => ({ value: view, label: BILL_TAB_LABEL[view], count: data.counts[view] }))} />
      <BkTools
        find="Search bills"
        query={query.q}
        onFind={(q) => onQuery({ q, page: 1 })}
        count={data.range.of}
        filters={
          <>
            <BkFilter
              label="Supplier"
              value={supplier?.name ?? "Any"}
              items={[
                { key: "any", label: "Any supplier", checked: !query.supplier, onSelect: () => onQuery({ supplier: null, page: 1 }) },
                { separator: true },
                ...data.suppliers.map((option) => ({ key: option.id, label: option.name, checked: query.supplier === option.id, onSelect: () => onQuery({ supplier: option.id, page: 1 }) })),
              ]}
            />
            <BkFilter
              label="FDMS"
              value={query.fdms ? FDMS_LABEL[query.fdms] : "Any"}
              items={[
                { key: "any", label: "Any", checked: !query.fdms, onSelect: () => onQuery({ fdms: null, page: 1 }) },
                { separator: true },
                ...(["VALID", "NOT_CHECKED", "NOT_VALID"] as const).map((status) => ({ key: status, label: FDMS_LABEL[status], checked: query.fdms === status, onSelect: () => onQuery({ fdms: status, page: 1 }) })),
              ]}
            />
            <BkFilter
              label="Due"
              value={query.period === "any" ? "Any" : PERIOD_LABEL[query.period]}
              items={PERIODS.map((period) => ({ key: period, label: PERIOD_LABEL[period], checked: query.period === period, onSelect: () => onQuery({ period, page: 1 }) }))}
            />
          </>
        }
        end={
          <>
            <Button variant="quiet" icon="sort" onClick={() => onQuery({ sort: query.sort === "due" ? "newest" : "due", page: 1 })}>
              {query.sort === "due" ? "Sort" : "Newest first"}
            </Button>
            <a className="btn" href={exportHref}>
              Export
            </a>
          </>
        }
      />
      <BkScroll>
        <Worksheet
          label="bills"
          rows={data.rows}
          rowKey={(row) => row.id}
          columns={columns}
          openHref={(row) => row.href}
          selection={{ ...selection, selected: selection.selected, labelOf: (row) => row.number }}
          totals={totals}
          empty={filtered ? "No bill matches. Clear the search or the filters." : notes ? "No debit notes." : query.view === "to-pay" ? "Nothing to pay." : `No ${BILL_TAB_LABEL[query.view].toLowerCase()} bills.`}
        />
        {unchecked ? (
          <BkNote
            tone="warn"
            action={
              <Link className="btn" href={unchecked.href}>
                Check on FDMS
              </Link>
            }
          >
            <b>{unchecked.number} isn&rsquo;t checked on FDMS.</b> Its VAT is claimed only once ZIMRA shows the FTI as valid.
          </BkNote>
        ) : null}
      </BkScroll>
      <BkPager page={query.page} size={BILLS_PAGE_SIZE} total={data.range.of} onPage={(page) => onQuery({ page })} />
      <BkSelectionBar count={selected.length} sum={<>Owing <Amt value={selected.reduce((total, row) => total + row.balance, 0)} currency={currency} /></>} onClear={selection.clear}>
        <Button icon="payments" disabled={!payable.length || !oneSupplier} title={!payable.length ? "None of these is owing." : !oneSupplier ? "Pay one supplier's bills at a time." : undefined} onClick={() => onPay(payable)}>
          Pay
        </Button>
        <MenuButton label="More" items={more(selected)}>
          More
        </MenuButton>
      </BkSelectionBar>
    </>
  );
}
