"use client";

import * as React from "react";
import Link from "next/link";

import { Button, Icon } from "@/components/core";
import { money } from "@/lib/books/format";
import type { RatesTab } from "@/lib/books/rates-labels";
import type { RateRow, RatesPage } from "@/lib/books/rates-page";

import { n2 } from "./bk-b";
import { BkChip, BkTabs, BkTools } from "./bk-list";
import { BooksFinding, Cents } from "./figures";

/** "ZWG 12,393.66": a figure in its own currency, its cents muted. */
function Held({ value, currency }: { value: number; currency: string }) {
  const text = n2(value);
  const cut = text.lastIndexOf(".");
  return (
    <span className="num">
      {currency} {text.slice(0, cut)}
      <i style={{ fontStyle: "normal", color: "var(--color-muted)" }}>{text.slice(cut)}</i>
    </span>
  );
}

const perBase = (base: string) => (base === "USD" ? "US$" : base);

/** The rates, as the design's table draws them: date, source, when it came in, the rate. */
function RateTable({ rows, currency, base, removable, onRemove }: { rows: RateRow[]; currency: string; base: string; removable: boolean; onRemove: (row: RateRow) => void }) {
  return (
    <div className="bkd-wrap">
      <table className="table bkd" aria-label="Rates">
        <colgroup>
          <col style={{ width: 180 }} />
          <col />
          <col style={{ width: 160 }} />
          <col style={{ width: 160 }} />
          {removable ? <col style={{ width: 120 }} /> : null}
        </colgroup>
        <thead>
          <tr>
            <th>Date</th>
            <th>Source</th>
            <th>Fetched</th>
            <th className="num">
              {currency} per {perBase(base)}
            </th>
            {removable ? <th /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="muted">{row.date}</td>
              <td>
                {row.source === "MANUAL" ? "Typed in" : "RBZ interbank"}
                {row.source === "MANUAL" && row.by ? <span className="bkc-sub">{row.by}</span> : null}
              </td>
              <td className="muted">{row.time || "—"}</td>
              <td className="num mono">{row.rate.toFixed(2)}</td>
              {removable ? (
                <td style={{ textAlign: "right" }}>
                  {row.source === "MANUAL" ? (
                    <Button variant="quiet" size="sm" onClick={() => onRemove(row)}>
                      Remove
                    </Button>
                  ) : null}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Books → Close the month → Rates & revaluation (design/books/html/bk-rates.html).
 * Revaluation: what each balance held in another currency is worth at the
 * month-end rate, against the rates it was booked at, with the gain or loss
 * posted on the last day and reversed on the 1st; under it the latest rates.
 * Rates: every rate the documents freeze.
 */
export function BkRatesView({
  data,
  q,
  onQuery,
  onRemove,
  onReverse,
  exportHref,
}: {
  data: RatesPage;
  q: string;
  onQuery: (next: { tab?: RatesTab; currency?: string; page?: number; q?: string }) => void;
  onRemove: (row: RateRow) => void;
  onReverse: () => void;
  exportHref: string;
}) {
  const base = data.baseCurrency;
  const plan = data.plan;
  const { from, to, of, page } = data.range;
  const needle = q.trim().toLowerCase();
  const rows = needle ? data.rows.filter((row) => `${row.date} ${row.by ?? ""} ${row.source}`.toLowerCase().includes(needle)) : data.rows;
  const rates = plan ? Object.entries(plan.rates) : [];
  const rateHead = plan ? (rates.length === 1 ? `At ${rates[0][1].toFixed(2)}, ${plan.date.slice(8).replace(/^0/, "")} ${plan.label.slice(0, 3)}` : `At the rates of ${plan.date.slice(8).replace(/^0/, "")} ${plan.label.slice(0, 3)}`) : "At month end";
  const finding =
    data.tab === "revaluation" && plan
      ? {
          fact: Math.abs(plan.gain) < 0.005 ? `${plan.label}’s revaluation: no gain or loss.` : `${plan.label}’s revaluation: ${plan.gain > 0 ? "a gain" : "a loss"} of ${money(Math.abs(plan.gain), base)}.`,
          rest: plan.posted ? `Posted ${plan.posted.date}. Reverses on ${plan.reverses}.` : plan.missingRates.length ? `No ${plan.missingRates.join(", ")} rate for ${plan.date}.` : `Not posted yet. Reverses on ${plan.reverses}.`,
        }
      : data.finding;
  return (
    <div className="bk bkc">
      <BooksFinding finding={finding} />
      <BkTabs
        label="Rates and revaluation"
        value={data.tab}
        onChange={(tab) => onQuery({ tab })}
        items={[
          { value: "rates", label: "Rates" },
          { value: "revaluation", label: "Revaluation" },
        ]}
      />
      {data.tab === "revaluation" ? (
        <>
          <div className="bkd-wrap">
            <table className="table bkd" aria-label="Revaluation">
              <colgroup>
                <col />
                <col style={{ width: 110 }} />
                <col style={{ width: 170 }} />
                <col style={{ width: 170 }} />
                <col style={{ width: 190 }} />
                <col style={{ width: 150 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Balance</th>
                  <th>Currency</th>
                  <th className="num">Held</th>
                  <th className="num">At booked rates</th>
                  <th className="num">{rateHead}</th>
                  <th className="num">Gain or loss</th>
                </tr>
              </thead>
              <tbody>
                {plan && plan.items.length > 0 ? (
                  plan.items.map((item) => (
                    <tr key={`${item.kind}:${item.label}`}>
                      <td>
                        <span className="cell-lead">{item.label}</span>
                      </td>
                      <td className="mono">{item.currency}</td>
                      <td className="num">
                        <Held value={item.balance} currency={item.currency} />
                      </td>
                      <td className="num">
                        <Cents value={item.carryingBase} currency={base} />
                      </td>
                      <td className="num">
                        <Cents value={item.revaluedBase} currency={base} />
                      </td>
                      <td className="num">{Math.abs(item.gain) < 0.005 ? <span className="muted">—</span> : <Cents value={item.gain} currency={base} />}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="muted">
                      {plan && plan.missingRates.length ? `No ${plan.missingRates.join(", ")} rate for ${plan.date}` : "Nothing is held in another currency"}
                    </td>
                  </tr>
                )}
              </tbody>
              {plan && plan.items.length > 0 ? (
                <tfoot>
                  <tr>
                    <td colSpan={5}>
                      {plan.posted ? (
                        <>
                          Posted as {plan.posted.entry}
                          <Link className="btn btn-quiet" href={`/books/journals?q=${encodeURIComponent(plan.posted.entry)}`} style={{ marginLeft: 8 }}>
                            <Icon name="list" />
                            See the lines
                          </Link>
                          <Button variant="quiet" icon="x" onClick={onReverse}>
                            Reverse
                          </Button>
                        </>
                      ) : (
                        "Not posted"
                      )}
                    </td>
                    <td className="num">
                      <Cents value={plan.gain} currency={base} />
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
          {data.rows.length > 0 ? (
            <>
              <div className="bkc-band">
                <h2>Latest rates</h2>
                <span className="bkc-sum">RBZ interbank</span>
              </div>
              <RateTable rows={data.rows.slice(0, 5)} currency={data.currency} base={base} removable={false} onRemove={onRemove} />
            </>
          ) : null}
        </>
      ) : (
        <>
          {data.currencies.length > 1 ? (
            <BkTools
              find="Search rates"
              query={q}
              onFind={(next) => onQuery({ q: next })}
              chips={<BkChip label="Currency" value={data.currency} set items={data.currencies.map((currency) => ({ key: currency, label: currency, checked: currency === data.currency, onSelect: () => onQuery({ currency, page: 1 }) }))} />}
              count={`${of} ${of === 1 ? "day" : "days"}`}
              end={<a className="btn btn-quiet" href={exportHref} download><Icon name="export" />Export</a>}
            />
          ) : null}
          {rows.length === 0 ? (
            <div className="bkc-list">
              <div className="bkc-ck">
                <span className="bkc-t">
                  <b>No {data.currency} rate yet</b>
                </span>
              </div>
            </div>
          ) : (
            <RateTable rows={rows} currency={data.currency} base={base} removable onRemove={onRemove} />
          )}
          {page > 1 || to < of ? (
            <div className="bkc-band">
              <span className="bkc-sum" style={{ marginLeft: 0 }}>{`${from}–${to} of ${of}`}</span>
              <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <Button variant="quiet" disabled={page <= 1} onClick={() => onQuery({ page: page - 1 })}>
                  Newer
                </Button>
                <Button variant="quiet" disabled={to >= of} onClick={() => onQuery({ page: page + 1 })}>
                  Older
                </Button>
              </span>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
