"use client";

import * as React from "react";

import { Button, Icon, TableFoot, TableShell } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { money } from "@/lib/books/format";
import type { ChartPage, ChartQuery, ChartRow, CostCentreQuery, CostCentreRow, CostCentresPage, PostingRulesPage, PostingRulesQuery } from "@/lib/books/ledger-setup";

import { Lead, n2, St, TableEmpty } from "./bk-b";
import { BkChip, BkTabs, BkTools } from "./bk-list";
import { BooksFinding } from "./figures";

type Account = Extract<ChartRow, { kind: "account" }>;

const TYPES: Array<{ value: ChartQuery["type"]; label: string }> = [
  { value: "all", label: "All" },
  { value: "ASSET", label: "Assets" },
  { value: "LIABILITY", label: "Liabilities" },
  { value: "EQUITY", label: "Equity" },
  { value: "INCOME", label: "Income" },
  { value: "EXPENSE", label: "Expenses" },
];

/**
 * Books → Ledger → Chart of accounts (design/core-modules/boards/view/BkChart.html):
 * the tree by heading, each account's type, tax code and balance today; an
 * account opens to be renamed or deactivated (never deleted).
 */
export function BkChartView({ data, onQuery, onOpen, onExport }: { data: ChartPage; onQuery: (next: Partial<ChartQuery>) => void; onOpen: (account: Account) => void; onExport: () => void }) {
  const q = data.query;
  const type = TYPES.find((option) => option.value === q.type)!;
  return (
    <div className="bk">
      <BooksFinding finding={data.finding} />
      <BkTools
        find="Search accounts"
        query={q.q}
        onFind={(next) => onQuery({ q: next })}
        count={`${data.shown} accounts`}
        chips={<BkChip label="Type" value={type.label} set={q.type !== "all"} items={TYPES.map((option) => ({ key: option.value, label: option.label, checked: option.value === q.type, onSelect: () => onQuery({ type: option.value }) }))} />}
        end={
          <>
            <Button variant="quiet" icon="export" onClick={onExport}>
              Export
            </Button>
            <MenuButton
              variant="quiet"
              iconOnly
              icon="more"
              label="Collapse all, show inactive"
              aria-label="Collapse all, show inactive"
              align="end"
              items={[
                { key: "collapse", label: q.collapse === "yes" ? "Expand all" : "Collapse all", icon: "list", onSelect: () => onQuery({ collapse: q.collapse === "yes" ? "no" : "yes" }) },
                { key: "inactive", label: q.inactive === "show" ? "Hide inactive" : "Show inactive", icon: "eye", onSelect: () => onQuery({ inactive: q.inactive === "show" ? "hide" : "show" }) },
              ]}
            />
          </>
        }
      />
      <TableShell
        label="Chart of accounts"
        foot={<TableFoot range={`${data.total} accounts, ${data.inactive} inactive`} sums={data.added ? [{ label: "Added by Books", value: data.added }] : []} />}
      >
        {data.rows.length === 0 ? (
          <TableEmpty title={q.q ? "No account matches" : "No accounts yet"}>{q.q ? "Clear the search to see the rest." : "Set up the books to add the standard chart."}</TableEmpty>
        ) : (
          <table className="table bk-tree" aria-label="Chart of accounts">
            <colgroup>
              <col style={{ width: 90 }} />
              <col />
              <col style={{ width: 140 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 160 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Code</th>
                <th>Account</th>
                <th>Type</th>
                <th>Tax code</th>
                <th className="num">Balance, {data.baseCurrency}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) =>
                row.kind === "head" ? (
                  <tr key={row.key}>
                    <td>
                      <span className="ref">{row.code}</span>
                    </td>
                    <td className="fill bk-fw">
                      <span className={row.level === 1 ? "lv1" : "lv2"} style={{ display: "inline-flex", gap: 6, alignItems: "center", fontWeight: 600, color: "var(--color-ink)", paddingLeft: row.level === 2 ? 16 : 0 }}>
                        <Icon name="caret" />
                        {row.label}
                      </span>
                    </td>
                    <td />
                    <td />
                    <td className="num" />
                  </tr>
                ) : (
                  <tr key={row.id} tabIndex={0} style={{ cursor: "pointer" }} onClick={() => onOpen(row)} onKeyDown={(event) => event.key === "Enter" && onOpen(row)}>
                    <td>
                      <span className="ref">{row.code}</span>
                    </td>
                    <td className="fill bk-fw truncate" style={{ paddingLeft: 56 }}>
                      <span style={row.active ? undefined : { color: "var(--color-muted)" }}>{row.name}</span>
                      {!row.active ? <span className="muted"> · inactive</span> : null}
                      {row.added ? (
                        <>
                          <span className="pill pill-n" style={{ marginLeft: 6 }}>
                            Added by Books
                          </span>
                        </>
                      ) : null}
                    </td>
                    <td>
                      <span className="muted">{row.word}</span>
                    </td>
                    <td>{row.taxCode ?? <span className="muted">—</span>}</td>
                    <td className="num">{n2(row.balance)}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
      </TableShell>
    </div>
  );
}

/* ── Cost centres ────────────────────────────────────────────────────── */

const CENTRE_TABS: Array<{ value: CostCentreQuery["view"]; label: string }> = [
  { value: "active", label: "In use" },
  { value: "inactive", label: "Inactive" },
  { value: "all", label: "All" },
];

/**
 * Books → Ledger → Cost centres (no board of its own: built to the Ledger
 * list's shape): each centre, what uses it, and what was charged to it this
 * month. One opens to be renamed or deactivated.
 */
export function BkCostCentresView({ data, onQuery, onOpen, onExport }: { data: CostCentresPage; onQuery: (next: Partial<CostCentreQuery>) => void; onOpen: (row: CostCentreRow) => void; onExport: () => void }) {
  const q = data.query;
  const c = data.baseCurrency;
  return (
    <div className="bk">
      <BooksFinding finding={data.finding} />
      <BkTabs label="Cost centres" value={q.view} onChange={(view) => onQuery({ view })} items={CENTRE_TABS.map((tab) => ({ ...tab, count: data.counts[tab.value] }))} />
      <BkTools find="Search cost centres" query={q.q} onFind={(next) => onQuery({ q: next })} count={`${data.rows.length} cost ${data.rows.length === 1 ? "centre" : "centres"}`} end={<Button variant="quiet" icon="export" onClick={onExport}>Export</Button>} />
      <TableShell label="Cost centres" foot={<TableFoot range={`${data.rows.length} cost ${data.rows.length === 1 ? "centre" : "centres"}`} sums={[{ label: `${data.month}`, value: money(data.thisMonth, c) }]} />}>
        {data.rows.length === 0 ? (
          <TableEmpty title={q.q ? "No cost centre matches" : "No cost centres here"}>{q.q ? "Clear the search to see the rest." : "Add one with New cost centre. A CRM project makes its own."}</TableEmpty>
        ) : (
          <table className="table" aria-label="Cost centres">
            <colgroup>
              <col style={{ width: 120 }} />
              <col />
              <col style={{ width: 240 }} />
              <col style={{ width: 160 }} />
              <col style={{ width: 120 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Code</th>
                <th className="fill">Name</th>
                <th>Used by</th>
                <th className="num">{data.month}</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id} tabIndex={0} style={{ cursor: "pointer" }} onClick={() => onOpen(row)} onKeyDown={(event) => event.key === "Enter" && onOpen(row)}>
                  <td>
                    <span className="ref">{row.code}</span>
                  </td>
                  <td className="fill truncate">
                    <Lead sub={row.lines ? `${row.lines} ledger ${row.lines === 1 ? "line" : "lines"}` : "Nothing charged yet"}>{row.name}</Lead>
                  </td>
                  <td className="truncate">{row.usedBy ?? <span className="muted">—</span>}</td>
                  <td className="num">{n2(row.thisMonth)}</td>
                  <td>
                    <St word={row.active ? "Active" : "Inactive"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableShell>
    </div>
  );
}

/* ── Posting rules ───────────────────────────────────────────────────── */

/**
 * Books → Ledger → Posting rules (design/core-modules/boards/view/BkPostingRules.html):
 * each rule's debit and credit, how often it posted this month and whether
 * it is ready; the tender mappings; and the books' readiness.
 */
export function BkPostingRulesView({ data, onQuery, onEdit, onExport }: { data: PostingRulesPage; onQuery: (next: Partial<PostingRulesQuery>) => void; onEdit: (id: string) => void; onExport: () => void }) {
  const q = data.query;
  const source = data.sources.find((option) => option.value === q.source);
  return (
    <div className="bk">
      <BooksFinding finding={data.finding} />
      <BkTabs
        label="Posting rules"
        value={q.tab}
        onChange={(tab) => onQuery({ tab })}
        items={[
          { value: "rules", label: "Rules", count: data.counts.rules },
          { value: "tenders", label: "Tender mappings", count: data.counts.tenders },
          { value: "readiness", label: "Readiness" },
        ]}
      />
      {q.tab === "rules" ? (
        <>
          <BkTools
            find="Search rules"
            query={q.q}
            onFind={(next) => onQuery({ q: next })}
            count={`${data.rows.length} rules`}
            chips={
              <BkChip
                label="Source"
                value={source?.label ?? "Any"}
                set={Boolean(source)}
                items={[{ key: "any", label: "Any source", checked: !source, onSelect: () => onQuery({ source: "" }) }, { separator: true }, ...data.sources.map((option) => ({ key: option.value, label: option.label, checked: option.value === q.source, onSelect: () => onQuery({ source: option.value }) }))]}
              />
            }
            end={<Button variant="quiet" icon="export" onClick={onExport}>Export</Button>}
          />
          <TableShell
            label="Rules"
            foot={
              <TableFoot
                range={`${data.rows.length} rules`}
                sums={[
                  { label: "Ready", value: data.ready },
                  { label: "Needs an account", value: data.needs },
                ]}
              />
            }
          >
            {data.rows.length === 0 ? (
              <TableEmpty title="No rule matches">Clear the search or the Source to see the rest.</TableEmpty>
            ) : (
              <table className="table" aria-label="Rules">
                <colgroup>
                  <col style={{ width: 240 }} />
                  <col />
                  <col />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 160 }} />
                  <col style={{ width: 56 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Rule</th>
                    <th>Debit</th>
                    <th>Credit</th>
                    <th className="num">This month</th>
                    <th>State</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.id} aria-selected={row.state === "Needs an account" || undefined}>
                      <td className="truncate">
                        <Lead sub={row.when}>{row.name}</Lead>
                      </td>
                      <td className="fill truncate" title={row.debit}>
                        {row.debit}
                      </td>
                      <td className="fill truncate" title={row.credit}>
                        {row.credit}
                      </td>
                      <td className="num">{row.thisMonth}</td>
                      <td>
                        <St word={row.state === "Needs an account" ? "Waiting" : row.state} label={row.state} />
                      </td>
                      <td>{data.can.change ? <Button variant="quiet" iconOnly icon="edit" label={`Edit ${row.name}`} onClick={() => onEdit(row.id)} /> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TableShell>
        </>
      ) : q.tab === "tenders" ? (
        <TableShell label="Tender mappings" foot={<TableFoot range={`${data.tenders.length} tender mappings`} />}>
          {data.tenders.length === 0 ? (
            <TableEmpty title="No tender mappings">A till’s tenders post to the accounts set up with the books.</TableEmpty>
          ) : (
            <table className="table" aria-label="Tender mappings">
              <colgroup>
                <col style={{ width: 160 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 200 }} />
                <col />
                <col style={{ width: 120 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Tender</th>
                  <th>Currency</th>
                  <th>Where</th>
                  <th className="fill">Posts to</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {data.tenders.map((row) => (
                  <tr key={row.id}>
                    <td>{row.tender}</td>
                    <td>
                      <span className="muted">{row.currency}</span>
                    </td>
                    <td className="truncate">{row.where}</td>
                    <td className="fill truncate">
                      <Lead sub={row.offset ? `Against ${row.offset}` : undefined}>{row.clearing}</Lead>
                    </td>
                    <td>
                      <St word={row.active ? "Active" : "Inactive"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TableShell>
      ) : (
        <TableShell
          label="Readiness"
          foot={<TableFoot range={data.readiness ? `${data.readiness.summary.completed} of ${data.readiness.summary.total} ready` : "Readiness"} sums={data.readiness ? [{ label: "Failed postings", value: data.readiness.failedEvents }] : []} />}
        >
          {data.readiness ? (
            <table className="table" aria-label="Readiness">
              <colgroup>
                <col style={{ width: 280 }} />
                <col />
                <col style={{ width: 120 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Check</th>
                  <th className="fill">What it found</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {data.readiness.checks.map((check) => (
                  <tr key={check.id}>
                    <td>{check.label}</td>
                    <td className="fill truncate">
                      <span className="muted">{check.note ?? "—"}</span>
                    </td>
                    <td>
                      <St word={check.ready ? "Ready" : "Waiting"} label={check.ready ? "Ready" : "Not yet"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <TableEmpty title="Readiness did not load">Try again in a moment.</TableEmpty>
          )}
        </TableShell>
      )}
    </div>
  );
}
