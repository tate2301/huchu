"use client";

import * as React from "react";
import Link from "next/link";

import { Button, Icon, Segmented, TableFoot, TableShell } from "@/components/core";
import type { MenuEntry } from "@/components/core/menu";
import { money } from "@/lib/books/format";
import type { FinancialsPage, FinancialsQuery, LedgerPage, LedgerQuery, TrialBalancePage, TrialBalanceQuery } from "@/lib/books/ledger-pages";

import { Lead, n2, TableEmpty } from "./bk-b";
import { BkChip, BkTabs } from "./bk-list";
import { BooksFinding } from "./figures";

const cell = (n: number) => (Math.abs(n) < 0.005 ? "" : n2(n));
/** "45.2%", "−1.3%", never "-0.0%". */
const pct = (share: number) => (Math.abs(share) < 0.05 ? "0.0%" : `${share < 0 ? "−" : ""}${Math.abs(share).toFixed(1)}%`);
const iso = (date: Date) => date.toISOString().slice(0, 10);

/** Ranges a person picks most, as of today: this month, last month, this year, since the books started. */
function presets(today: string, booksStart: string | null, fyStartMonth: number): Array<{ key: string; label: string; from: string; to: string }> {
  const [y, m] = today.split("-").map(Number);
  const first = (year: number, month: number) => iso(new Date(Date.UTC(year, month - 1, 1)));
  const last = (year: number, month: number) => iso(new Date(Date.UTC(year, month, 0)));
  const fyYear = m >= fyStartMonth ? y : y - 1;
  return [
    { key: "this", label: "This month", from: first(y, m), to: today },
    { key: "last", label: "Last month", from: first(y, m - 1), to: last(y, m - 1) },
    { key: "since-last", label: "Since last month", from: first(y, m - 1), to: today },
    { key: "year", label: "This financial year", from: first(fyYear, fyStartMonth), to: today },
    ...(booksStart ? [{ key: "start", label: "Since the books started", from: booksStart, to: today }] : []),
  ];
}

function centreChip(costCentres: Array<{ id: string; label: string }>, value: string, onPick: (cc: string) => void) {
  const chosen = costCentres.find((centre) => centre.id === value);
  return (
    <BkChip
      label="Cost centre"
      value={chosen?.label ?? "All"}
      set={Boolean(chosen)}
      items={[
        { key: "all", label: "All cost centres", checked: !chosen, onSelect: () => onPick("") },
        ...(costCentres.length ? [{ separator: true } as MenuEntry] : []),
        ...costCentres.map((centre) => ({ key: centre.id, label: centre.label, checked: centre.id === value, onSelect: () => onPick(centre.id) })),
      ]}
    />
  );
}

/* ── Trial balance ───────────────────────────────────────────────────── */

/**
 * Books → Ledger → Trial balance (design/core-modules/boards/view/BkTrialBalance.html):
 * by month (as at its last day) or over a range, in the base currency; each
 * account opens its general ledger.
 */
