"use client";

import * as React from "react";
import Link from "next/link";

import { Button, SelectCell, TableFoot, TableShell, useSelection } from "@/components/core";
import { money } from "@/lib/books/format";
import { WITHHOLDING_TABS, type WithholdingTab } from "@/lib/books/withholding-labels";
import type { WithholdingPage, WhtRow } from "@/lib/books/withholding-page";

import { Lead, St, TableEmpty, ToConfirm } from "./bk-b";
import { BkChip, BkQuietTools, BkTabs, BkTools } from "./bk-list";
import { BooksFinding } from "./figures";

/**
 * Books → Tax → Withholding (design/core-modules/boards/view/BkWithholding.html):
 * six columns, the supplier's ITF263 state under their name; VAT withheld by
 * customers and by us as an agent; the certificates; the monthly returns.
 */
export function BkWithholdingView({
  data,
  q,
  supplier,
  onQuery,
  onCertificate,
  issuing,
  exportHref,
}: {
  data: WithholdingPage;
  q: string;
  supplier: string | null;
  onQuery: (next: { tab?: WithholdingTab; q?: string; supplier?: string | null }) => void;
  onCertificate: (row: WhtRow) => void;
  issuing: string | null;
  exportHref: string;
}) {
  const c = data.baseCurrency;
  const ids = React.useMemo(() => data.income.map((row) => row.id), [data.income]);
  const selection = useSelection(ids);
  const selected = data.income.filter((row) => selection.isSelected(row.id));
  const supplierName = data.suppliers.find((row) => row.id === supplier)?.name;
  const counted = data.tab === "income" ? data.income.length : data.tab === "vat" ? data.vat.length : data.tab === "certificates" ? data.certificates.length : data.tab === "returns" ? data.returns.length : 0;
  const noun = data.tab === "returns" ? "months" : data.tab === "certificates" ? "certificates" : "payments";
  const returnHref = `/api/books/withholding?return=${data.returnMonth.key}&format=csv`;
  return (
    <div className="bk">
      <BooksFinding finding={data.finding} />
      <BkTabs label="Withholding" value={data.tab} onChange={(tab) => onQuery({ tab })} items={WITHHOLDING_TABS.map((tab) => ({ ...tab, count: data.counts[tab.value] }))} />
      <BkTools
        find="Search withholding"
        query={q}
        onFind={(next) => onQuery({ q: next })}
        chips={
          <>
            <BkChip label="Dates" value="This year" set items={[{ key: "year", label: "This year", checked: true, onSelect: () => undefined }]} />
            <BkChip
              label="Supplier"
              value={supplierName ?? "Any"}
              set={Boolean(supplierName)}
              items={[{ key: "any", label: "Any", checked: !supplier, onSelect: () => onQuery({ supplier: null }) }, { separator: true }, ...data.suppliers.map((row) => ({ key: row.id, label: row.name, checked: row.id === supplier, onSelect: () => onQuery({ supplier: row.id }) }))]}
            />
          </>
        }
        count={`${counted} ${counted === 1 ? noun.replace(/s$/, "") : noun}`}
        end={<BkQuietTools exportHref={exportHref} />}
      />
      <TableShell
        label="Withholding"
        foot={
          <TableFoot
            range={`${data.sums.paymentsThisYear} ${data.sums.paymentsThisYear === 1 ? "payment" : "payments"} this year`}
            sums={[
              { label: "Withheld", value: money(data.sums.withheld, c) },
              { label: "Waiting to be paid", value: money(data.sums.waiting, c) },
            ]}
            end={
              <a className="btn" href={returnHref} download>
                Make the {data.returnMonth.name} return
              </a>
            }
            selection={
              data.tab === "income"
                ? {
                    count: selected.length,
                    sum: { label: "Withheld", value: money(selected.reduce((sum, row) => sum + row.withheld, 0), c) },
                    onClear: selection.clear,
                    actions: (
                      <Button icon="docs" disabled={!selected.some((row) => row.state === "Paid" && !row.certificateNo)} onClick={() => selected.filter((row) => row.state === "Paid" && !row.certificateNo).forEach(onCertificate)}>
                        Issue certificates
                      </Button>
                    ),
                  }
                : undefined
            }
          />
        }
      >
        {data.tab === "income" ? (
          data.income.length === 0 ? (
            <TableEmpty title="Nothing withheld">A payment to a supplier without a valid ITF263 withholds 30% once their payments this year reach the threshold.</TableEmpty>
          ) : (
            <table className="table" aria-label="Withheld, 30%">
              <colgroup>
                <col style={{ width: 44 }} />
                <col style={{ width: 150 }} />
                <col />
                <col style={{ width: 140 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 130 }} />
              </colgroup>
              <thead>
                <tr>
                  <SelectCell head checked={selection.all} indeterminate={selection.some} onChange={selection.toggleAll} label="Select every payment" />
                  <th>Payment</th>
                  <th>Supplier</th>
                  <th className="num">Gross</th>
                  <th className="num">Withheld, 30%</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {data.income.map((row) => (
                  <tr key={row.id} aria-selected={selection.isSelected(row.id) || undefined}>
                    <SelectCell checked={selection.isSelected(row.id)} onChange={() => selection.toggle(row.id)} label={`Select ${row.number ?? "the payment"}`} />
                    <td>
                      <Lead sub={row.date}>
                        <Link className="ref" href={`/books/payments-made?q=${encodeURIComponent(row.number ?? "")}`}>
                          {row.number ?? "Draft"}
                        </Link>
                      </Lead>
                    </td>
                    <td className="fill truncate">
                      <Lead sub={row.itf263}>
                        <Link href={`/books/suppliers/${row.supplier.id}?tab=tax`} style={{ color: "var(--color-ink)" }}>
                          {row.supplier.name}
                        </Link>
                      </Lead>
                    </td>
                    <td className="num muted">{money(row.gross, row.currency)}</td>
                    <td className="num">{money(row.withheld, row.currency)}</td>
                    <td>
                      <St word={row.state} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : data.tab === "vat" ? (
          data.vat.length === 0 ? (
            <TableEmpty title="No VAT withheld">A customer who is a VAT withholding agent keeps a third of the VAT: record it with their payment, with their certificate number.</TableEmpty>
          ) : (
            <table className="table" aria-label="VAT withheld">
              <colgroup>
                <col style={{ width: 150 }} />
                <col />
                <col style={{ width: 200 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 160 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Document</th>
                  <th>From</th>
                  <th>Who withheld</th>
                  <th className="num">VAT withheld</th>
                  <th>Certificate</th>
                </tr>
              </thead>
              <tbody>
                {data.vat.map((row) => (
                  <tr key={`${row.kind}-${row.id}`}>
                    <td>
                      <Lead sub={row.date}>
                        <span className="ref">{row.number ?? "—"}</span>
                      </Lead>
                    </td>
                    <td className="fill truncate">
                      <span className="cell-lead">{row.party}</span>
                    </td>
                    <td className="muted">{row.kind === "by-customer" ? "The customer, as an agent" : "Us, as an agent"}</td>
                    <td className="num">{money(row.amount, row.currency)}</td>
                    <td className="muted">{row.certificate ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : data.tab === "rent" ? (
          <TableEmpty title="Nothing withheld from rent or non-resident fees">
            Fees paid to a non-resident withhold 15% <ToConfirm why="The 15% non-resident rate on fees was not reconfirmed for 2026." />. Nothing paid this year falls under it.
          </TableEmpty>
        ) : data.tab === "certificates" ? (
          data.certificates.length === 0 ? (
            <TableEmpty title="No certificates yet">Each paid payment that withheld tax gets a WHT- certificate for the supplier.</TableEmpty>
          ) : (
            <table className="table" aria-label="Certificates">
              <colgroup>
                <col style={{ width: 160 }} />
                <col />
                <col style={{ width: 150 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 170 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Certificate</th>
                  <th>Supplier</th>
                  <th>Payment</th>
                  <th className="num">Withheld</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.certificates.map((row) => (
                  <tr key={row.id}>
                    <td>{row.certificateNo ? <span className="ref">{row.certificateNo}</span> : <span className="muted">Not issued</span>}</td>
                    <td className="fill truncate">
                      <span className="cell-lead">{row.supplier.name}</span>
                    </td>
                    <td>
                      <Lead sub={row.date}>
                        <span className="ref">{row.number ?? "—"}</span>
                      </Lead>
                    </td>
                    <td className="num">{money(row.withheld, row.currency)}</td>
                    <td style={{ textAlign: "right" }}>
                      {row.certificateNo ? null : (
                        <Button size="sm" icon="docs" busy={issuing === row.id} disabled={Boolean(issuing)} onClick={() => onCertificate(row)}>
                          Issue
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : data.returns.length === 0 ? (
          <TableEmpty title="No month has ended yet">A month’s return is due on the 5th of the next.</TableEmpty>
        ) : (
          <table className="table" aria-label="Returns">
            <colgroup>
              <col />
              <col style={{ width: 120 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 120 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Month</th>
                <th>Return by</th>
                <th className="num">Income tax</th>
                <th className="num">VAT</th>
                <th className="num">Ledger, 2180</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.returns.map((row) => (
                <tr key={row.month}>
                  <td className="fill">
                    <Lead sub={row.payments ? `${row.payments} ${row.payments === 1 ? "payment" : "payments"}${row.missingCertificates ? `, ${row.missingCertificates} without a certificate` : ""}` : "Nothing withheld"}>{row.label}</Lead>
                  </td>
                  <td className="muted">{row.returnDue}</td>
                  <td className="num">{money(row.incomeTax, c)}</td>
                  <td className="num muted">{money(row.vat, c)}</td>
                  <td className="num muted">{money(row.ledger, c)}</td>
                  <td style={{ textAlign: "right" }}>
                    {row.payments ? (
                      <a className="btn btn-sm" href={`/api/books/withholding?return=${row.month}&format=csv`} download>
                        Return
                      </a>
                    ) : null}
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
