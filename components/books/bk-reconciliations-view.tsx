"use client";

import * as React from "react";
import Link from "next/link";

import { Button, TableFoot, TableShell } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { money } from "@/lib/books/format";
import type { RecTab, ReconciliationsPage } from "@/lib/books/reconciliations";

import { Lead, n2, Rail, RailSec, Split, St, TableEmpty } from "./bk-b";
import { BkChip, BkQuietTools, BkTabs, BkTools } from "./bk-list";
import { BooksFinding } from "./figures";

/**
 * Books → Bank & cash → Reconciliations (design/core-modules/boards/view/BkReconciliation.html):
 * each account's reconciliation against its statement, its difference, and,
 * for the one selected, the four figures, what clears the difference, and
 * Close, which stays off until the difference is 0.00. Reopen and Void are the
 * owner's, in the section's menu.
 */
export function BkReconciliationsView({
  data,
  q,
  account,
  onQuery,
  onSelect,
  onClose,
  closing,
  ownerMenu,
  exportHref,
}: {
  data: ReconciliationsPage;
  q: string;
  account: string | null;
  onQuery: (next: { tab?: RecTab; q?: string; account?: string | null }) => void;
  onSelect: (id: string) => void;
  onClose: () => void;
  closing: boolean;
  ownerMenu: MenuEntry[];
  exportHref: string;
}) {
  const sel = data.selected;
  const accountName = data.accounts.find((row) => row.id === account)?.label;
  return (
    <Split
      rail={
        sel ? (
          <Rail label={sel.account} width={380}>
            <RailSec
              title={sel.account}
              end={
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span className={sel.status === "CLOSED" ? "pill pill-success" : "pill pill-info"}>{sel.status === "CLOSED" ? "Closed" : "Open"}</span>
                  {ownerMenu.length ? <MenuButton variant="quiet" size="sm" iconOnly icon="more" iconEnd={undefined} align="end" label="More for this reconciliation" aria-label="More for this reconciliation" items={ownerMenu} /> : null}
                </span>
              }
              num
              rows={[
                [sel.statementEnd ? `Statement, ${sel.statementEnd}` : "Statement", sel.statementBalance === null ? "Not entered" : n2(sel.statementBalance)],
                ["In the books", n2(sel.bookBalance)],
                [`Unmatched, ${sel.unmatchedCount} ${sel.unmatchedCount === 1 ? "line" : "lines"}`, n2(sel.unmatchedSum)],
                ["Difference", <b key="d">{sel.difference === null ? "—" : n2(sel.difference)}</b>],
              ]}
            />
            <RailSec
              title={sel.status === "CLOSED" ? "Closed" : "What clears it"}
              num
              rows={
                sel.status === "CLOSED"
                  ? ([
                      ["Closed on", sel.closedAt ?? "—"],
                      ["By", sel.closedBy ?? "—"],
                    ] as Array<[string, React.ReactNode]>)
                  : sel.clears.length
                    ? sel.clears.slice(0, 4).map((line) => [line.what, n2(line.amount)] as [string, string])
                    : [[sel.blocker ?? "Nothing is left to match", ""]]
              }
              after={
                sel.status === "OPEN" ? (
                  <>
                    <Link className="btn" href={`/books/bank?account=${sel.accountId}`}>
                      Open To match
                    </Link>
                    <Button icon="check" shortcut="Ctrl ↵" disabled={!sel.canClose || closing} busy={closing} title={sel.canClose ? undefined : (sel.blocker ?? undefined)} onClick={onClose}>
                      Close
                    </Button>
                  </>
                ) : null
              }
            />
          </Rail>
        ) : (
          <Rail label="Reconciliation" width={380}>
            <RailSec title="Nothing selected" rows={[["Choose a reconciliation", ""]]} />
          </Rail>
        )
      }
    >
      <BooksFinding finding={data.finding} />
      <BkTabs
        label="Reconciliations"
        value={data.tab}
        onChange={(tab) => onQuery({ tab })}
        items={[
          { value: "open", label: "Open", count: data.counts.open },
          { value: "closed", label: "Closed", count: data.counts.closed },
        ]}
      />
      <BkTools
        find="Search reconciliations"
        query={q}
        onFind={(next) => onQuery({ q: next })}
        chips={
          <BkChip
            label="Account"
            value={accountName ?? "Any"}
            set={Boolean(accountName)}
            items={[{ key: "any", label: "Any", checked: !account, onSelect: () => onQuery({ account: null }) }, { separator: true }, ...data.accounts.map((row) => ({ key: row.id, label: row.label, checked: row.id === account, onSelect: () => onQuery({ account: row.id }) }))]}
          />
        }
        count={`${data.rows.length} ${data.tab === "open" ? "open" : "closed"}`}
        end={<BkQuietTools exportHref={exportHref} />}
      />
      <TableShell label="Reconciliations" foot={<TableFoot range={`${data.counts.open} open`} sums={[{ label: "Closed this year", value: String(data.closedThisYear) }]} />}>
        {data.rows.length === 0 ? (
          <TableEmpty title={data.tab === "open" ? "Nothing open" : "None closed yet"}>{data.tab === "open" ? "Start one with the statement’s closing date and balance." : "A reconciliation closes when its difference is 0.00."}</TableEmpty>
        ) : (
          <table className="table" aria-label="Reconciliations">
            <colgroup>
              <col />
              <col style={{ width: 160 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 150 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Account</th>
                <th className="num">Closing balance</th>
                <th className="num">Unmatched</th>
                <th className="num">Difference</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id} className={sel?.id === row.id ? "bk-sel" : undefined} onClick={() => onSelect(row.id)} style={{ cursor: "pointer" }}>
                  <td className="fill truncate">
                    <Lead sub={row.state === "closed" ? `${row.period}, closed ${row.closed}` : row.period}>
                      <Link href={`/books/reconciliations/${row.id}`} style={{ color: "var(--color-ink)" }} onClick={(event) => event.stopPropagation()}>
                        {row.account}
                      </Link>
                    </Lead>
                  </td>
                  <td className="num muted">{row.closingBalance === null ? "—" : money(row.closingBalance, row.currency)}</td>
                  <td className="num">{row.unmatched ? row.unmatched : <span className="muted">0</span>}</td>
                  <td className="num">{row.difference === null ? <span className="muted">—</span> : row.state === "open" ? <b style={{ color: "var(--color-ink)" }}>{money(row.difference, row.currency)}</b> : <span className="muted">{money(row.difference, row.currency)}</span>}</td>
                  <td>{row.state === "closed" ? <St word="Closed" /> : row.state === "ready" ? <St word="Ready to close" /> : <St word="Open" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableShell>
    </Split>
  );
}

