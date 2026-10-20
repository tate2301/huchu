"use client";

import * as React from "react";

import { Button, Segmented, TableFoot, TableShell } from "@/components/core";
import { money } from "@/lib/books/format";
import { VAT_STATE_LABEL, type VatCurrencyView, type VatTab } from "@/lib/books/vat-labels";
import type { VatLine, VatPage } from "@/lib/books/vat-return-page";

import { n2, St, TableEmpty } from "./bk-b";
import { BkTabs } from "./bk-list";
import { BooksFinding } from "./figures";

const TABS: VatTab[] = ["draft", "reviewed", "finalised", "filed"];

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
const DOCS: Record<string, [string, string]> = {
  invoices: ["invoice", "invoices"],
  "invoice-voids": ["invoice", "invoices"],
  "credit-notes": ["credit note", "credit notes"],
  till: ["sale", "sales"],
  fees: ["fee", "fees"],
  bills: ["bill", "bills"],
  "debit-notes": ["debit note", "debit notes"],
  claims: ["slip", "slips"],
};

function Line({ line, credit = false }: { line: VatLine; credit?: boolean }) {
  const words = DOCS[line.key];
  return (
    <tr>
      <td className="fill bk-fw">
        <span className="cell-lead">{line.label}</span>
      </td>
      <td className="num">
        <span className="muted">{line.docs === 0 ? "None" : words ? plural(line.docs, words[0], words[1]) : plural(line.docs, "posting")}</span>
      </td>
      <td className="num">
        <span className="muted">{credit && line.value === 0 ? "" : n2(line.value)}</span>
      </td>
      <td className="num">{n2(line.vat)}</td>
    </tr>
  );
}

/**
 * Books → Tax → VAT returns (design/core-modules/boards/view/BkVatReturn.html):
 * one table, output, input and withheld, with the tie-out to 2200 and 2210 in
 * the foot; all in US dollars or each currency on its own.
 */
export function BkVatReturnView({
  data,
  onQuery,
  onPick,
  onSchedule,
}: {
  data: VatPage;
  onQuery: (next: { tab?: VatTab; view?: VatCurrencyView }) => void;
  onPick: (id: string) => void;
  onSchedule: () => void;
}) {
  const cur = data.current;
  const c = cur?.currency ?? data.baseCurrency;
  const tie = cur?.tieOut;
  const diff = tie ? [tie.output, tie.input, tie.withheld].reduce((sum, row) => sum + Math.abs(row.difference), 0) : 0;
  const showList = !cur && data.list.length > 0;
  return (
    <div className="bk">
      <BooksFinding finding={data.finding} />
      <BkTabs label="Return states" value={data.tab} onChange={(tab) => onQuery({ tab })} items={TABS.map((tab) => ({ value: tab, label: VAT_STATE_LABEL[tab], count: data.counts[tab] }))} />
      <div className="ws-tools">
        <Segmented
          label="View"
          value={data.view}
          onChange={(view) => onQuery({ view })}
          items={[
            { value: "all", label: `All in ${data.baseCurrency === "USD" ? "USD" : data.baseCurrency}` },
            { value: "USD", label: "USD documents" },
            { value: "ZWG", label: "ZiG documents" },
          ]}
        />
        <span className="ws-n">{cur ? `${cur.period.words}${cur.gatheredAt ? ` · gathered ${cur.gatheredAt.replace(/^Today /, "at ").replace(/^Yesterday /, "yesterday at ")}` : " · not gathered yet"}` : `${data.list.length} ${data.tab}`}</span>
        <div className="end">
          <Button icon="export" disabled={!cur?.id} onClick={onSchedule}>
            VAT 7 working schedule
          </Button>
        </div>
      </div>
      {showList ? (
        <TableShell label="Returns" foot={<TableFoot range={plural(data.list.length, "return")} />}>
          <table className="table" aria-label="Returns">
            <colgroup>
              <col />
              <col style={{ width: 150 }} />
              <col style={{ width: 180 }} />
              <col style={{ width: 120 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Period</th>
                <th className="num">Net VAT</th>
                <th>Reference</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {data.list.map((row) => (
                <tr key={row.id} onClick={() => onPick(row.id)} style={{ cursor: "pointer" }}>
                  <td className="fill">
                    <span className="cell-lead">{row.period}</span>
                  </td>
                  <td className="num">{money(row.net, data.baseCurrency)}</td>
                  <td className="muted">{row.reference ? `${row.reference}${row.filed ? `, ${row.filed}` : ""}` : "—"}</td>
                  <td>
                    <St word={VAT_STATE_LABEL[row.state]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      ) : cur ? (
        <TableShell
          label="The return"
          foot={
            <TableFoot
              range={plural(cur.totals.documents, "document")}
              sums={[
                { label: "Output", value: money(cur.totals.output, c) },
                { label: "Input", value: money(cur.totals.input, c) },
                { label: "Net", value: money(cur.totals.net, c) },
              ]}
              end={
                tie ? (
                  tie.ties ? (
                    <span className="status status-success">Ties to the ledger, difference 0.00</span>
                  ) : (
                    <span className="status status-warning" style={{ color: "var(--color-ink)", fontWeight: 500 }} title={`Output ${n2(tie.output.difference)}, input ${n2(tie.input.difference)}, withheld ${n2(tie.withheld.difference)}`}>
                      Differs from the ledger by {n2(diff)}
                    </span>
                  )
                ) : undefined
              }
            />
          }
        >
          <table className="table" aria-label="The return">
            <colgroup>
              <col />
              <col style={{ width: 160 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 150 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Line</th>
                <th className="num">Documents</th>
                <th className="num">Value</th>
                <th className="num">VAT</th>
              </tr>
            </thead>
            <tbody>
              <tr className="grp">
                <td colSpan={4}>Output VAT</td>
              </tr>
              {cur.output.map((line) => (
                <Line key={line.key} line={line} />
              ))}
              <tr className="tot">
                <td className="fill">Output VAT</td>
                <td className="num" />
                <td className="num" />
                <td className="num">{n2(cur.totals.output)}</td>
              </tr>
              <tr className="grp">
                <td colSpan={4}>Input VAT</td>
              </tr>
              {cur.input.map((line) => (
                <Line key={line.key} line={line} />
              ))}
              <tr className="tot">
                <td className="fill">Input VAT</td>
                <td className="num" />
                <td className="num" />
                <td className="num">{n2(cur.totals.input)}</td>
              </tr>
              <tr className="grp">
                <td colSpan={4}>Withheld</td>
              </tr>
              {cur.withheld.map((line) => (
                <Line key={line.key} line={line} credit />
              ))}
            </tbody>
            <tfoot>
              <tr className="tot">
                <td className="fill">Net VAT due to ZIMRA</td>
                <td className="num" />
                <td className="num" />
                <td className="num">{n2(cur.totals.net)}</td>
              </tr>
            </tfoot>
          </table>
          {cur.missingRates.length ? (
            <p className="muted" style={{ padding: "12px 24px" }}>
              {cur.missingRates.length} {cur.missingRates.length === 1 ? "document has" : "documents have"} no rate for the day: enter one in Rates & revaluation.
            </p>
          ) : null}
        </TableShell>
      ) : (
        <TableEmpty title={`Nothing ${data.tab}`}>{data.tab === "filed" ? "Filed returns land here with their TaRMS reference." : "A return moves here as it goes on."}</TableEmpty>
      )}
    </div>
  );
}
