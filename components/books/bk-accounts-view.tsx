"use client";

import * as React from "react";
import Link from "next/link";

import { TableFoot, TableShell } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import type { AccountRow, AccountsPage } from "@/lib/books/bank-accounts";
import { KIND_LABEL, type AccountKindKey } from "@/lib/books/bank-labels";
import { money } from "@/lib/books/format";

import { Lead, TableEmpty } from "./bk-b";
import { BkQuietTools, BkTabs, BkTools } from "./bk-list";
import { BooksFinding } from "./figures";

const KINDS: AccountKindKey[] = ["bank", "mobile", "cash"];

/**
 * Books → Bank & cash → Accounts (design/core-modules/boards/view/BkAccounts.html):
 * every money account by kind, its balance in its own currency and in US
 * dollars, when it was last reconciled and the lines waiting to be matched.
 */
export function BkAccountsView({
  data,
  view,
  q,
  onQuery,
  exportHref,
  more,
}: {
  data: AccountsPage;
  view: "all" | AccountKindKey;
  q: string;
  onQuery: (next: { view?: "all" | AccountKindKey; q?: string }) => void;
  exportHref: string;
  more: (row: AccountRow) => MenuEntry[];
}) {
  const base = data.baseCurrency;
  const groups = KINDS.map((kind) => ({ kind, rows: data.rows.filter((row) => row.kind === kind) })).filter((group) => group.rows.length);
  return (
    <div className="bk">
      <BooksFinding finding={data.finding} />
      <BkTabs
        label="Account kinds"
        value={view}
        onChange={(next) => onQuery({ view: next })}
        items={[
          { value: "all", label: "All", count: data.counts.all },
          { value: "bank", label: "Bank", count: data.counts.bank },
          { value: "mobile", label: "Mobile money", count: data.counts.mobile },
          { value: "cash", label: "Cash", count: data.counts.cash },
        ]}
      />
      <BkTools find="Search accounts" query={q} onFind={(next) => onQuery({ q: next })} count={`${data.rows.length} ${data.rows.length === 1 ? "account" : "accounts"}`} end={<BkQuietTools exportHref={exportHref} />} />
      <TableShell
        label="Accounts"
        foot={
          <TableFoot
            range={`${data.rows.length} ${data.rows.length === 1 ? "account" : "accounts"}`}
            sums={[{ label: `In ${base === "USD" ? "USD" : base}`, value: money(data.sums.inBase, base) }, ...data.sums.byCurrency.map((row) => ({ label: row.currency === "ZWG" ? "ZiG" : row.currency, value: money(row.total, row.currency) }))]}
            end={data.rateNote ? <span className="muted">{data.rateNote}</span> : undefined}
          />
        }
      >
        {data.rows.length === 0 ? (
          <TableEmpty title={q ? "No account matches" : "No money accounts yet"}>{q ? "Clear the search to see the rest." : "Money accounts are set up in Management › Company › Money accounts."}</TableEmpty>
        ) : (
          <table className="table" aria-label="Accounts">
            <colgroup>
              <col />
              <col style={{ width: 160 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 56 }} />
            </colgroup>
            <thead>
              <tr>
                <th className="fill">Account</th>
                <th className="num">Balance</th>
                <th className="num">In USD</th>
                <th>Last reconciled</th>
                <th className="num">To match</th>
                <th className="acts" />
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <React.Fragment key={group.kind}>
                  <tr className="grp">
                    <td colSpan={6}>
                      {KIND_LABEL[group.kind]}
                      <span className="n">{group.rows.length}</span>
                    </td>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={row.id}>
                      <td className="fill" style={{ height: 52 }}>
                        <Lead sub={row.sub}>
                          <Link href={`/books/accounts/${row.id}`} style={{ color: "var(--color-ink)" }}>
                            {row.name}
                          </Link>
                        </Lead>
                      </td>
                      <td className="num">{money(row.balance, row.currency)}</td>
                      <td className="num">{row.inBase === null ? <span className="muted">—</span> : money(row.inBase, base)}</td>
                      <td>
                        <span className="muted">{row.lastReconciled ?? (row.kind === "cash" ? "Counted, not reconciled" : "Never")}</span>
                      </td>
                      <td className="num">{row.toMatch ? <span className="chip-n">{row.toMatch}</span> : <span className="muted">—</span>}</td>
                      <td className="acts">
                        <MenuButton variant="quiet" iconOnly icon="more" iconEnd={undefined} align="end" label={`More for ${row.name}`} aria-label={`More for ${row.name}`} items={more(row)} />
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </TableShell>
    </div>
  );
}
