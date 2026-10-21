"use client";

import * as React from "react";
import Link from "next/link";

import { Button, Kit, TableShell } from "@/components/core";
import type { MenuEntry } from "@/components/core/menu";
import { money } from "@/lib/books/format";
import type { FinancialsPage, FinancialsQuery, LedgerPage, LedgerQuery, TrialBalancePage, TrialBalanceQuery } from "@/lib/books/ledger-pages";

import { BkChip, BkState, BkTabs } from "./bk-list";
import { BooksFinding, Cents } from "./figures";

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

/** The page's Export (X): the file for what is on screen. Goes in the page header beside the search. */
export function ExportAction({ href }: { href: string }) {
  return (
    <Kit contents>
      <Button icon="export" shortcut="X" onClick={() => window.location.assign(href)}>
        Export
      </Button>
    </Kit>
  );
}

/** The toolbar band of a worksheet: chips, a count, and what sits at the end. */
function Band({ children, count, end }: { children: React.ReactNode; count?: React.ReactNode; end?: React.ReactNode }) {
  return (
    <div className="ws-tools">
      {children}
      {count ? <span className="ws-n">{count}</span> : null}
      {end ? <div className="end">{end}</div> : null}
    </div>
  );
}

const Empty = ({ title }: { title: string }) => (
  <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
    <b>{title}</b>
  </div>
);

/** An amount in a worksheet cell: blank when nothing is there. */
const Amount = ({ value, currency }: { value: number; currency: string }) => (Math.abs(value) < 0.005 ? null : <Cents value={value} currency={currency} />);

/* ── Trial balance ───────────────────────────────────────────────────── */

const TYPE_GROUP: Record<string, string> = { Asset: "Assets", Liability: "Liabilities", Equity: "Equity", Income: "Income", Expense: "Expenses" };

/**
 * Books → Ledger → Trial balance (design/core-modules/boards/view/BkTrialBalance.html):
 * every account by its type, debit and credit, as at a month's end or over a
 * range; each account opens its general ledger. The totals row closes the table.
 */
