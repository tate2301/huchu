"use client";

import * as React from "react";

import { Button, Person, TableFoot, TableShell } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { money } from "@/lib/books/format";
import type { RatesTab } from "@/lib/books/rates-labels";
import type { RateRow, RatesPage } from "@/lib/books/rates-page";

import { Lead, n2, Rail, RailSec, Split, St, TableEmpty } from "./bk-b";
import { BkChip, BkQuietTools, BkTabs, BkTools } from "./bk-list";
import { BooksFinding } from "./figures";

const code = (currency: string) => currency;

/**
 * Books → Close the month → Rates & revaluation (design/core-modules/boards/view/BkRates.html):
 * the rates with their source and who typed them; the month's revaluation in
 * the rail, posted on the last day and reversed on the 1st.
 */
export function BkRatesView({
  data,
  q,
  onQuery,
  onPost,
  posting,
  planMenu,
  rateMenu,
  exportHref,
}: {
  data: RatesPage;
  q: string;
  onQuery: (next: { tab?: RatesTab; currency?: string; page?: number; q?: string }) => void;
  onPost: () => void;
  posting: boolean;
  planMenu: MenuEntry[];
  rateMenu: (row: RateRow) => MenuEntry[];
  exportHref: string;
}) {
  const base = data.baseCurrency;
  const plan = data.plan;
  const { from, to, of, page } = data.range;
  const needle = q.trim().toLowerCase();
  const rows = needle ? data.rows.filter((row) => `${row.date} ${row.by ?? ""} ${row.source}`.toLowerCase().includes(needle)) : data.rows;
  const items = plan ? plan.items.slice(0, 2) : [];
  return (
    <Split
      rail={
        <Rail label="The revaluation" width={360}>
          {plan ? (
            <RailSec
              title={`${plan.label}’s revaluation`}
              end={plan.posted ? <span className="pill pill-success">Posted</span> : undefined}
              figure={money(plan.gain, base)}
              num
              rows={[
                [`At ${plan.date.slice(8).replace(/^0/, "")} ${plan.label.slice(0, 3)}`, plan.monthEndRate ? plan.monthEndRate.toFixed(2) : plan.missingRates.length ? "No rate" : "—"],
                ...items.map((item) => [item.label, n2(item.gain)] as [string, string]),
                ...(items.length === 0 ? ([["Balances in other currencies", "None"]] as Array<[string, string]>) : []),
                ["Reverses", plan.reverses],
              ].slice(0, 4) as Array<[string, string]>}
              after={
                <>
                  <Button icon="check" shortcut="Ctrl ↵" disabled={Boolean(plan.posted) || plan.items.length === 0 || plan.missingRates.length > 0 || posting} busy={posting} title={plan.posted ? `Posted as ${plan.posted.entry}` : plan.missingRates.length ? `Enter a ${plan.missingRates.join(", ")} rate for ${plan.date} first.` : undefined} onClick={onPost}>
                    Post the revaluation
                  </Button>
                  <MenuButton variant="quiet" iconOnly icon="more" iconEnd={undefined} align="end" label="See the lines" aria-label="See the lines" items={planMenu} />
                </>
              }
            />
          ) : (
            <RailSec title="Revaluation" rows={[["Nothing to revalue", ""]]} />
          )}
        </Rail>
      }
    >
      <BooksFinding finding={data.finding} />
      <BkTabs
        label="Rates and revaluation"
        value={data.tab}
        onChange={(tab) => onQuery({ tab })}
        items={[
          { value: "rates", label: "Rates" },
          { value: "revaluation", label: "Revaluation" },
        ]}
      />
      {data.tab === "rates" ? (
        <>
          <BkTools
            find="Search rates"
            query={q}
            onFind={(next) => onQuery({ q: next })}
            chips={<BkChip label="Currency" value={code(data.currency)} set items={data.currencies.map((currency) => ({ key: currency, label: code(currency), checked: currency === data.currency, onSelect: () => onQuery({ currency, page: 1 }) }))} />}
            count={`${of} ${of === 1 ? "day" : "days"}`}
            end={<BkQuietTools exportHref={exportHref} />}
          />
          <TableShell
            label="Rates"
            foot={
              <TableFoot
                range={of === 0 ? "None" : `${to - from + 1} of ${of} days`}
                sums={[{ label: "Today uses", value: data.todayRate ? data.todayRate.toFixed(2) : "None" }]}
                page={{ onPrevious: page > 1 ? () => onQuery({ page: page - 1 }) : undefined, onNext: to < of ? () => onQuery({ page: page + 1 }) : undefined }}
              />
            }
          >
            {rows.length === 0 ? (
              <TableEmpty title={`No ${code(data.currency)} rate yet`}>Enter one, or let RBZ’s interbank rate come in each morning.</TableEmpty>
            ) : (
              <table className="table" aria-label="Rates">
                <colgroup>
                  <col style={{ width: 140 }} />
                  <col style={{ width: 130 }} />
                  <col style={{ width: 200 }} />
                  <col />
                  <col style={{ width: 56 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="num">{`${base} to ${code(data.currency)}`}</th>
                    <th>Source</th>
                    <th className="fill">By</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="muted">{row.date}</td>
                      <td className="num">
                        <span className="mono" style={{ color: "var(--color-ink)" }}>
                          {row.rate.toFixed(2)}
                        </span>
                      </td>
                      <td>{row.source === "MANUAL" ? <span className="pill pill-n">Manual, {row.time}</span> : <span className="muted">RBZ interbank, {row.time}</span>}</td>
                      <td className="fill truncate">
                        {row.by ? (
                          <span className="muted">
                            <Person name={row.by} />
                          </span>
                        ) : (
                          <span className="muted">{row.monthEnd ? "Automatic, month end" : "Automatic"}</span>
                        )}
                      </td>
                      <td className="acts">
                        <MenuButton variant="quiet" iconOnly icon="more" iconEnd={undefined} align="end" label="More" aria-label="More" items={rateMenu(row)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TableShell>
        </>
      ) : (
        <TableShell label="Revaluations" foot={<TableFoot range={`${data.revaluations.length} ${data.revaluations.length === 1 ? "month" : "months"}`} />}>
          {data.revaluations.length === 0 ? (
            <TableEmpty title="Nothing revalued yet">At month end, balances in other currencies are valued again at the month-end rate.</TableEmpty>
          ) : (
            <table className="table" aria-label="Revaluations">
              <colgroup>
                <col />
                <col style={{ width: 150 }} />
                <col style={{ width: 160 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 120 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="num">Gain or loss</th>
                  <th>Posted</th>
                  <th>Reverses</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {data.revaluations.map((row) => (
                  <tr key={row.month} onClick={() => onQuery({ tab: "rates" })}>
                    <td className="fill">
                      <Lead sub={row.entry}>{row.label}</Lead>
                    </td>
                    <td className="num">{money(row.gain, base)}</td>
                    <td className="muted">{row.posted ?? "—"}</td>
                    <td className="muted">{row.reverses}</td>
                    <td>
                      <St word={row.state === "Void" ? "Void" : "Posted"} />
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
