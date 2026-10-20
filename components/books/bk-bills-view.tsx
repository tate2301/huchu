"use client";

import * as React from "react";
import Link from "next/link";

import { Button, SelectCell, TableFoot, TableShell, useSelection } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { BILL_TAB_LABEL, BILL_VIEWS, FDMS_LABEL, type BillQuery, type BillRow, type BillsView } from "@/lib/books/bills";
import { money } from "@/lib/books/format";
import { PERIOD_LABEL, PERIODS } from "@/lib/books/period";

import { BkChip, BkQuietTools, BkState, BkTabs, BkTools } from "./bk-list";
import { BooksFinding } from "./figures";

const FDMS_TONE = { VALID: "success", NOT_CHECKED: "warning", NOT_VALID: "danger" } as const;

/**
 * Books → Bills & spending → Bills (design/core-modules/boards/view/BkBills.html):
 * what is owed and by when, the tabs, the search with Supplier and FDMS, and
 * six columns: the bill, the supplier and what it was for, its FDMS check, the
 * order and goods receipt it matches, when it is due and its balance. Selecting
 * bills offers Pay (one supplier's open bills) and More.
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
  const { from, to, of } = data.range;
  const filtered = Boolean(query.q || query.supplier || query.fdms || query.period !== "any");

  return (
    <div className="bk">
      <BooksFinding finding={data.finding} />
      <BkTabs
        label="Bill views"
        value={query.view}
        onChange={(view) => onQuery({ view, page: 1 })}
        items={BILL_VIEWS.map((view) => ({ value: view, label: BILL_TAB_LABEL[view], count: data.counts[view] }))}
      />
      <BkTools
        find="Search bills"
        query={query.q}
        onFind={(q) => onQuery({ q, page: 1 })}
        count={notes ? `${of.toLocaleString("en-GB")} ${of === 1 ? "debit note" : "debit notes"}` : `${of.toLocaleString("en-GB")} ${BILL_TAB_LABEL[query.view].toLowerCase()}`}
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
              label="FDMS"
              value={query.fdms ? FDMS_LABEL[query.fdms] : "Any"}
              set={Boolean(query.fdms)}
              items={[
                { key: "any", label: "Any", checked: !query.fdms, onSelect: () => onQuery({ fdms: null, page: 1 }) },
                { separator: true },
                ...(["VALID", "NOT_CHECKED", "NOT_VALID"] as const).map((status) => ({ key: status, label: FDMS_LABEL[status], checked: query.fdms === status, onSelect: () => onQuery({ fdms: status, page: 1 }) })),
              ]}
            />
          </>
        }
        filters={PERIODS.map((period) => ({ key: period, label: PERIOD_LABEL[period], checked: query.period === period, onSelect: () => onQuery({ period, page: 1 }) }))}
        end={<BkQuietTools onSort={() => onQuery({ sort: query.sort === "due" ? "newest" : "due", page: 1 })} sortLabel={query.sort === "due" ? "Sort" : "Newest first"} exportHref={exportHref} />}
      />
      <TableShell
        label="Bills"
        foot={
          <TableFoot
            range={of === 0 ? "None" : `${from} to ${to} of ${of}`}
            sums={[
              { label: "To pay", value: money(data.toPay, data.currency) },
              { label: "Due by Sunday", value: money(data.dueBySunday, data.currency) },
            ]}
            page={{
              onPrevious: query.page > 1 ? () => onQuery({ page: query.page - 1 }) : undefined,
              onNext: to < of ? () => onQuery({ page: query.page + 1 }) : undefined,
            }}
            selection={{
              count: selected.length,
              sum: { label: "Owing", value: money(selected.reduce((sum, row) => sum + row.balance, 0), data.currency) },
              onClear: selection.clear,
              actions: (
                <>
                  <Button icon="payments" disabled={!payable.length || !oneSupplier} title={!payable.length ? "None of these is owing." : !oneSupplier ? "Pay one supplier's bills at a time." : undefined} onClick={() => onPay(payable)}>
                    Pay
                  </Button>
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
            <b>{filtered ? "No bill matches" : notes ? "No debit notes" : query.view === "to-pay" ? "Nothing to pay" : `No ${BILL_TAB_LABEL[query.view].toLowerCase()} bills`}</b>
            <p className="muted">{filtered ? "Clear the search or the filters to see the rest." : query.view === "to-pay" ? "Record a supplier's bill with New bill, or finish one from a goods receipt." : "Bills land here as they move."}</p>
          </div>
        ) : (
          <table className="table" aria-label="Bills">
            <colgroup>
              <col style={{ width: 44 }} />
              <col style={{ width: 120 }} />
              <col />
              <col style={{ width: 140 }} />
              <col style={{ width: 220 }} />
              <col style={{ width: 160 }} />
              <col style={{ width: 140 }} />
            </colgroup>
            <thead>
              <tr>
                <SelectCell head checked={selection.all} indeterminate={selection.some} onChange={selection.toggleAll} label="Select every row on this page" />
                <th>{notes ? "Debit note" : "Bill"}</th>
                <th>Supplier</th>
                <th>FDMS</th>
                <th>Matches</th>
                <th>Due</th>
                <th className="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id} aria-selected={selection.isSelected(row.id) || undefined}>
                  <SelectCell checked={selection.isSelected(row.id)} onChange={() => selection.toggle(row.id)} label={`Select ${row.number}`} />
                  <td>
                    <Link className="ref" href={row.href}>
                      {row.number}
                    </Link>
                  </td>
                  <td className="truncate">
                    <span style={{ color: "var(--color-ink)" }}>{row.supplier.name}</span>
                    {row.what ? (
                      <span className="muted" style={{ fontSize: 13 }}>
                        {" "}
                        · {row.what}
                      </span>
                    ) : null}
                  </td>
                  <td>{row.fdms ? <BkState tone={FDMS_TONE[row.fdms]}>{FDMS_LABEL[row.fdms]}</BkState> : <span className="muted">—</span>}</td>
                  <td className="truncate">
                    {row.matches.bill ? (
                      <span className="ref">{row.matches.bill}</span>
                    ) : row.matches.order || row.matches.receipt ? (
                      <>
                        {row.matches.order ? <span className="ref">{row.matches.order}</span> : null}
                        {row.matches.order && row.matches.receipt ? " · " : null}
                        {row.matches.receipt ? <span className="ref">{row.matches.receipt}</span> : null}
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>{row.state === "overdue" ? <BkState tone="warning">{row.when}</BkState> : <span className="muted">{row.when}</span>}</td>
                  <td className="num" style={row.state === "void" ? { textDecoration: "line-through", color: "var(--color-muted)" } : { color: "var(--color-ink)", fontWeight: 500 }}>
                    {money(row.state === "void" || row.state === "paid" ? row.total : row.balance, row.currency)}
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