export function BkTrialBalanceView({ data, onQuery, accountantHref, today }: { data: TrialBalancePage; onQuery: (next: Partial<TrialBalanceQuery>) => void; accountantHref: string; today: string }) {
  const q = data.query;
  const c = data.baseCurrency;
  const ranges = presets(today, data.booksStart, data.fyStartMonth);
  const ledgerHref = (accountId: string) => `/books/ledger?account=${accountId}${q.view === "range" ? `&from=${q.from}&to=${q.to}` : `&to=${q.to}`}`;
  return (
    <div className="bk">
      <BooksFinding finding={data.finding} />
      <div className="tools">
        <Segmented
          label="View"
          value={q.view}
          onChange={(view) => onQuery({ view })}
          items={[
            { value: "month", label: "By month" },
            { value: "range", label: "Range" },
          ]}
        />
        {q.view === "month" ? (
          <BkChip label="As at" value={data.when.replace(/^As at /, "")} set items={data.months.map((month) => ({ key: month.value, label: month.label, checked: month.value === q.month, onSelect: () => onQuery({ month: month.value }) }))} />
        ) : (
          <BkChip label="Dates" value={data.when} set items={ranges.map((range) => ({ key: range.key, label: range.label, checked: range.from === q.from && range.to === q.to, onSelect: () => onQuery({ from: range.from, to: range.to }) }))} />
        )}
        {centreChip(data.costCentres, q.cc, (cc) => onQuery({ cc }))}
        <div className="end">
          <Button icon="print" onClick={() => window.print()}>
            Print
          </Button>
          <Button variant="quiet" iconOnly icon="eye" label="Hide zero balances" title={q.zero === "hide" ? "Zero balances are hidden: show them" : "Hide zero balances"} aria-pressed={q.zero === "hide"} onClick={() => onQuery({ zero: q.zero === "hide" ? "show" : "hide" })} />
        </div>
      </div>
      <TableShell
        label="Trial balance"
        foot={
          <TableFoot
            range={`${data.withBalance} ${data.withBalance === 1 ? "account" : "accounts"} with a balance`}
            sums={[
              { label: "Debit", value: money(data.debit, c) },
              { label: "Credit", value: money(data.credit, c) },
              { label: "Difference", value: n2(data.difference) },
            ]}
            end={
              <a className="btn" href={accountantHref} download>
                <Icon name="export" />
                Export for your accountant
              </a>
            }
          />
        }
      >
        {data.rows.length === 0 ? (
          <TableEmpty title="Nothing has posted yet">The trial balance fills as invoices, bills and payments post.</TableEmpty>
        ) : (
          <table className="table" aria-label="Trial balance">
            <colgroup>
              <col style={{ width: 90 }} />
              <col />
              <col style={{ width: 130 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 56 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Code</th>
                <th className="fill">Account</th>
                <th>Type</th>
                <th className="num">Debit</th>
                <th className="num">Credit</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.accountId}>
                  <td>
                    <span className="ref">{row.code}</span>
                  </td>
                  <td className="fill truncate">{row.name}</td>
                  <td>
                    <span className="muted">{row.type}</span>
                  </td>
                  <td className="num">{cell(row.debit)}</td>
                  <td className="num">{cell(row.credit)}</td>
                  <td>
                    <Link className="btn btn-quiet btn-icon" href={ledgerHref(row.accountId)} aria-label={`Open the general ledger for ${row.code} ${row.name}`}>
                      <Icon name="chev" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="tot">
                <td />
                <td className="fill">{data.rows.length} accounts</td>
                <td />
                <td className="num">{n2(data.debit)}</td>
                <td className="num">{n2(data.credit)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </TableShell>
    </div>
  );
}

/* ── Financial statements ────────────────────────────────────────────── */

const FIN_TABS: Array<{ value: FinancialsQuery["tab"]; label: string }> = [
  { value: "pl", label: "Profit and loss" },
  { value: "bs", label: "Balance sheet" },
  { value: "cf", label: "Cash flow" },
];

/**
 * Books → Ledger → Financial statements (design/core-modules/boards/view/BkFinancials.html):
 * the profit and loss, the balance sheet and the cash flow for a month,
 * beside the year so far or the month before, by cost centre.
 */
export function BkFinancialsView({ data, onQuery, exportHref }: { data: FinancialsPage; onQuery: (next: Partial<FinancialsQuery>) => void; exportHref: string }) {
  const q = data.query;
  const share = q.tab === "pl" && data.shareHead;
  const compare: Array<{ value: FinancialsQuery["compare"]; label: string }> = [
    { value: "since", label: q.tab === "bs" ? "The start of the year" : "The year so far" },
    { value: "previous", label: "The month before" },
    { value: "none", label: "Nothing" },
  ];
  return (
    <div className="bk">
      <BooksFinding finding={data.finding} />
      <BkTabs label="Statements" value={q.tab} onChange={(tab) => onQuery({ tab })} items={FIN_TABS} />
      <div className="tools">
        <BkChip label="Period" value={data.months.find((month) => month.value === q.month)?.label ?? q.month} set items={data.months.map((month) => ({ key: month.value, label: month.label, checked: month.value === q.month, onSelect: () => onQuery({ month: month.value }) }))} />
        <BkChip label="Compare" value={data.compareLabel} set={q.compare !== "none"} items={compare.map((option) => ({ key: option.value, label: option.label, checked: option.value === q.compare, onSelect: () => onQuery({ compare: option.value }) }))} />
        {centreChip(data.costCentres, q.cc, (cc) => onQuery({ cc }))}
      </div>
      <TableShell
        label={FIN_TABS.find((tab) => tab.value === q.tab)!.label}
        foot={
          <TableFoot
            range={data.foot.label}
            sums={data.foot.sums}
            end={
              <>
                <a className="btn" href={exportHref} download>
                  <Icon name="export" />
                  Export
                </a>
                <Button variant="quiet" iconOnly icon="print" label="Print" onClick={() => window.print()} />
              </>
            }
          />
        }
      >
        {data.rows.length <= 1 ? (
          <TableEmpty title="Nothing in this month yet">The statements fill as invoices, bills and payments post.</TableEmpty>
        ) : (
          <table className="table" aria-label={FIN_TABS.find((tab) => tab.value === q.tab)!.label}>
            <colgroup>
              <col />
              {data.columns.map((column) => (
                <col key={column} style={{ width: 170 }} />
              ))}
              {share ? <col style={{ width: 170 }} /> : null}
            </colgroup>
            <thead>
              <tr>
                <th className="fill" />
                {data.columns.map((column) => (
                  <th key={column} className="num">
                    {column}
                  </th>
                ))}
                {share ? <th className="num">{data.shareHead}</th> : null}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, index) =>
                row.kind === "group" ? (
                  <tr key={index} className="grp">
                    <td colSpan={data.columns.length + 1 + (share ? 1 : 0)}>{row.label}</td>
                  </tr>
                ) : (
                  <tr key={index} className={row.kind === "total" ? "tot" : undefined}>
                    <td className="fill truncate">
                      {row.kind === "line" && row.accountId ? (
                        <Link href={`/books/ledger?account=${row.accountId}`} style={{ color: "inherit" }}>
                          {row.label}
                        </Link>
                      ) : (
                        row.label
                      )}
                    </td>
                    {row.amounts.map((amount, at) => (
                      <td key={at} className="num">
                        {n2(amount)}
                      </td>
                    ))}
                    {share ? <td className="num">{row.share === null || row.share === undefined ? "" : <span className={row.kind === "line" ? "muted" : undefined}>{pct(row.share)}</span>}</td> : null}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
      </TableShell>
    </div>
  );
}

/* ── General ledger ──────────────────────────────────────────────────── */

/**
 * Books → Ledger → General ledger (design/core-modules/boards/view/BkLedger.html):
 * one account's lines with the running balance, opening and closing; each
 * line opens its source document, or its journal.
 */
export function BkLedgerView({ data, onQuery, exportHref, today }: { data: LedgerPage; onQuery: (next: Partial<LedgerQuery>) => void; exportHref: string; today: string }) {
  const q = data.query;
  const c = data.baseCurrency;
  const ranges = presets(today, data.booksStart, data.fyStartMonth);
  return (
    <div className="bk">
      <BooksFinding finding={data.finding} />
      <div className="tools">
        <BkChip
          label="Account"
          value={data.account ? `${data.account.code} ${data.account.name}` : "None"}
          set
          items={data.accounts.map((account) => ({ key: account.id, label: account.label, checked: account.id === data.account?.id, onSelect: () => onQuery({ account: account.id }) }))}
        />
        <BkChip label="Dates" value={data.dates} set items={ranges.map((range) => ({ key: range.key, label: range.label, checked: range.from === q.from && range.to === q.to, onSelect: () => onQuery({ from: range.from, to: range.to }) }))} />
        {centreChip(data.costCentres, q.cc, (cc) => onQuery({ cc }))}
        <div className="end">
          <Button icon="print" onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </div>
      <TableShell
        label="General ledger"
        foot={
          <TableFoot
            range={`${data.rows.length} ${data.rows.length === 1 ? "entry" : "entries"}`}
            sums={[
              { label: "Debit", value: money(data.debit, c) },
              { label: "Credit", value: money(data.credit, c) },
              { label: "Balance", value: money(data.closing, c) },
            ]}
            end={
              <a className="btn" href={exportHref} download>
                <Icon name="export" />
                Export
              </a>
            }
          />
        }
      >
        <table className="table" aria-label="General ledger">
          <colgroup>
            <col style={{ width: 90 }} />
            <col style={{ width: 110 }} />
            <col />
            <col style={{ width: 130 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 140 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Date</th>
              <th>Entry</th>
              <th className="fill">Memo</th>
              <th className="num">Debit</th>
              <th className="num">Credit</th>
              <th className="num">Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <span className="muted">{q.from ? `${Number(q.from.slice(8, 10))} ${data.dates.split(" ")[1]}` : ""}</span>
              </td>
              <td />
              <td className="fill">
                <span className="cell-lead">Opening balance</span>
              </td>
              <td className="num" />
              <td className="num" />
              <td className="num">{n2(data.opening)}</td>
            </tr>
            {data.rows.map((row, index) => (
              <tr key={`${row.entryId}-${index}`}>
                <td>
                  <span className="muted">{row.date}</span>
                </td>
                <td>
                  <Link className="ref" href={row.href}>
                    {row.number}
                  </Link>
                </td>
                <td className="fill truncate" title={row.memo}>
                  <Lead sub={row.source}>{row.memo}</Lead>
                </td>
                <td className="num">{cell(row.debit)}</td>
                <td className="num">{cell(row.credit)}</td>
                <td className="num">{n2(row.balance)}</td>
              </tr>
            ))}
            {data.rows.length === 0 ? (
              <tr>
                <td />
                <td />
                <td className="fill">
                  <span className="muted">Nothing posted to this account in these dates.</span>
                </td>
                <td />
                <td />
                <td />
              </tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr className="tot">
              <td>{data.rows.at(-1)?.date ?? ""}</td>
              <td />
              <td className="fill">Closing balance</td>
              <td className="num">{n2(data.debit)}</td>
              <td className="num">{n2(data.credit)}</td>
              <td className="num">{n2(data.closing)}</td>
            </tr>
          </tfoot>
        </table>
      </TableShell>
    </div>
  );
}
