"use client";

import * as React from "react";
import Link from "next/link";

import { Icon, type IconName } from "@/components/core";
import { money } from "@/lib/books/format";
import type { MoneyView, NeedsYou } from "@/lib/books/money";

import { BooksFinding } from "./figures";

const SOURCE_ICON: Record<MoneyView["sources"][number]["key"], IconName> = { tills: "takings", invoices: "invoice", fees: "payments" };
const NEED_ICON: Record<NeedsYou["key"], IconName> = { "cash-up": "takings", "won-deal": "target", overdue: "invoice", bank: "bank" };
const NEED_ACTION_ICON: Record<NeedsYou["key"], IconName> = { "cash-up": "eye", "won-deal": "docs", overdue: "remind", bank: "match" };

function Sources({ data, compact }: { data: MoneyView; compact: boolean }) {
  if (data.sources.length === 0) {
    return <p className="muted" style={{ padding: "0 var(--space-24)" }}>Nothing has come in yet.</p>;
  }
  return (
    <div style={{ padding: "0 var(--space-24)" }}>
      {data.sources.map((source) => (
        <div className="share" key={source.key}>
          <span className="nt">
            <Icon name={SOURCE_ICON[source.key]} />
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "var(--space-12)" }}>
            {compact ? (
              <span style={{ width: 140, color: "var(--color-ink)" }}>{source.label}</span>
            ) : (
              <span style={{ width: 240 }}>
                <span style={{ color: "var(--color-ink)" }}>{source.label}</span>{" "}
                <span className="muted" style={{ fontSize: "var(--text-13)" }}>
                  {source.detail}
                </span>
              </span>
            )}
            <span className="grow">
              <span className="bar" style={{ display: "block", width: `${source.bar}%` }} />
            </span>
          </span>
          <span className="num pct">{source.share}%</span>
          <span className="num">{money(source.amount, data.currency)}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Books → Money (design/core-modules/html/books-money.html, and books-vane.html
 * with the Vane panel open): the finding, where the money came from, what
 * needs a person, and the bank and what is owed out. With Vane open, Needs you
 * is Vane's to show and the position folds into one list.
 */
export function MoneyPageView({ data, vaneOpen, vane }: { data: MoneyView; vaneOpen: boolean; vane?: React.ReactNode }) {
  const accounts = data.bank.accounts;
  if (vaneOpen) {
    return (
      <div className="ba" style={vane ? undefined : { gridTemplateColumns: "minmax(0,1fr)" }}>
        <div className="mny-main">
          <BooksFinding finding={data.finding} />
          <section aria-labelledby="m0">
            <div className="group-head">
              <h2 id="m0">Where it came from</h2>
              <span className="sum">{data.period}</span>
            </div>
            <Sources data={data} compact />
          </section>
          <section aria-labelledby="m2">
            <div className="group-head">
              <h2 id="m2">In the bank</h2>
              {data.bank.asOf ? <span className="sum">{data.bank.asOf}</span> : null}
            </div>
            <div className="list">
              {accounts.map((account) => (
                <div className="row" key={account.id}>
                  <span className="grow">{account.name}</span>
                  <span className="num" style={{ color: "var(--color-ink)" }}>
                    {money(account.amount, account.currency)}
                  </span>
                </div>
              ))}
              {data.owe.rows.map((row) => (
                <div className="row" key={row.label}>
                  <span className="grow">
                    {row.label.startsWith("VAT, ")
                      ? `VAT for ${row.label.slice(5)}${data.owe.vatDue ? `, due ${data.owe.vatDue}` : ""}`
                      : `You owe ${row.label}`}
                  </span>
                  <span className="num" style={{ color: "var(--color-ink)" }}>
                    {money(row.amount, row.currency)}
                  </span>
                </div>
              ))}
              {accounts.length === 0 && data.owe.rows.length === 0 ? (
                <div className="row">
                  <span className="grow muted">No bank account yet. Add one in Banking.</span>
                </div>
              ) : null}
            </div>
          </section>
        </div>
        {vane}
      </div>
    );
  }

  return (
    <div className="mny">
      <div className="mny-main">
        <BooksFinding finding={data.finding} />
        <section aria-labelledby="m0">
          <div className="group-head">
            <h2 id="m0">Where it came from</h2>
            <span className="sum">{data.period}</span>
          </div>
          <Sources data={data} compact={false} />
        </section>
        <section aria-labelledby="m1">
          <div className="group-head">
            <h2 id="m1">Needs you</h2>
            <span className="sum">{data.needs.length}</span>
          </div>
          <div className="list">
            {data.needs.length === 0 ? (
              <div className="row">
                <span className="muted">Nothing needs you.</span>
              </div>
            ) : (
              data.needs.map((need) => (
                <div className="row need" key={need.key}>
                  <span className="nt">
                    <Icon name={NEED_ICON[need.key]} />
                  </span>
                  <div className="t">
                    <span className="lead">{need.lead}</span>
                    <span className="d">{need.detail}</span>
                  </div>
                  <div className="a">
                    <Link className="btn" href={need.action.href}>
                      <Icon name={NEED_ACTION_ICON[need.key]} />
                      {need.action.label}
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
      <aside className="rail mny-side" aria-label="Position">
        <section>
          <div className="sec-title">In the bank</div>
          {accounts.length === 0 ? (
            <p className="muted">No bank account yet.</p>
          ) : (
            <>
              {data.bank.total !== null ? <div className="figure">{money(data.bank.total, data.currency)}</div> : null}
              <dl className="attrs">
                {accounts.map((account) => (
                  <React.Fragment key={account.id}>
                    <dt>{account.name}</dt>
                    <dd className="num">{money(account.amount, account.currency)}</dd>
                  </React.Fragment>
                ))}
                {data.bank.asOf ? (
                  <>
                    <dt>As of</dt>
                    <dd>{data.bank.asOf}</dd>
                  </>
                ) : null}
              </dl>
            </>
          )}
        </section>
        <section>
          <div className="sec-title">You owe</div>
          {data.owe.rows.length === 0 ? (
            <p className="muted">Nothing.</p>
          ) : (
            <dl className="attrs">
              {data.owe.rows.map((row) => (
                <React.Fragment key={row.label}>
                  <dt>{row.label}</dt>
                  <dd className="num">{money(row.amount, row.currency)}</dd>
                </React.Fragment>
              ))}
              {data.owe.vatDue ? (
                <>
                  <dt>VAT is due</dt>
                  <dd>{data.owe.vatDue}</dd>
                </>
              ) : null}
            </dl>
          )}
        </section>
      </aside>
    </div>
  );
}
