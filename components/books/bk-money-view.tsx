"use client";

import * as React from "react";

import { Avatars, ButtonLink, Icon, type IconName } from "@/components/core";
import { money } from "@/lib/books/format";
import type { MoneyBoard, MoneyShare, Urgency } from "@/lib/books/money-board-view";

import { BooksFinding } from "./figures";

/** Ink when money or a fine is held up today, plain when routine, quiet when it is only a look (calm rule 9). */
const WEIGHT: Record<Urgency, "ink" | "default" | "quiet"> = { urgent: "ink", routine: "default", look: "quiet" };

const plain = (n: number) => new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function Shares({ rows, currency, empty }: { rows: MoneyShare[]; currency: string; empty: string }) {
  if (rows.length === 0) return <p className="muted" style={{ padding: "0 var(--space-24)", fontSize: "var(--text-14)" }}>{empty}</p>;
  return (
    <div className="bk-shares">
      {rows.map((row) => (
        <div className="share" key={row.key}>
          <span className="bk-ic">
            <Icon name={row.icon as IconName} />
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "var(--space-12)", minWidth: 0 }}>
            <span className="sh-n">{row.label}</span>
            <span className="grow">
              <span className="bar" style={{ display: "block", width: `${row.bar}%` }} />
            </span>
          </span>
          <span className="num pct">{row.share}%</span>
          <span className="num">{money(row.amount, currency)}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Books → Money (design/core-modules/boards/view/BkMoney.html): the month in two
 * sentences, the tax coming due, what needs a person with its button weighted by
 * how urgent it is, where the money came from and went, every money account side
 * by side, and on the right what is owed either way. Pure: the page feeds it.
 */
export function BkMoneyView({ data }: { data: MoneyBoard }) {
  const { bank, currency } = data;
  return (
    <div className="mny">
      <div className="mny-main">
        <BooksFinding finding={data.finding} />
        <div className="bk-strip" aria-label="Tax due">
          <div className="kstrip" style={{ gridTemplateColumns: "repeat(4,minmax(0,1fr))" }}>
            {data.tax.map((tile) => (
              <div className="kt" key={tile.label}>
                <span className="kt-l">{tile.label}</span>
                <span className="kt-v">{tile.value}</span>
                <span className="kt-n">{tile.note}</span>
              </div>
            ))}
          </div>
        </div>

        <section aria-labelledby="m1">
          <div className="group-head">
            <h2 id="m1">Needs you</h2>
            <span className="sum">{data.needs.length}</span>
          </div>
          <div className="list">
            {data.needs.map((need) => (
              <div className="row need" key={need.key}>
                <span className="bk-ic">
                  <Icon name={need.icon as IconName} />
                </span>
                <div className="t">
                  <span className="lead">{need.lead}</span>
                  <span className="d">
                    {need.people?.length ? (
                      <span style={{ marginRight: 8 }}>
                        <Avatars people={need.people} />
                      </span>
                    ) : null}
                    {need.detail}
                  </span>
                </div>
                <div className="a">
                  <ButtonLink href={need.action.href} icon={need.action.icon as IconName} variant={WEIGHT[need.urgency]}>
                    {need.action.label}
                  </ButtonLink>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="m2">
          <div className="group-head">
            <h2 id="m2">Where it came from</h2>
            <span className="sum">
              {data.period} · {money(data.cameIn.total, currency)}
            </span>
          </div>
          <Shares rows={data.cameIn.rows} currency={currency} empty="Nothing has come in this month yet." />
        </section>

        <section aria-labelledby="m3">
          <div className="group-head">
            <h2 id="m3">Where it went</h2>
            <span className="sum">
              {data.period} · {money(data.wentOut.total, currency)}
            </span>
          </div>
          <Shares rows={data.wentOut.rows} currency={currency} empty="Nothing has gone out this month yet." />
        </section>

        <section aria-labelledby="m4">
          <div className="group-head">
            <h2 id="m4">Bank and cash</h2>
            <span className="sum">{bank.accounts.length === 1 ? "1 account" : `${bank.accounts.length} accounts`}</span>
          </div>
          {bank.accounts.length === 0 ? (
            <p className="muted" style={{ padding: "0 var(--space-24)", fontSize: "var(--text-14)" }}>
              No money accounts yet. Add the bank, mobile money and cash accounts in Accounts.
            </p>
          ) : (
            <>
              <div className="bk-bleed">
                <table className="table" aria-label="Bank and cash">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Kind</th>
                      {bank.currencies.map((code) => (
                        <th className="num" key={code}>
                          {code === "USD" ? "US$" : code === "ZWG" ? "ZiG" : code}
                        </th>
                      ))}
                      <th>Reconciled</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bank.accounts.map((account) => (
                      <tr key={account.id}>
                        <td>
                          <span className="cell-lead">{account.name}</span>
                        </td>
                        <td className="muted">{account.kind}</td>
                        {bank.currencies.map((code) => (
                          <td className="num" key={code}>
                            {account.currency === code ? plain(account.amount) : ""}
                          </td>
                        ))}
                        <td className="muted">{account.reconciled ?? "Not yet"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="tot">
                      <td>In all</td>
                      <td />
                      {bank.currencies.map((code) => (
                        <td className="num" key={code}>
                          {plain(bank.totals[code] ?? 0)}
                        </td>
                      ))}
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              {bank.inBase !== null && bank.rateNote ? (
                <p className="bk-note">
                  <Icon name="bank" />
                  <span>
                    <b style={{ fontWeight: 600, color: "var(--color-ink)" }}>{money(bank.inBase, bank.currencies[0])}</b> in all, with {bank.rateNote}.
                  </span>
                </p>
              ) : null}
            </>
          )}
        </section>
      </div>

      <aside className="rail mny-side" aria-label="Position">
        <section>
          <div className="sec-title">Owed to you</div>
          <div className="figure">{money(data.owed.total, currency)}</div>
          <dl className="attrs">
            <dt>Not yet due</dt>
            <dd className="num">{money(data.owed.notDue, currency)}</dd>
            <dt>Overdue</dt>
            <dd className="num">{money(data.owed.overdue, currency)}</dd>
            <dt>On account</dt>
            <dd className="num">{money(data.owed.onAccount, currency)}</dd>
          </dl>
        </section>
        <section>
          <div className="sec-title">You owe</div>
          <div className="figure">{money(data.owe.total, currency)}</div>
          <dl className="attrs">
            <dt>Suppliers</dt>
            <dd className="num">{money(data.owe.suppliers, currency)}</dd>
            <dt>Staff claims</dt>
            <dd className="num">{money(data.owe.claims, currency)}</dd>
            <dt>{data.owe.vatLabel}</dt>
            <dd className="num">{money(data.owe.vat, currency)}</dd>
          </dl>
        </section>
      </aside>
    </div>
  );
}
