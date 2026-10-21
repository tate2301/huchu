"use client";

import * as React from "react";
import Link from "next/link";

import { Icon, type IconName } from "@/components/core";
import { money } from "@/lib/books/format";
import type { MoneyBoard, MoneyShare, Urgency } from "@/lib/books/money-board-view";

import { BooksFinding } from "./figures";

/** A count's pill: red when money or a fine is held up today, amber when it is late, grey when routine. */
const TONE: Record<Urgency, string> = { urgent: "bad", routine: "warn", look: "" };

const plain = (n: number) => new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

/** Cents muted, the currency named once by the head that carries it. */
function Amount({ value, currency }: { value: number; currency?: string }) {
  const text = currency ? money(Math.abs(value), currency) : plain(Math.abs(value));
  const cut = text.lastIndexOf(".");
  return (
    <span className="num">
      {value < 0 ? "−" : ""}
      {text.slice(0, cut)}
      <i>{text.slice(cut)}</i>
    </span>
  );
}

function Head({ title, sum, end }: { title: string; sum?: React.ReactNode; end?: React.ReactNode }) {
  return (
    <div className="bkm-h">
      <h2>{title}</h2>
      {sum ? <span className="bkm-sum">{sum}</span> : null}
      {end ? <span className="bkm-end">{end}</span> : null}
    </div>
  );
}

function Flow({ rows, currency, tone }: { rows: MoneyShare[]; currency: string; tone: "in" | "out" }) {
  return (
    <>
      {rows.map((row) => (
        <div className={`bkm-flow ${tone}`} key={row.key}>
          <span className="bkm-fl">{row.label}</span>
          <Amount value={row.amount} currency={currency} />
          <span className="bkm-track">
            <i style={{ width: `${row.bar}%` }} />
          </span>
        </div>
      ))}
    </>
  );
}

/**
 * Books → Money: one line on how the month stands; Needs you and Coming up on
 * the left, with Bank and cash and You owe in an aside on the right; what is
 * owed to you by age across the full width; then Came in and Went out side by
 * side. Pure: the page feeds it.
 */
export function BkMoneyView({ data }: { data: MoneyBoard }) {
  const { bank, currency } = data;
  const half = Math.ceil(data.needs.length / 2);
  const ups = data.upcoming.rows;
  return (
    <div className="bkm">
      <BooksFinding finding={data.finding} />

      <div className="bkm-top">
        <div className="bkm-main">
          <section aria-labelledby="m1">
            <Head title="Needs you" sum={data.needs.filter((need) => need.count > 0).length || undefined} />
            <div className="bkm-needs" style={{ gridTemplateRows: `repeat(${half}, 36px)` }}>
              {data.needs.map((need) => (
                <Link className={`bkm-need ${need.count > 0 ? TONE[need.urgency] : ""}`} href={need.action.href} key={need.key}>
                  <Icon name={need.icon as IconName} />
                  <span className="bkm-nl">{need.lead}</span>
                  {need.detail ? <span className="bkm-nd">{need.detail}</span> : null}
                  {need.count > 0 ? <span className="bkm-n">{need.count}</span> : null}
                  <Icon name="chev" />
                </Link>
              ))}
            </div>
          </section>
          {ups.length > 0 ? (
            <section className="bkm-band" aria-labelledby="m2">
              <Head title="Coming up" sum={`to ${data.upcoming.until}`} />
              <div className="bkm-ups" style={{ gridTemplateRows: `repeat(${Math.ceil(ups.length / 2)}, 36px)` }}>
                {ups.map((row, index) => (
                  <div className={`bkm-up ${row.amount > 0 ? "in" : ""}`} key={`${row.day}-${index}`}>
                    <span className="mono">{shortDate(row.day)}</span>
                    <span className="bkm-ul">{row.label}</span>
                    <Amount value={row.amount} currency={currency} />
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="bkm-side" aria-label="Accounts and what you owe">
          <section>
            <Head title="Bank and cash" sum={bank.inBase === null ? undefined : <Amount value={bank.inBase} currency={bank.currencies[0]} />} end={bank.rateNote ? bank.rateNote.split(" to ")[0] : undefined} />
            {bank.accounts.length === 0 ? null : (
              <table className="bkm-acc" aria-label="Bank and cash">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Reconciled</th>
                    <th className="r">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {bank.accounts.map((account) => (
                    <tr key={account.id}>
                      <td>
                        <span className="bkm-who">
                          <Icon name={accountIcon(account.kind)} />
                          <span>{account.name}</span>
                          {account.currency !== bank.currencies[0] ? <b>{account.currency}</b> : null}
                        </span>
                      </td>
                      <td className={account.reconciled ? "muted" : "warn"}>{account.reconciled ?? "Never"}</td>
                      <td className="r">
                        <Amount value={account.inBase ?? account.amount} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section className="bkm-band">
            <Head title="You owe" sum={<Amount value={data.owe.total} currency={currency} />} />
            {[
              ["Suppliers", data.owe.suppliers],
              ["Staff claims", data.owe.claims],
              [data.owe.vatLabel, data.owe.vat],
            ]
              .filter(([, value]) => Number(value) > 0)
              .map(([label, value]) => (
                <div className="bkm-up bkm-owe" key={String(label)}>
                  <span className="bkm-ul">{label}</span>
                  <Amount value={Number(value)} currency={currency} />
                </div>
              ))}
          </section>
        </aside>
      </div>

      <section className="bkm-band" aria-labelledby="m3">
        <Head title="Owed to you, by age" sum={<Amount value={data.owed.total} currency={currency} />} end={data.owed.overdue > 0 ? <><Amount value={data.owed.overdue} currency={currency} /> late</> : undefined} />
        <div className="bkm-age">
          <div className="bkm-bar" role="img" aria-label={data.age.filter((bucket) => bucket.amount > 0).map((bucket) => `${bucket.label} ${money(bucket.amount, currency)}`).join(", ")}>
            {data.age.map((bucket, index) => (bucket.amount > 0 ? <i className={`a${index}`} style={{ flex: bucket.amount }} key={bucket.key} /> : null))}
          </div>
          <div className="bkm-al">
            {data.age.map((bucket, index) => (
              <span className={bucket.amount > 0 ? "" : "nil"} key={bucket.key}>
                <span className="bkm-an">
                  <i className={`a${index}`} />
                  {bucket.label}
                </span>
                <b>{bucket.amount > 0 ? <Amount value={bucket.amount} currency={currency} /> : "—"}</b>
                {bucket.amount > 0 ? <em>{bucket.share}%</em> : null}
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="bkm-pair bkm-band">
        <section aria-labelledby="m4">
          <Head title="Came in" sum={data.period} end={<Amount value={data.cameIn.total} currency={currency} />} />
          {data.cameIn.rows.length === 0 ? null : <Flow rows={data.cameIn.rows} currency={currency} tone="in" />}
        </section>
        <section aria-labelledby="m5">
          <Head title="Went out" sum={data.period} end={<Amount value={data.wentOut.total} currency={currency} />} />
          {data.wentOut.rows.length === 0 ? null : <Flow rows={data.wentOut.rows} currency={currency} tone="out" />}
        </section>
      </div>
    </div>
  );
}

function accountIcon(kind: string): IconName {
  if (kind === "Mobile money") return "payments";
  if (kind === "Cash") return "money";
  return "bank";
}

/** "Wed 7" from a stored day. */
function shortDate(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getUTCDay()]} ${date.getUTCDate()}`;
}
