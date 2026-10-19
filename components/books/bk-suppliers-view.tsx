"use client";

import * as React from "react";
import Link from "next/link";

import { Button, SelectCell, TableFoot, TableShell, useSelection } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { money } from "@/lib/books/format";
import { SUPPLIER_TAB_LABEL, SUPPLIER_VIEWS, type SupplierQuery, type SupplierRow, type SuppliersPage } from "@/lib/books/suppliers";

import { BkChip, BkQuietTools, BkTabs, BkTools } from "./bk-list";
import { BooksFinding } from "./figures";

const cell = (n: number, currency: string) => (Math.abs(n) >= 0.005 ? money(n, currency) : <span className="muted">—</span>);

/**
 * Books → Bills & spending → Suppliers (design/core-modules/boards/view/BkSuppliers.html):
 * whom the business owes and how late, what each was paid this year; By age
 * from the payables sub-ledger; the write-offs. A selection pays one supplier
 * or exports. Each supplier's ITF263 (D17) and what was withheld from them.
 */
export function BkSuppliersView({
  data,
  onQuery,
  exportHref,
  onPay,
  more,
}: {
  data: SuppliersPage;
  onQuery: (next: Partial<SupplierQuery>) => void;
  exportHref: string;
  onPay: (row: SupplierRow) => void;
  more: (rows: SupplierRow[]) => MenuEntry[];
}) {
  const query = data.query;
  const ids = React.useMemo(() => data.rows.map((row) => row.id), [data.rows]);
  const selection = useSelection(ids);
  const selected = data.rows.filter((row) => selection.isSelected(row.id));
  const { from, to, of } = data.range;
  const c = data.currency;
  const currencies = ["USD", "ZWG"];

  return (
    <div className="bk">
      <BooksFinding finding={data.finding} />
      <BkTabs label="Supplier views" value={query.view} onChange={(view) => onQuery({ view, page: 1 })} items={SUPPLIER_VIEWS.map((view) => ({ value: view, label: SUPPLIER_TAB_LABEL[view], count: view === "by-age" ? undefined : data.counts[view] }))} />
      <BkTools
        find="Search suppliers"
        query={query.q}
        onFind={(q) => onQuery({ q, page: 1 })}
        count={query.view === "write-offs" ? `${of} ${of === 1 ? "write-off" : "write-offs"}` : `${of} of ${data.counts.all}`}
        chips={
          <>
          <BkChip
            label="ITF263"
            value={query.itf === "valid" ? "Valid" : query.itf === "missing" ? "Missing" : "Any"}
            set={query.itf !== "any"}
            items={[
              { key: "any", label: "Any", checked: query.itf === "any", onSelect: () => onQuery({ itf: "any", page: 1 }) },
              { key: "valid", label: "Valid", checked: query.itf === "valid", onSelect: () => onQuery({ itf: "valid", page: 1 }) },
              { key: "missing", label: "Missing or expired", checked: query.itf === "missing", onSelect: () => onQuery({ itf: "missing", page: 1 }) },
            ]}
          />
          <BkChip
            label="Currency"
            value={query.currency ? (query.currency === "ZWG" ? "ZiG" : query.currency) : "Any"}
            set={Boolean(query.currency)}
            items={[
              { key: "any", label: "Any", checked: !query.currency, onSelect: () => onQuery({ currency: null, page: 1 }) },
              { separator: true },
              ...currencies.map((code) => ({ key: code, label: code === "ZWG" ? "ZiG" : code, checked: query.currency === code, onSelect: () => onQuery({ currency: code, page: 1 }) })),
            ]}
          />
          </>
        }
        filters={[
          { key: "owed", label: "Most owed first", checked: query.sort === "owed", onSelect: () => onQuery({ sort: "owed", page: 1 }) },
          { key: "name", label: "By name", checked: query.sort === "name", onSelect: () => onQuery({ sort: "name", page: 1 }) },
        ]}
        end={<BkQuietTools onSort={() => onQuery({ sort: query.sort === "owed" ? "name" : "owed", page: 1 })} sortLabel={query.sort === "owed" ? "Sort" : "By name"} exportHref={exportHref} />}
      />
      <TableShell
        label="Suppliers"
        foot={
          <TableFoot
            range={of === 0 ? "None" : `${from} to ${to} of ${of}`}
            sums={[
              { label: "We owe", value: money(data.sums.owed, c) },
              { label: "Overdue", value: money(data.sums.overdue, c) },
              { label: "Withheld this year", value: money(data.sums.withheld, c) },
            ]}
            page={
              query.view === "by-age"
                ? undefined
                : {
                    onPrevious: query.page > 1 ? () => onQuery({ page: query.page - 1 }) : undefined,
                    onNext: to < of ? () => onQuery({ page: query.page + 1 }) : undefined,
                  }
            }
            selection={
              query.view === "all" || query.view === "owed" || query.view === "missing-itf263"
                ? {
                    count: selected.length,
                    sum: { label: "We owe", value: money(selected.reduce((sum, row) => sum + row.owed, 0), c) },
                    onClear: selection.clear,
                    actions: (
                      <>
                        <Button icon="payments" disabled={selected.length !== 1 || selected[0].owed <= 0.005} title={selected.length !== 1 ? "Pay one supplier at a time." : undefined} onClick={() => onPay(selected[0])}>
                          Pay
                        </Button>
                        <MenuButton label="More" items={more(selected)}>
                          More
                        </MenuButton>
                      </>
                    ),
                  }
                : undefined
            }
          />
        }
      >
        {query.view === "by-age" ? (
          data.ages.length === 0 ? (
            <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
              <b>Nothing is owed</b>
              <p className="muted">Recorded bills land here, aged from their date, until they are paid.</p>
            </div>
          ) : (
            <table className="table" aria-label="Suppliers by age">
              <colgroup>
                <col />
                <col style={{ width: 130 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 140 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th className="num">Up to 30 days</th>
                  <th className="num">31 to 60</th>
                  <th className="num">61 to 90</th>
                  <th className="num">Over 90</th>
                  <th className="num">We owe</th>
                </tr>
              </thead>
              <tbody>
                {data.ages.map((row) => (
                  <tr key={row.id}>
                    <td className="truncate">
                      <Link href={`/books/suppliers/${row.id}`}>{row.name}</Link>
                    </td>
                    <td className="num muted">{cell(row.current, c)}</td>
                    <td className="num">{cell(row.days30, c)}</td>
                    <td className="num">{cell(row.days60, c)}</td>
                    <td className="num">{cell(row.days90 + row.over90, c)}</td>
                    <td className="num" style={{ color: "var(--color-ink)", fontWeight: 500 }}>
                      {money(row.total, c)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : query.view === "write-offs" ? (
          data.writeOffs.length === 0 ? (
            <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
              <b>No write-offs</b>
              <p className="muted">What is left on a bill and agreed with the supplier is written off from the bill.</p>
            </div>
          ) : (
            <table className="table" aria-label="Write-offs">
              <colgroup>
                <col style={{ width: 130 }} />
                <col style={{ width: 220 }} />
                <col style={{ width: 120 }} />
                <col />
                <col style={{ width: 90 }} />
                <col style={{ width: 130 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Write-off</th>
                  <th>Supplier</th>
                  <th>Bill</th>
                  <th>Why</th>
                  <th>Date</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.writeOffs.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className="ref">{row.number}</span>
                    </td>
                    <td className="truncate">
                      <Link href={`/books/suppliers/${row.supplier.id}`}>{row.supplier.name}</Link>
                    </td>
                    <td>
                      <Link className="ref" href={`/books/bills/${row.bill.id}`}>
                        {row.bill.number}
                      </Link>
                    </td>
                    <td className="fill truncate muted">{row.reason ?? "—"}</td>
                    <td className="muted">{row.date}</td>
                    <td className="num" style={row.voided ? { textDecoration: "line-through", color: "var(--color-muted)" } : undefined}>
                      {money(row.amount, c)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : data.rows.length === 0 ? (
          <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
            <b>{query.q ? "No supplier matches" : query.view === "owed" ? "You owe nobody" : "No suppliers yet"}</b>
            <p className="muted">{query.q ? "Clear the search to see the rest." : "Add one with New supplier, or as you record a bill."}</p>
          </div>
        ) : (
          <table className="table" aria-label="Suppliers">
            <colgroup>
              <col style={{ width: 44 }} />
              <col />
              <col style={{ width: 230 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 130 }} />
            </colgroup>
            <thead>
              <tr>
                <SelectCell head checked={selection.all} indeterminate={selection.some} onChange={selection.toggleAll} label="Select every row on this page" />
                <th>Supplier</th>
                <th>ITF263</th>
                <th className="num">We owe</th>
                <th className="num">Overdue</th>
                <th className="num">Paid this year</th>
                <th className="num">Withheld</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id} aria-selected={selection.isSelected(row.id) || undefined}>
                  <SelectCell checked={selection.isSelected(row.id)} onChange={() => selection.toggle(row.id)} label={`Select ${row.name}`} />
                  <td className="truncate">
                    <Link href={`/books/suppliers/${row.id}`} style={{ color: "var(--color-ink)" }}>
                      {row.name}
                    </Link>
                  </td>
                  <td className="truncate">
                    {row.itf263.state === "Valid" ? (
                      <span className="status status-success">{row.itf263.label}</span>
                    ) : (
                      <span className="status status-warning" style={{ color: "var(--color-ink)", fontWeight: 500 }}>
                        {row.itf263.label}
                      </span>
                    )}
                  </td>
                  <td className="num">{cell(row.owed, c)}</td>
                  <td className="num">{row.overdue > 0.005 ? <b>{cell(row.overdue, c)}</b> : cell(row.overdue, c)}</td>
                  <td className="num muted">{cell(row.paidYear, c)}</td>
                  <td className="num">{cell(row.withheld, c)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableShell>
    </div>
  );
}
