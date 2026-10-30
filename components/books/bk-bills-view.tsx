"use client";

import * as React from "react";
import Link from "next/link";

import { Button, SelectCell, TableFoot, TableShell, useSelection } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { BILL_DUE_LABEL, BILL_DUES, BILL_TAB_LABEL, BILL_VIEWS, BILLS_PAGE_SIZE, FDMS_LABEL } from "@/lib/books/bills-labels";
import type { BillQuery, BillRow, BillsView } from "@/lib/books/bills";
import { count, money } from "@/lib/books/format";

import { BkChip, BkQuietTools, BkState, BkTabs, BkTools, useBkLayout } from "./bk-list";
import { Callout } from "./bk-record";
import { Cents } from "./figures";

const FDMS_TONE = { VALID: "success", NOT_CHECKED: "warning", NOT_VALID: "danger" } as const;
const STATE_TONE: Record<BillRow["state"], Parameters<typeof BkState>[0]["tone"]> = { draft: "plain", "to-pay": "info", "part-paid": "info", paid: "success", overdue: "warning", void: "void" };

/**
 * Books → Bills & spending → Bills (design/core-modules/boards/view/BkBills.html):
 * the tabs, the search with Supplier, FDMS and Due, and ten columns: the bill,
 * the supplier, their fiscal invoice and its FDMS check, when it was dated and
 * falls due, its state, its total and what is left. One line says when a bill
 * is not checked on FDMS. Selecting bills offers Pay (one supplier's open
 * bills) and More.
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
  const source = React.useMemo(() => data.rows, [data.rows]);
  const layout = useBkLayout(
    "bills",
    [{ key: "fti", label: "Their FTI", nth: 4 }, { key: "fdms", label: "FDMS", nth: 5 }, { key: "dated", label: "Dated", nth: 6 }, { key: "due", label: "Due", nth: 7 }, { key: "state", label: "State", nth: 8 }, { key: "balance", label: "Balance", nth: 10 }],
    [{ key: "supplier", label: "Supplier", by: (row) => row.supplier.name }, { key: "state", label: "State", by: (row) => row.stateLabel }, { key: "fdms", label: "FDMS", by: (row) => (row.fdms ? FDMS_LABEL[row.fdms] : "Not applicable") }],
    source,
  );
  const selection = useSelection(ids);
  const query = data.query;
  const selected = data.rows.filter((row) => selection.isSelected(row.id));
  const payable = selected.filter((row) => (row.state === "to-pay" || row.state === "overdue" || row.state === "part-paid") && row.balance > 0.005);
  const oneSupplier = new Set(payable.map((row) => row.supplier.id)).size === 1;
  const supplier = data.suppliers.find((option) => option.id === query.supplier);
  const { from, to, of } = data.range;
  const filtered = Boolean(query.q || query.supplier || query.fdms || query.due !== "any");
  const here = data.rows.filter((row) => row.currency === data.currency);
  const totalHere = here.reduce((sum, row) => sum + row.total, 0);
  const balanceHere = here.reduce((sum, row) => sum + (row.state === "void" ? 0 : row.balance), 0);
  const unchecked = data.rows.filter((row) => row.fdms === "NOT_CHECKED" && row.vat > 0.005 && row.state !== "void" && row.state !== "paid");
  const uncheckedVat = unchecked.filter((row) => row.currency === data.currency).reduce((sum, row) => sum + row.vat, 0);
  const paged = of > BILLS_PAGE_SIZE;

  return (
    <div className="bk">
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
        count={of.toLocaleString("en-GB")}
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
            <BkChip
              label="Due"
              value={BILL_DUE_LABEL[query.due]}
              set={query.due !== "any"}
              items={BILL_DUES.map((due) => ({ key: due, label: BILL_DUE_LABEL[due], checked: query.due === due, onSelect: () => onQuery({ due, page: 1 }) }))}
            />
          </>
        }
        filters={[{ key: "clear", label: "Clear filters", disabled: !filtered, onSelect: () => onQuery({ q: "", supplier: null, fdms: null, due: "any", page: 1 }) }]}
        end={<BkQuietTools middle={layout.tools} onSort={() => onQuery({ sort: query.sort === "due" ? "newest" : "due", page: 1 })} sortLabel={query.sort === "due" ? "Sort" : "Newest first"} exportHref={exportHref} />}
      />
      <div className={layout.wrap} style={{ display: "contents" }}>
        {layout.style}
        <TableShell
          label="Bills"
          foot={
            selected.length > 0 || paged ? (
              <TableFoot
                range={paged ? `${from} to ${to} of ${of}` : undefined}
                page={
                  paged
                    ? {
                        onPrevious: query.page > 1 ? () => onQuery({ page: query.page - 1 }) : undefined,
                        onNext: to < of ? () => onQuery({ page: query.page + 1 }) : undefined,
                      }
                    : undefined
                }
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
            ) : undefined
          }
        >
          {data.rows.length === 0 ? (
            <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
              <b>{filtered ? "No bill matches" : query.view === "debit-notes" ? "No debit notes" : query.view === "to-pay" ? "Nothing to pay" : `No ${BILL_TAB_LABEL[query.view].toLowerCase()} bills`}</b>
            </div>
          ) : (
            <table className="table" aria-label="Bills">
              <colgroup>
                <col style={{ width: 44 }} />
                <col style={{ width: 112 }} />
                <col />
                <col style={{ width: 128 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 128 }} />
                <col style={{ width: 128 }} />
              </colgroup>
              <thead>
                <tr>
                  <SelectCell head checked={selection.all} indeterminate={selection.some} onChange={selection.toggleAll} label="Select every bill" />
                  <th>Number</th>
                  <th>Supplier</th>
                  <th>Their FTI</th>
                  <th>FDMS</th>
                  <th>Dated</th>
                  <th>Due</th>
                  <th>State</th>
                  <th className="num">Total, {data.currency}</th>
                  <th className="num">Balance</th>
                </tr>
              </thead>
              <tbody>
                {layout.rows((row) => (
                  <tr key={row.id} aria-selected={selection.isSelected(row.id) || undefined}>
                    <SelectCell checked={selection.isSelected(row.id)} onChange={() => selection.toggle(row.id)} label={`Select ${row.number}`} />
                    <td>
                      <Link className="ref" href={row.href}>
                        {row.number}
                      </Link>
                    </td>
                    <td className="truncate">
                      <span style={{ color: "var(--color-ink)" }}>{row.supplier.name}</span>
                      {row.what ? <span className="muted"> · {row.what}</span> : null}
                    </td>
                    <td className="mono muted">{row.fti ?? "—"}</td>
                    <td>{row.fdms ? <BkState tone={FDMS_TONE[row.fdms]}>{FDMS_LABEL[row.fdms]}</BkState> : <span className="muted">—</span>}</td>
                    <td className="muted">{row.dated}</td>
                    <td className="muted">{row.due ?? "—"}</td>
                    <td>
                      <BkState tone={row.toApprove ? "warning" : STATE_TONE[row.state]}>{row.stateLabel}</BkState>
                    </td>
                    <td className="num" style={row.state === "void" ? { textDecoration: "line-through", color: "var(--color-muted)" } : undefined}>
                      <Cents value={row.total} currency={row.currency} />
                    </td>
                    <td className="num">{row.balance > 0.005 && row.state !== "void" ? <Cents value={row.balance} currency={row.currency} /> : <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bk-sr t">
                  <td />
                  <td colSpan={7}>{count(data.rows.length, query.view === "debit-notes" ? "debit note" : "bill")}</td>
                  <td className="num">
                    <Cents value={totalHere} currency={data.currency} />
                  </td>
                  <td className="num">
                    <Cents value={balanceHere} currency={data.currency} />
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </TableShell>
      </div>
      {unchecked.length > 0 ? (
        <Callout
          icon="fiscal"
          action={
            unchecked.length === 1 ? (
              <Link className="btn" href={unchecked[0]!.href}>
                Check on FDMS
              </Link>
            ) : (
              <Button onClick={() => onQuery({ fdms: "NOT_CHECKED", page: 1 })}>Check on FDMS</Button>
            )
          }
        >
          {unchecked.length === 1 ? (
            <>
              <b>{unchecked[0]!.number} isn&apos;t checked on FDMS.</b> Its VAT, {money(uncheckedVat, data.currency)}, is claimed only once ZIMRA shows the FTI as valid.
            </>
          ) : (
            <>
              <b>{count(unchecked.length, "bill")} aren&apos;t checked on FDMS.</b> Their VAT, {money(uncheckedVat, data.currency)}, is claimed only once ZIMRA shows each FTI as valid.
            </>
          )}
        </Callout>
      ) : null}
    </div>
  );
}
