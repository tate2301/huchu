"use client";

import * as React from "react";

import { Button, Icon, TableFoot, TableShell } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { money, shortDay } from "@/lib/books/format";
import type { ChartPage, ChartQuery, ChartRow, CostCentreQuery, CostCentreRow, CostCentresPage, PostingRulesPage, PostingRulesQuery } from "@/lib/books/ledger-setup";

import { Lead, n2, St, TableEmpty } from "./bk-b";
import { BkChip, BkState, BkTabs, BkTools, useBkLayout } from "./bk-list";
import { BooksFinding, Cents } from "./figures";

type Account = Extract<ChartRow, { kind: "account" }>;

const TYPES: Array<{ value: ChartQuery["type"]; label: string }> = [
  { value: "all", label: "Any" },
  { value: "ASSET", label: "Assets" },
  { value: "LIABILITY", label: "Liabilities" },
  { value: "EQUITY", label: "Equity" },
  { value: "INCOME", label: "Income" },
  { value: "EXPENSE", label: "Expenses" },
];

/**
 * Books → Ledger → Chart of accounts (design: bk-chart): the accounts by type,
 * 32px rows, code, name, type, what posts to it and its balance to today.
 * An account opens to be renamed or deactivated (never deleted).
 */
const TYPE_WORD: Record<string, string> = { ASSET: "Asset", LIABILITY: "Liability", EQUITY: "Equity", INCOME: "Income", EXPENSE: "Expense" };
type ChartSort = "code" | "name" | "balance";
const CHART_SORTS: Array<{ value: ChartSort; label: string }> = [
  { value: "code", label: "Code" },
  { value: "name", label: "Name" },
  { value: "balance", label: "Largest balance" },
];
type ChartOnly = "all" | "added" | "balance";
type Head = Extract<ChartRow, { kind: "head" }>;

/** The rows as the toolbar has them: filtered, ordered inside each heading, headings dropped when not grouped. Pure. */
export function shapeChart(rows: ChartRow[], sort: ChartSort, grouped: boolean, only: ChartOnly): ChartRow[] {
  const keep = (row: Account) => only === "all" || (only === "added" ? row.added : row.hasLines && Math.abs(row.balance) >= 0.005);
  const order = (list: Account[]) =>
    [...list].sort(
      sort === "name"
        ? (a, b) => a.name.localeCompare(b.name, "en-GB")
        : sort === "balance"
          ? (a, b) => Math.abs(b.balance) - Math.abs(a.balance)
          : (a, b) => a.code.localeCompare(b.code, "en-GB", { numeric: true }),
    );
  const out: ChartRow[] = [];
  let head: Head | null = null;
  let run: Account[] = [];
  const flush = () => {
    const list = order(run.filter(keep));
    if (grouped && head && (list.length > 0 || only === "all")) out.push(head);
    if (grouped) out.push(...list);
    run = [];
  };
  const loose: Account[] = [];
  for (const row of rows) {
    if (row.kind === "head") {
      flush();
      head = row;
    } else if (grouped) run.push(row);
    else loose.push(row);
  }
  flush();
  return grouped ? out : order(loose.filter(keep));
}