export function BkTrialBalanceView({ data, onQuery, today }: { data: TrialBalancePage; onQuery: (next: Partial<TrialBalanceQuery>) => void; today: string }) {
  const q = data.query;
  const c = data.baseCurrency;
  const ranges = presets(today, data.booksStart, data.fyStartMonth);
  const ledgerHref = (accountId: string) => `/books/ledger?account=${accountId}${q.view === "range" ? `&from=${q.from}&to=${q.to}` : `&to=${q.to}`}`;
  const balanced = Math.abs(data.difference) < 0.005;
  const period: MenuEntry[] = [
    ...data.months.map((month) => ({ key: month.value, label: month.label, checked: q.view === "month" && month.value === q.month, onSelect: () => onQuery({ view: "month", month: month.value }) })),
    { separator: true } as MenuEntry,
    ...ranges.map((range) => ({ key: range.key, label: range.label, checked: q.view === "range" && range.from === q.from && range.to === q.to, onSelect: () => onQuery({ view: "range", from: range.from, to: range.to }) })),
  ];
  return (
    <div className="bk bk-dense">
      <Band
        count={`${c}, base · ${data.rows.length} ${data.rows.length === 1 ? "account" : "accounts"}`}
        end={data.rows.length ? <BkState tone={balanced ? "success" : "danger"}>{balanced ? "Balanced" : `Out by ${money(Math.abs(data.difference), c)}`}</BkState> : null}
      >
        <BkChip label="Period" value={q.view === "month" ? (data.months.find((month) => month.value === q.month)?.label ?? q.month) : data.when} set items={period} />
        {centreChip(data.costCentres, q.cc, (cc) => onQuery({ cc }))}
      </Band>
      <TableShell label="Trial balance">
        {data.rows.length === 0 ? (
          <Empty title="Nothing has posted yet" />
        ) : (
          <table className="table" aria-label="Trial balance">
            <colgroup>
              <col style={{ width: 96 }} />
              <col />
              <col style={{ width: 168 }} />
              <col style={{ width: 168 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Code</th>
                <th className="fill">Account</th>
                <th className="num">Debit</th>
                <th className="num">Credit</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, index) => (
                <React.Fragment key={row.accountId}>
                  {index === 0 || data.rows[index - 1]!.type !== row.type ? (
                    <tr className="grp">
                      <td colSpan={4}>{TYPE_GROUP[row.type] ?? row.type}</td>
                    </tr>
                  ) : null}
                  <tr>
                    <td>
                      <span className="bk-code">{row.code}</span>
                    </td>
                    <td className="fill truncate">
                      <Link className="bk-lnk" href={ledgerHref(row.accountId)}>
                        {row.name}
                      </Link>
                    </td>
                    <td className="num">
                      <Amount value={row.debit} currency={c} />
                    </td>
                    <td className="num">
                      <Amount value={row.credit} currency={c} />
                    </td>
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="tot">
                <td />
                <td className="fill">Total</td>
                <td className="num">
                  <Cents value={data.debit} currency={c} />
                </td>
                <td className="num">
                  <Cents value={data.credit} currency={c} />
                </td>
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
 * the profit and loss, the balance sheet and the cash flow for a month, beside
 * the month before and the year so far, by cost centre. The last line of the
 * statement (Profit) closes the table.
 */
export function BkFinancialsView({ data, onQuery }: { data: FinancialsPage; onQuery: (next: Partial<FinancialsQuery>) => void }) {
  const q = data.query;
  const c = data.baseCurrency;
  const bs = q.tab === "bs";
  const compare: Array<{ value: FinancialsQuery["compare"]; label: string }> = [
    { value: "both", label: bs ? "The month before and the start of the year" : "The month before and the year so far" },
    { value: "previous", label: "The month before" },
    { value: "since", label: bs ? "The start of the year" : "The year so far" },
    { value: "none", label: "Off" },
  ];
  const label = FIN_TABS.find((tab) => tab.value === q.tab)!.label;
  const foot = data.rows.at(-1)?.kind === "total" ? data.rows.at(-1)! : null;
  const body = foot ? data.rows.slice(0, -1) : data.rows;
  const figures = (amounts: number[]) =>
    data.columns.map((_, at) => (
      <td key={at} className="num">
        {amounts[at] === undefined ? null : <Cents value={amounts[at]!} currency={c} />}
      </td>
    ));
  return (
    <div className="bk bk-dense">
      <BkTabs label="Statements" value={q.tab} onChange={(tab) => onQuery({ tab })} items={FIN_TABS} />
      <Band>
        <BkChip label="Period" value={data.months.find((month) => month.value === q.month)?.label ?? q.month} set items={data.months.map((month) => ({ key: month.value, label: month.label, checked: month.value === q.month, onSelect: () => onQuery({ month: month.value }) }))} />
        <BkChip label="Compare" value={data.compareLabel} set={q.compare !== "none"} items={compare.map((option) => ({ key: option.value, label: option.label, checked: option.value === q.compare, onSelect: () => onQuery({ compare: option.value }) }))} />
        {centreChip(data.costCentres, q.cc, (cc) => onQuery({ cc }))}
      </Band>
      <BooksFinding finding={data.finding} />
      <TableShell label={label}>
        {data.rows.length <= 1 ? (
          <Empty title="Nothing in this month yet" />
        ) : (
          <table className="table" aria-label={label}>
            <colgroup>
              <col />
              {data.columns.map((column) => (
                <col key={column} style={{ width: 176 }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="fill">Line</th>
                {data.columns.map((column) => (
                  <th key={column} className="num">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, index) =>
                row.kind === "group" ? (
                  <tr key={index} className="grp">
                    <td colSpan={data.columns.length + 1}>{row.label}</td>
                  </tr>
                ) : (
                  <tr key={index} className={row.kind === "line" ? undefined : "subtotal"}>
                    <td className="fill truncate">
                      {row.kind === "line" && row.accountId ? (
                        <Link className="bk-lnk" href={`/books/ledger?account=${row.accountId}`}>
                          {row.label}
                        </Link>
                      ) : (
                        row.label
                      )}
                    </td>
                    {figures(row.amounts)}
                  </tr>
                ),
              )}
            </tbody>
            {foot ? (
              <tfoot>
                <tr className="tot">
                  <td className="fill">{foot.label}</td>
                  {figures(foot.amounts)}
                </tr>
              </tfoot>
            ) : null}
          </table>
        )}
      </TableShell>
    </div>
  );
}

/* ── General ledger ──────────────────────────────────────────────────── */

/**
 * Books → Ledger → General ledger (design/core-modules/boards/view/BkLedger.html):
 * one account's lines from its opening balance, with the running balance; the
 * document opens from its number, the journal from its entry.
 */
export function BkLedgerView({ data, onQuery, today }: { data: LedgerPage; onQuery: (next: Partial<LedgerQuery>) => void; today: string }) {
  const q = data.query;
  const c = data.baseCurrency;
  const ranges = presets(today, data.booksStart, data.fyStartMonth);
  const [party, setParty] = React.useState("");
  const rows = party ? data.rows.filter((row) => row.party === party) : data.rows;
  const debit = party ? rows.reduce((sum, row) => sum + row.debit, 0) : data.debit;
  const credit = party ? rows.reduce((sum, row) => sum + row.credit, 0) : data.credit;
  return (
    <div className="bk bk-dense">
      <Band count={<>Opening <Cents value={data.opening} currency={c} /></>}>
        <BkChip
          label="Account"
          value={data.account ? `${data.account.code} ${data.account.name}` : "None"}
          set
          items={data.accounts.map((account) => ({ key: account.id, label: account.label, checked: account.id === data.account?.id, onSelect: () => onQuery({ account: account.id }) }))}
        />
        <BkChip label="Period" value={data.dates} set items={ranges.map((range) => ({ key: range.key, label: range.label, checked: range.from === q.from && range.to === q.to, onSelect: () => onQuery({ from: range.from, to: range.to }) }))} />
        <BkChip
          label="Party"
          value={party || "Any"}
          set={Boolean(party)}
          items={[
            { key: "any", label: "Any party", checked: !party, onSelect: () => setParty("") },
            ...(data.parties.length ? [{ separator: true } as MenuEntry] : []),
            ...data.parties.map((name) => ({ key: name, label: name, checked: party === name, onSelect: () => setParty(name) })),
          ]}
        />
      </Band>
      <TableShell label="General ledger">
        <table className="table" aria-label="General ledger">
          <colgroup>
            <col style={{ width: 80 }} />
            <col />
            <col style={{ width: 120 }} />
            <col style={{ width: 112 }} />
            <col style={{ width: 144 }} />
            <col style={{ width: 144 }} />
            <col style={{ width: 160 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Date</th>
              <th className="fill">What</th>
              <th>Document</th>
              <th>Entry</th>
              <th className="num">Debit</th>
              <th className="num">Credit</th>
              <th className="num">Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="muted">{q.from ? `${Number(q.from.slice(8, 10))} ${data.dates.split(" ")[1]}` : ""}</td>
              <td className="fill">
                <span className="muted">Opening balance</span>
              </td>
              <td />
              <td />
              <td className="num" />
              <td className="num" />
              <td className="num">
                <Cents value={data.opening} currency={c} />
              </td>
            </tr>
            {rows.map((row, index) => (
              <tr key={`${row.entryId}-${index}`}>
                <td className="muted">{row.date}</td>
                <td className="fill truncate" title={row.what}>
                  <span className="cell-lead">{row.what}</span>
                </td>
                <td>
                  {row.document ? (
                    <Link className="ref" href={row.href}>
                      {row.document}
                    </Link>
                  ) : null}
                </td>
                <td>
                  <Link className="bk-code" href={`/books/journals?journal=${row.entryId}`}>
                    {row.number}
                  </Link>
                </td>
                <td className="num">
                  <Amount value={row.debit} currency={c} />
                </td>
                <td className="num">
                  <Amount value={row.credit} currency={c} />
                </td>
                <td className="num">
                  <Cents value={row.balance} currency={c} />
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td />
                <td className="fill">
                  <span className="muted">No lines in this period</span>
                </td>
                <td />
                <td />
                <td />
                <td />
                <td />
              </tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr className="tot">
              <td />
              <td className="fill">{party ? `${rows.length} of ${data.rows.length} lines` : `${rows.length} ${rows.length === 1 ? "line" : "lines"}`}</td>
              <td />
              <td />
              <td className="num">
                <Cents value={debit} currency={c} />
              </td>
              <td className="num">
                <Cents value={credit} currency={c} />
              </td>
              <td className="num">{party ? null : <Cents value={data.closing} currency={c} />}</td>
            </tr>
          </tfoot>
        </table>
      </TableShell>
    </div>
  );
}
