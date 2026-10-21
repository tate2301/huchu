"use client";

import * as React from "react";
import Link from "next/link";

import { CiIcon, type CiName } from "@/components/books/icons/ci-icon";
import type {
  MoneyAccountKind,
  MoneyBoard,
} from "@/lib/books/money-board-view";

import { MoneyPhone } from "./money/money-phone";
import { NeedRow } from "./money/need-row";
import "./money/money.css";

import { Amt, BkFinding, BkLine, BkSectionHead, BkShareRow, None } from "./ui";

/** A money account's icon by its kind (bk0.mjs, ACCI). */
const ACCOUNT_ICON: Record<MoneyAccountKind, CiName> = {
  BANK: "bank",
  MOBILE: "mobile-money",
  CASH: "banknote",
};

/** A section's foot line (`.k-foot`): a pack icon and one fact. */
function Foot({ icon, children }: { icon: CiName; children: React.ReactNode }) {
  return (
    <p className="k-foot">
      <CiIcon name={icon} className="ic" />
      <span>{children}</span>
    </p>
  );
}

/** "Owed to you, by age" (`.k-age`): the bar, then each age with its colour and amount. */
function AgeBar({
  ages,
  currency,
}: {
  ages: MoneyBoard["owed"]["ages"];
  currency: string;
}) {
  const label = ages
    .filter((age) => age.amount > 0)
    .map((age) => `${age.label} ${age.amount.toFixed(2)}`)
    .join(", ");
  return (
    <div className="k-age">
      <div className="k-bar" role="img" aria-label={label || "Nothing owed"}>
        {ages.map((age, index) =>
          age.amount > 0 ? (
            <i
              key={age.label}
              className={`k-a${index}`}
              style={{ flex: age.amount }}
            />
          ) : null,
        )}
      </div>
      <div className="k-al">
        {ages.map((age, index) => (
          <span key={age.label}>
            <i className={`k-a${index}`} />
            {age.label}
            <b>
              {age.amount > 0 ? (
                <Amt value={age.amount} currency={currency} />
              ) : (
                "—"
              )}
            </b>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Books → Money (bk-money): am I all right, and what needs me, inside 1440 x
 * 900. The finding, then Needs you, Bank and cash and Coming up side by side,
 * then Came in and Went out, then Owed to you by age and You owe. Every row
 * opens its Books address. Pure: the page feeds it.
 */
export function BkMoneyView({ data }: { data: MoneyBoard }) {
  const { currency, bank, comingUp } = data;
  return (
    <>
      <MoneyPhone data={data} />
      <div className="k-desk">
        <BkFinding fact={data.finding.fact} rest={data.finding.rest} />
        <div className="k-grid3 k-band k-mtop">
          <section aria-label="Needs you">
            <BkSectionHead title="Needs you" sum={String(data.needs.length)} />
            <div>
              {data.needs.length ? (
                data.needs.map((need) => (
                  <NeedRow key={need.key} need={need} currency={currency} />
                ))
              ) : (
                <p className="k-foot">Nothing needs you.</p>
              )}
            </div>
          </section>
          <section aria-label="Bank and cash">
            <BkSectionHead
              title="Bank and cash"
              sum={
                bank.total != null ? (
                  <Amt value={bank.total} currency={currency} />
                ) : null
              }
            />
            {bank.accounts.length ? (
              <table className="bkt dense k-acc" aria-label="Bank and cash">
                <thead data-band="head">
                  <tr>
                    <th>Account</th>
                    <th>Reconciled</th>
                    <th className="r">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {bank.accounts.map((account) => (
                    <tr key={account.id} data-band="row">
                      <td>
                        <Link className="who" href={`/books/accounts/${account.id}`}>
                          <CiIcon
                            name={ACCOUNT_ICON[account.kind]}
                            className="ic k-ai"
                          />
                          {account.name}
                        </Link>
                        {account.currency !== currency ? (
                          <span className="mono k-cur">
                            {" "}
                            {account.currency}
                          </span>
                        ) : null}
                      </td>
                      <td className={account.reconciled ? "muted" : "k-warnt"}>
                        {account.reconciled ?? "Never"}
                      </td>
                      <td className="r">
                        {account.balance != null ? (
                          <Amt value={account.balance} currency={currency} />
                        ) : (
                          <None />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="k-foot">No money accounts yet.</p>
            )}
            {bank.rate ? (
              <Foot icon="exchange">
                {bank.rate.code} at{" "}
                <b className="mono">{bank.rate.rate.toFixed(2)}</b>,{" "}
                {bank.rate.source}, {bank.rate.when}
              </Foot>
            ) : null}
          </section>
          <section aria-label="Coming up">
            <BkSectionHead title="Coming up" sum={`to ${comingUp.until}`} />
            <div>
              {comingUp.lines.map((line, index) => (
                <BkLine
                  key={`${line.day}-${index}`}
                  when={line.when}
                  label={line.label}
                  amount={
                    line.amount != null ? (
                      <Amt value={line.amount} currency={currency} />
                    ) : (
                      <None />
                    )
                  }
                />
              ))}
            </div>
            {comingUp.payers ? (
              <Foot icon="bank">
                {comingUp.payers.names} hold{" "}
                <b>
                  <Amt value={comingUp.payers.now} currency={currency} />
                </b>{" "}
                now
                {comingUp.lines.length ? (
                  <>
                    , and{" "}
                    <b>
                      <Amt value={comingUp.payers.after} currency={currency} />
                    </b>{" "}
                    after all of this lands on {comingUp.until}.
                  </>
                ) : (
                  ". Nothing falls due before " + comingUp.until + "."
                )}
              </Foot>
            ) : null}
          </section>
        </div>
        <div className="k-grid2 k-band">
          <section aria-label="Came in">
            <BkSectionHead title="Came in" sum={data.period} />
            {data.cameIn.rows.map((row) => (
              <BkShareRow
                key={row.key}
                label={row.label}
                fact={row.fact}
                amount={<Amt value={row.amount} currency={currency} />}
                share={
                  data.cameIn.total > 0 ? row.amount / data.cameIn.total : 0
                }
              />
            ))}
          </section>
          <section aria-label="Went out">
            <BkSectionHead title="Went out" sum={data.period} />
            {data.wentOut.rows.map((row) => (
              <BkShareRow
                key={row.key}
                label={row.label}
                fact={row.fact}
                amount={<Amt value={row.amount} currency={currency} />}
                share={
                  data.wentOut.total > 0 ? row.amount / data.wentOut.total : 0
                }
              />
            ))}
          </section>
        </div>
        <div className="k-grid2 k-band">
          <section aria-label="Owed to you, by age">
            <BkSectionHead
              title="Owed to you, by age"
              sum={<Amt value={data.owed.total} currency={currency} />}
            />
            <AgeBar ages={data.owed.ages} currency={currency} />
          </section>
          <section aria-label="You owe">
            <BkSectionHead
              title="You owe"
              sum={<Amt value={data.owe.total} currency={currency} />}
            />
            <div>
              {data.owe.rows.map((row) => (
                <BkLine
                  key={row.label}
                  label={row.label}
                  amount={<Amt value={row.amount} currency={currency} />}
                />
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
