"use client";

import * as React from "react";
import Link from "next/link";

import { Button, SelectCell, TableFoot, TableShell, useSelection } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { money } from "@/lib/books/format";
import { SUPPLIER_TAB_LABEL, SUPPLIER_VIEWS, type SupplierQuery, type SupplierRow, type SuppliersPage } from "@/lib/books/suppliers";

import { BkChip, BkQuietTools, BkTabs, BkTools, useBkLayout } from "./bk-list";
import { Cents } from "./figures";

const cell = (n: number, currency: string) => (Math.abs(n) >= 0.005 ? <Cents value={n} currency={currency} /> : <span className="none muted">—</span>);

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
  const source = React.useMemo(() => data.rows, [data.rows]);
  const selection = useSelection(ids);
  const layout = useBkLayout(
    "suppliers",
    [
      { key: "vat", label: "VAT number", nth: 3 },
      { key: "itf", label: "ITF263", nth: 4 },
      { key: "expires", label: "Expires", nth: 5 },
      { key: "paid", label: "Paid this year", nth: 6 },
      { key: "withheld", label: "Withheld this year", nth: 7 },
    ],
    [
      { key: "vat", label: "VAT registered", by: (row: SupplierRow) => (row.vatNumber ? "VAT registered" : "Not VAT registered") },
      { key: "itf", label: "ITF263", by: (row: SupplierRow) => (row.itf263.state === "Valid" ? "On file" : row.itf263.state === "Expired" ? "Expired" : "Missing") },
    ],
    source,
  );
  const selected = data.rows.filter((row) => selection.isSelected(row.id));
  const { from, to, of } = data.range;
  const c = data.currency;
  const currencies = ["USD", "ZWG"];
  const listing = query.view === "all" || query.view === "owed" || query.view === "missing-itf263";
  const paged = of > data.rows.length || query.page > 1;
  const page = {
    onPrevious: query.page > 1 ? () => onQuery({ page: query.page - 1 }) : undefined,
    onNext: to < of ? () => onQuery({ page: query.page + 1 }) : undefined,
  };
  const foot =
    listing && (selected.length > 0 || paged) ? (
      <TableFoot
        range={of === 0 ? "None" : `${from} to ${to} of ${of}`}
        page={paged ? page : undefined}
        selection={{
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
        }}
      />
    ) : undefined;

  return (
    <div className="bk">
      <BkTabs label="Supplier views" value={query.view} onChange={(view) => onQuery({ view, page: 1 })} items={SUPPLIER_VIEWS.map((view) => ({ value: view, label: SUPPLIER_TAB_LABEL[view], count: data.counts[view] }))} />
      <BkTools
        find="Search suppliers"
        query={query.q}
        onFind={(q) => onQuery({ q, page: 1 })}
        count={`${of}`}
        chips={
          <BkChip
            label="VAT registered"
            value={query.vat === "yes" ? "Yes" : query.vat === "no" ? "No" : "Any"}
            set={query.vat !== "any"}
            items={[
              { key: "any", label: "Any", checked: query.vat === "any", onSelect: () => onQuery({ vat: "any", page: 1 }) },
              { key: "yes", label: "Yes", checked: query.vat === "yes", onSelect: () => onQuery({ vat: "yes", page: 1 }) },
              { key: "no", label: "No", checked: query.vat === "no", onSelect: () => onQuery({ vat: "no", page: 1 }) },
            ]}
          />
        }
        filters={[
          { key: "itf-any", label: "Any ITF263", checked: query.itf === "any", onSelect: () => onQuery({ itf: "any", page: 1 }) },
          { key: "itf-valid", label: "ITF263 valid", checked: query.itf === "valid", onSelect: () => onQuery({ itf: "valid", page: 1 }) },
          { key: "itf-missing", label: "ITF263 missing or expired", checked: query.itf === "missing", onSelect: () => onQuery({ itf: "missing", page: 1 }) },
          { separator: true },
          { key: "cur-any", label: "Any currency", checked: !query.currency, onSelect: () => onQuery({ currency: null, page: 1 }) },
          ...currencies.map((code) => ({ key: `cur-${code}`, label: code, checked: query.currency === code, onSelect: () => onQuery({ currency: code, page: 1 }) })),
        ]}
        end={<BkQuietTools middle={listing ? layout.tools : undefined} onSort={() => onQuery({ sort: query.sort === "owed" ? "name" : "owed", page: 1 })} sortLabel={query.sort === "owed" ? "Sort" : "By name"} exportHref={exportHref} />}
      />
      <div className={listing ? layout.wrap : undefined} style={{ display: "contents" }}>
        {listing ? layout.style : null}
        <TableShell label="Suppliers" foot={foot}>
        {query.view === "by-age" ? (
          data.ages.length === 0 ? (
            <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
              <b>Nothing is owed</b>
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
          </div>
        ) : (
          <table className="table" aria-label="Suppliers">
            <colgroup>
              <col style={{ width: 44 }} />
              <col />
              <col style={{ width: 140 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 170 }} />
              <col style={{ width: 140 }} />
            </colgroup>
            <thead>
              <tr>
                <SelectCell head checked={selection.all} indeterminate={selection.some} onChange={selection.toggleAll} label="Select every row on this page" />
                <th>Supplier</th>
                <th>VAT number</th>
                <th>ITF263</th>
                <th>Expires</th>
                <th className="num">Paid this year</th>
                <th className="num">Withheld this year</th>
                <th className="num">We owe, {c}</th>
              </tr>
            </thead>
            <tbody>
              {layout.rows((row) => (
                <tr key={row.id} aria-selected={selection.isSelected(row.id) || undefined}>
                  <SelectCell checked={selection.isSelected(row.id)} onChange={() => selection.toggle(row.id)} label={`Select ${row.name}`} />
                  <td className="truncate">
                    {row.code ? <span className="ref">{row.code}</span> : null} <Link href={`/books/suppliers/${row.id}`} style={{ color: "var(--color-ink)" }}>{row.name}</Link>
                  </td>
                  <td className="mono">{row.vatNumber ?? <span className="muted">—</span>}</td>
                  <td>
                    {row.itf263.state === "Valid" ? (
                      <span className="status status-success">On file</span>
                    ) : (
                      <span className="status status-warning" style={{ color: "var(--color-ink)", fontWeight: 500 }}>
                        {row.itf263.state === "Expired" ? "Expired" : "Missing"}
                      </span>
                    )}
                  </td>
                  <td className="muted">{row.itf263.expires ?? "—"}</td>
                  <td className="num">{cell(row.paidYear, c)}</td>
                  <td className="num">{cell(row.withheld, c)}</td>
                  <td className="num">{cell(row.owed, c)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        </TableShell>
      </div>
    </div>
  );
}