export function BkChartView({ data, onQuery, onOpen, onExport }: { data: ChartPage; onQuery: (next: Partial<ChartQuery>) => void; onOpen: (account: Account) => void; onExport: () => void }) {
  const q = data.query;
  const type = TYPES.find((option) => option.value === q.type)!;
  const [sort, setSort] = React.useState<ChartSort>("code");
  const [grouped, setGrouped] = React.useState(true);
  const [only, setOnly] = React.useState<ChartOnly>("all");
  const layout = useBkLayout<Account>("chart", [{ key: "type", label: "Type", nth: 3 }, { key: "used", label: "Used by", nth: 4 }, { key: "balance", label: "Balance", nth: 5 }], [], []);
  const rows = React.useMemo(() => shapeChart(data.rows, sort, grouped, only), [data.rows, sort, grouped, only]);
  const count = rows.filter((row) => row.kind === "account").length;
  const filters: MenuEntry[] = [
    { key: "all", label: "Every account", checked: only === "all", onSelect: () => setOnly("all") },
    { separator: true },
    { key: "added", label: "Added by Books", checked: only === "added", onSelect: () => setOnly("added") },
    { key: "balance", label: "With a balance", checked: only === "balance", onSelect: () => setOnly("balance") },
  ];
  return (
    <div className="bk">
      <BkTools
        find="Search accounts"
        query={q.q}
        onFind={(next) => onQuery({ q: next })}
        count={String(count)}
        chips={
          <>
            <BkChip label="Type" value={type.label} set={q.type !== "all"} items={TYPES.map((option) => ({ key: option.value, label: option.label, checked: option.value === q.type, onSelect: () => onQuery({ type: option.value }) }))} />
            <BkChip
              label="Show"
              value={q.inactive === "show" ? "All" : "Active"}
              set={q.inactive === "show"}
              items={[
                { key: "active", label: "Active", checked: q.inactive !== "show", onSelect: () => onQuery({ inactive: "hide" }) },
                { key: "all", label: "All", checked: q.inactive === "show", onSelect: () => onQuery({ inactive: "show" }) },
              ]}
            />
          </>
        }
        filters={filters}
        end={
          <>
            <MenuButton variant="quiet" icon="sort" label="Sort" items={CHART_SORTS.map((option) => ({ key: option.value, label: option.label, checked: option.value === sort, onSelect: () => setSort(option.value) }))}>
              Sort
            </MenuButton>
            <MenuButton
              variant="quiet"
              icon="sections"
              label="Group"
              items={[
                { key: "type", label: "By type", checked: grouped, onSelect: () => setGrouped(true) },
                { key: "none", label: "No grouping", checked: !grouped, onSelect: () => setGrouped(false) },
              ]}
            >
              Group
            </MenuButton>
            {layout.tools}
            <Button icon="export" onClick={onExport}>
              Export
            </Button>
          </>
        }
      />
      <div className={layout.wrap} style={{ display: "contents" }}>
        {layout.style}
        <TableShell label="Chart of accounts">
          {rows.length === 0 ? (
            <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
              <b>{q.q || only !== "all" ? "No account matches" : "No accounts yet"}</b>
            </div>
          ) : (
            <table className="table bk-dense" aria-label="Chart of accounts">
              <colgroup>
                <col style={{ width: 90 }} />
                <col />
                <col style={{ width: 140 }} />
                <col style={{ width: 240 }} />
                <col style={{ width: 168 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Account</th>
                  <th>Type</th>
                  <th>Used by</th>
                  <th className="num">Balance, {shortDay(data.asOf)}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) =>
                  row.kind === "head" ? (
                    <tr key={row.key} className={row.level === 2 ? "bk-grp lv2" : "bk-grp"}>
                      <td colSpan={5}>{row.label}</td>
                    </tr>
                  ) : (
                    <tr key={row.id} className="bk-pick" tabIndex={0} onClick={() => onOpen(row)} onKeyDown={(event) => event.key === "Enter" && onOpen(row)}>
                      <td>
                        <span className="bk-code">{row.code}</span>
                      </td>
                      <td className="fill truncate">
                        <span className="cell-lead" style={row.active ? undefined : { color: "var(--color-muted)" }}>
                          {row.name}
                        </span>
                        {!row.active ? <span className="bk-sub">inactive</span> : null}
                        {row.added ? <span className="bk-src">Added by Books</span> : null}
                      </td>
                      <td className="muted">{row.moneyAccount ? "Money account" : (TYPE_WORD[row.type] ?? row.word)}</td>
                      <td className="muted truncate">{row.usedBy ?? ""}</td>
                      <td className="num">{row.hasLines ? <Cents value={row.balance} currency={data.baseCurrency} /> : <span className="muted">—</span>}</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          )}
        </TableShell>
      </div>
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
 * Books → Ledger → Posting rules (design: bk-posting-rules): Rules, Tender
 * mappings and Readiness; a rule with no account says so in one line with its
 * action, and its row says what is missing. A rule opens to be edited.
 */
export function BkPostingRulesView({ data, onQuery, onEdit }: { data: PostingRulesPage; onQuery: (next: Partial<PostingRulesQuery>) => void; onEdit: (id: string) => void }) {
  const q = data.query;
  const waiting = data.rows.filter((row) => row.state === "Needs an account");
  const first = waiting[0];
  return (
    <div className="bk">
      <BkTabs
        label="Posting rules"
        value={q.tab}
        onChange={(tab) => onQuery({ tab })}
        items={[
          { value: "rules", label: "Rules", count: data.counts.rules },
          { value: "tenders", label: "Tender mappings", count: data.counts.tenders },
          { value: "readiness", label: "Readiness", count: data.readiness ? data.readiness.checks.filter((check) => !check.ready).length : undefined },
        ]}
      />
      {q.tab === "rules" ? (
        <>
          {first ? (
            <div className="bk-warn" role="alert">
              <Icon name="warn" />
              <span>
                <b>{waiting.length === 1 ? `${first.name} has no ${first.missing ?? "account"}.` : `${waiting.length} rules have no account.`}</b>
              </span>
              {data.can.change ? (
                <Button icon="edit" onClick={() => onEdit(first.id)}>
                  {waiting.length === 1 ? "Set the account" : `Set ${first.name}`}
                </Button>
              ) : null}
            </div>
          ) : null}
          <TableShell label="Rules">
            {data.rows.length === 0 ? (
              <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
                <b>No posting rules</b>
              </div>
            ) : (
              <table className="table bk-dense" aria-label="Rules">
                <colgroup>
                  <col style={{ width: 280 }} />
                  <col style={{ width: 160 }} />
                  <col />
                  <col />
                  <col style={{ width: 180 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>From</th>
                    <th>Debit</th>
                    <th>Credit</th>
                    <th>State</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.id} className={data.can.change ? "bk-pick" : undefined} tabIndex={data.can.change ? 0 : undefined} onClick={data.can.change ? () => onEdit(row.id) : undefined} onKeyDown={data.can.change ? (event) => event.key === "Enter" && onEdit(row.id) : undefined}>
                      <td className="truncate">
                        <span className="cell-lead">{row.name}</span>
                        {row.when.startsWith("When") ? <span className="bk-sub">{row.when}</span> : null}
                      </td>
                      <td className="muted truncate">{row.from}</td>
                      <td className="truncate" title={row.debit}>
                        {row.debit}
                      </td>
                      <td className="truncate" title={row.credit}>
                        {row.credit}
                      </td>
                      <td>
                        {row.state === "Needs an account" ? <BkState tone="danger">{`Missing: ${row.missing ?? "account"}`}</BkState> : row.state === "Inactive" ? <BkState tone="void">Inactive</BkState> : <BkState tone="success">Ready</BkState>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TableShell>
        </>
      ) : q.tab === "tenders" ? (
        <TableShell label="Tender mappings">
          {data.tenders.length === 0 ? (
            <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
              <b>No tender mappings</b>
            </div>
          ) : (
            <table className="table bk-dense" aria-label="Tender mappings">
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
                  <th>Posts to</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {data.tenders.map((row) => (
                  <tr key={row.id}>
                    <td>{row.tender}</td>
                    <td className="muted">{row.currency}</td>
                    <td className="truncate">{row.where}</td>
                    <td className="fill truncate">
                      <span className="cell-lead">{row.clearing}</span>
                      {row.offset ? <span className="bk-sub">Against {row.offset}</span> : null}
                    </td>
                    <td>
                      <BkState tone={row.active ? "success" : "void"}>{row.active ? "Active" : "Inactive"}</BkState>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TableShell>
      ) : (
        <TableShell label="Readiness">
          {data.readiness ? (
            <table className="table bk-dense" aria-label="Readiness">
              <colgroup>
                <col style={{ width: 280 }} />
                <col />
                <col style={{ width: 140 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Check</th>
                  <th>What it found</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {data.readiness.checks.map((check) => (
                  <tr key={check.id}>
                    <td>{check.label}</td>
                    <td className="fill truncate muted">{check.note ?? "—"}</td>
                    <td>
                      <BkState tone={check.ready ? "success" : "danger"}>{check.ready ? "Ready" : "Not yet"}</BkState>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
              <b>Readiness did not load</b>
            </div>
          )}
        </TableShell>
      )}
    </div>
  );
}
