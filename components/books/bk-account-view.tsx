"use client";

import * as React from "react";
import Link from "next/link";

import { TableFoot, TableShell } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import type { AccountLine, AccountPage, AccountTab, AccountTxn } from "@/lib/books/bank-accounts";
import { money, signedMoney } from "@/lib/books/format";

import { Lead, Rail, RailSec, Split, St, TableEmpty } from "./bk-b";
import { BkChip, BkQuietTools, BkTabs, BkTools } from "./bk-list";

/**
 * Books → Bank & cash → one account (design/core-modules/boards/view/BkAccount.html):
 * a record page, so no finding. Its transactions since the last reconciled
 * day with the running balance and whether the statement has them; its
 * statement lines (match, exclude, put back, unmatch); its reconciliations.
 * The rail: the book balance against the statement, and the details.
 */
export function BkAccountView({
  data,
  q,
  onQuery,
  exportHref,
  txnMenu,
  lineMenu,
}: {
  data: AccountPage;
  q: string;
  onQuery: (next: { tab?: AccountTab; q?: string; range?: "since" | "all" }) => void;
  exportHref: string;
  txnMenu: (row: AccountTxn) => MenuEntry[];
  lineMenu: (row: AccountLine) => MenuEntry[];
}) {
  const c = data.currency;
  const find = data.tab === "transactions" ? "Search transactions" : data.tab === "lines" ? "Search statement lines" : "Search reconciliations";
  const shown = data.tab === "transactions" ? data.transactions.length : data.tab === "lines" ? data.lines.length : data.reconciliations.length;
  const noun = data.tab === "transactions" ? ["entry", "entries"] : data.tab === "lines" ? ["line", "lines"] : ["reconciliation", "reconciliations"];
  const sinceWords = data.since ? `Since ${data.since}` : "Everything";
  // Fifty entries a page, the newest first.
  const [page, setPage] = React.useState(1);
  React.useEffect(() => setPage(1), [data.tab, q, data.range]);
  const pages = Math.max(1, Math.ceil(data.transactions.length / 50));
  const txns = data.transactions.slice((page - 1) * 50, page * 50);
  return (
    <Split
      rail={
        <Rail label="The account" width={340}>
          <RailSec
            title="In the books"
            figure={money(data.rail.book, c)}
            num
            rows={[
              ...(data.rail.statement ? ([[`Statement, ${data.rail.statement.day}`, money(data.rail.statement.balance, c)]] as Array<[string, string]>) : []),
              ...(data.rail.difference !== null ? ([["Difference", money(data.rail.difference, c)]] as Array<[string, string]>) : []),
              ["Last reconciled", data.rail.lastReconciled ?? "Never"],
            ]}
            after={
              data.rail.openReconciliationId ? (
                <Link className="btn" href={`/books/reconciliations/${data.rail.openReconciliationId}`}>
                  Open the reconciliation
                </Link>
              ) : null
            }
          />
          <RailSec
            title="Details"
            rows={[
              ["Bank", data.bankName ?? data.kindLabel],
              ["Number", data.last4 ? <span className="mono">••• {data.last4}</span> : "—"],
              ["Ledger account", data.ledger ? <span className="ref">{data.ledger}</span> : "—"],
              ["Statements", data.kindLabel === "Cash" ? "Counted, no statement" : "CSV upload"],
            ]}
          />
        </Rail>
      }
    >
      <div className="bk-head">
        <div className="t">
          <h1>{data.name}</h1>
          {data.toMatch ? <span className="pill pill-warn">{data.toMatch} to match</span> : <span className="pill pill-success">All matched</span>}
        </div>
        <div className="sub">
          {data.kindLabel}
          {data.last4 ? ` · ending ${data.last4}` : ""}
          {` · ${c}`}
        </div>
      </div>
      <BkTabs
        label="Account views"
        value={data.tab}
        onChange={(tab) => onQuery({ tab })}
        items={[
          { value: "transactions", label: "Transactions", count: data.counts.transactions },
          { value: "lines", label: "Statement lines", count: data.counts.lines },
          { value: "reconciliations", label: "Reconciliations", count: data.counts.reconciliations },
        ]}
      />
      <BkTools
        find={find}
        query={q}
        onFind={(next) => onQuery({ q: next })}
        chips={
          data.tab === "transactions" ? (
            <BkChip
              label="Dates"
              value={data.range === "all" ? "Everything" : sinceWords}
              set={data.range !== "all" && Boolean(data.since)}
              items={[
                { key: "since", label: data.since ? `Since ${data.since}, the last reconciled day` : "Since the start", checked: data.range !== "all", onSelect: () => onQuery({ range: "since" }) },
                { key: "all", label: "Everything", checked: data.range === "all", onSelect: () => onQuery({ range: "all" }) },
              ]}
            />
          ) : null
        }
        count={`${shown} ${shown === 1 ? noun[0] : noun[1]}`}
        end={<BkQuietTools exportHref={exportHref} />}
      />
      {data.tab === "transactions" ? (
        <TableShell
          label="Transactions"
          foot={
            <TableFoot
              range={`${shown} ${shown === 1 ? "entry" : "entries"}${data.since && data.range !== "all" ? ` since ${data.since}` : ""}`}
              sums={[
                { label: "In", value: money(data.sums.in, c) },
                { label: "Out", value: money(data.sums.out, c) },
              ]}
              page={{ onPrevious: page > 1 ? () => setPage(page - 1) : undefined, onNext: page < pages ? () => setPage(page + 1) : undefined }}
            />
          }
        >
          {data.transactions.length === 0 && data.reconciledBalance === null ? (
            <TableEmpty title={q ? "No entry matches" : "Nothing has moved yet"}>{q ? "Clear the search to see the rest." : "Receipts, payments and bank entries through this account land here."}</TableEmpty>
          ) : (
            <table className="table" aria-label="Transactions">
              <colgroup>
                <col style={{ width: 90 }} />
                <col style={{ width: 120 }} />
                <col />
                <col style={{ width: 140 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 56 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Number</th>
                  <th>What</th>
                  <th className="num">Amount</th>
                  <th className="num">Balance</th>
                  <th>Statement</th>
                  <th className="acts" />
                </tr>
              </thead>
              <tbody>
                {txns.map((row) => {
                  const items = txnMenu(row);
                  return (
                    <tr key={row.id}>
                      <td className="muted">{row.day}</td>
                      <td>{row.number ? <span className="ref">{row.number}</span> : null}</td>
                      <td className="fill truncate">
                        <Lead sub={row.sub}>{row.what}</Lead>
                      </td>
                      <td className="num">{signedMoney(row.amount, c)}</td>
                      <td className="num muted">{money(row.balance, c)}</td>
                      <td>
                        <St word={row.matched ? "Matched" : "To match"} />
                      </td>
                      <td className="acts">{items.length ? <MenuButton variant="quiet" iconOnly icon="more" iconEnd={undefined} align="end" label={`More for ${row.what}`} aria-label={`More for ${row.what}`} items={items} /> : null}</td>
                    </tr>
                  );
                })}
                {data.reconciledBalance !== null && page === pages ? (
                  <tr>
                    <td className="muted">{data.since}</td>
                    <td />
                    <td className="fill">
                      <span className="cell-lead muted">Reconciled balance</span>
                    </td>
                    <td />
                    <td className="num muted">{money(data.reconciledBalance, c)}</td>
                    <td />
                    <td />
                  </tr>
                ) : null}
              </tbody>
            </table>
          )}
        </TableShell>
      ) : data.tab === "lines" ? (
        <TableShell label="Statement lines" foot={<TableFoot range={`${shown} ${shown === 1 ? "line" : "lines"}`} sums={[{ label: "To match", value: String(data.toMatch) }]} />}>
          {data.lines.length === 0 ? (
            <TableEmpty title="No statement yet">Upload the bank’s CSV: its lines land here and in To match.</TableEmpty>
          ) : (
            <table className="table" aria-label="Statement lines">
              <colgroup>
                <col style={{ width: 90 }} />
                <col />
                <col style={{ width: 140 }} />
                <col style={{ width: 240 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 56 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Statement line</th>
                  <th className="num">Amount</th>
                  <th>Matched to</th>
                  <th>State</th>
                  <th className="acts" />
                </tr>
              </thead>
              <tbody>
                {data.lines.map((row) => {
                  const items = lineMenu(row);
                  return (
                    <tr key={row.id}>
                      <td className="muted">{row.day}</td>
                      <td className="fill truncate">
                        <Lead sub={row.reference}>{row.what}</Lead>
                      </td>
                      <td className="num">{signedMoney(row.amount, c)}</td>
                      <td className="truncate muted">{row.note ?? "—"}</td>
                      <td>
                        <St word={row.state === "matched" ? "Matched" : row.state === "excluded" ? "Excluded" : "To match"} />
                      </td>
                      <td className="acts">{items.length ? <MenuButton variant="quiet" iconOnly icon="more" iconEnd={undefined} align="end" label={`More for ${row.what}`} aria-label={`More for ${row.what}`} items={items} /> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </TableShell>
      ) : (
        <TableShell label="Reconciliations" foot={<TableFoot range={`${shown} ${shown === 1 ? "reconciliation" : "reconciliations"}`} />}>
          {data.reconciliations.length === 0 ? (
            <TableEmpty title="Never reconciled">Start one from Reconciliations with the statement’s closing date and balance.</TableEmpty>
          ) : (
            <table className="table" aria-label="Reconciliations">
              <colgroup>
                <col />
                <col style={{ width: 160 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 120 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Statement</th>
                  <th className="num">Closing balance</th>
                  <th>Closed</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {data.reconciliations.map((row) => (
                  <tr key={row.id}>
                    <td className="fill truncate">
                      <Link href={`/books/reconciliations/${row.id}`} style={{ color: "var(--color-ink)" }}>
                        {row.period}
                      </Link>
                    </td>
                    <td className="num">{row.balance === null ? <span className="muted">—</span> : money(row.balance, c)}</td>
                    <td className="muted">{row.closed ?? "—"}</td>
                    <td>
                      <St word={row.state === "CLOSED" ? "Closed" : row.state === "VOIDED" ? "Void" : "Open"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TableShell>
      )}
    </Split>
  );
}
