"use client";

import * as React from "react";
import Link from "next/link";

import { CiIcon } from "@/components/books/icons/ci-icon";
import type { MoneyBoard, MoneyNeed } from "@/lib/books/money-board-view";
import { money } from "@/lib/books/format";

import { Amt, BkFinding, BkSectionHead, None } from "../ui";

import { NeedRow } from "./need-row";

/** The rows the phone keeps: what needs the owner today, in the board's order (bk-p-money). */
const PHONE_NEEDS: ReadonlyArray<MoneyNeed["key"]> = ["overdue", "approve", "bill-limit", "posting", "bank"];

/**
 * Books → Money on the phone (bk-p-money): the owner on the move. The month in
 * one line, what needs them, the bank and cash, the week ahead, and New
 * invoice at the foot.
 */
export function MoneyPhone({ data }: { data: MoneyBoard }) {
  const { currency, bank, comingUp } = data;
  const needs = data.needs.filter((need) => PHONE_NEEDS.includes(need.key));
  const cash = bank.accounts.filter((account) => account.kind === "CASH");
  const week = comingUp.lines.filter((line) => line.day <= comingUp.weekEnd).slice(0, 4);
  return (
    <div className="bkd sc-p-money k-phone">
      <div className="m">
        <div className="m-b">
          <BkFinding
            fact={`${money(data.cameIn.total, currency)} in this month.`}
            rest={data.owed.total > 0 ? `${money(data.owed.total, currency)} owed to you${data.owed.overdue > 0 ? `, ${money(data.owed.overdue, currency)} of it late` : ""}.` : "Nobody owes you anything."}
          />
          <section aria-label="Needs you">
            <BkSectionHead title="Needs you" sum={String(needs.length)} />
            {needs.map((need) => (
              <NeedRow key={need.key} need={need} currency={currency} withFact={false} />
            ))}
          </section>
          <section aria-label="Bank and cash">
            <BkSectionHead title="Bank and cash" sum={bank.total != null ? <Amt value={bank.total} currency={currency} /> : null} />
            {bank.accounts
              .filter((account) => account.kind !== "CASH")
              .map((account) => (
                <Link key={account.id} className="k-pr" href={`/books/accounts/${account.id}`}>
                  <span>{account.name}</span>
                  <Amt value={account.native} currency={account.currency} />
                </Link>
              ))}
            {cash.length ? (
              <Link className="k-pr" href="/books/accounts">
                <span>Cash, {cash.length === 1 ? "1 float" : `${cash.length} floats`}</span>
                <Amt value={cash.reduce((sum, account) => sum + (account.balance ?? 0), 0)} currency={currency} />
              </Link>
            ) : null}
          </section>
          {week.length ? (
            <section aria-label="This week">
              <BkSectionHead title="This week" />
              {week.map((line, index) => (
                <div key={`${line.day}-${index}`} className="k-pr">
                  <span>
                    <span className="mono muted">{line.when}</span> {line.label.split(",")[0]}
                  </span>
                  {line.amount != null ? <Amt value={line.amount} currency={currency} /> : <None />}
                </div>
              ))}
            </section>
          ) : null}
        </div>
        <div className="m-f">
          <Link className="btn btn-primary" href="/books/invoices/new">
            <CiIcon name="plus" className="ic" />
            New invoice
          </Link>
        </div>
      </div>
    </div>
  );
}
