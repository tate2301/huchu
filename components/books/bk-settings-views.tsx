"use client";

import * as React from "react";
import Link from "next/link";

import { Button, ButtonLink, Icon, Input, Person, Segmented, TableFoot, TableShell } from "@/components/core";
import type { LockPolicy, LocksPage, NumberingPage, OpeningBalances, SeriesRow, SetupPage, YearEndPage } from "@/lib/books/settings-pages";

import { n2, Rail, RailSec, Split, St, TableEmpty } from "./bk-b";
import { BkTools } from "./bk-list";
import { BooksFinding } from "./figures";

/* ── Numbering ───────────────────────────────────────────────────────── */

/**
 * Books → Settings → Numbering (design/core-modules/boards/view/BkSettingsNumbering.html):
 * each series with its next number (fixed: given at issue, no gaps) and the
 * last one issued; the chosen one's prefix for the next year in the rail.
 */
export function BkNumberingView({ data, selected, onSelect, onSave, saving, onExport }: { data: NumberingPage; selected: string; onSelect: (key: string) => void; onSave: (row: SeriesRow, prefix: string) => void; saving: boolean; onExport: () => void }) {
  const [q, setQ] = React.useState("");
  const rows = data.rows.filter((row) => !q || row.label.toLowerCase().includes(q.toLowerCase()) || row.prefix.toLowerCase().includes(q.toLowerCase()));
  const pick = data.rows.find((row) => row.key === selected) ?? data.rows[0];
  const [prefix, setPrefix] = React.useState("");
  React.useEffect(() => setPrefix(pick?.nextYear?.prefix ?? ""), [pick?.key, pick?.nextYear?.prefix]);
  const from = new Date(`${data.nextYearFrom}T00:00:00Z`);
  const fromLabel = `${from.getUTCDate()} ${from.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })} ${from.getUTCFullYear()}`;
  const first = prefix.trim() ? `${prefix.trim().toUpperCase().replace(/-?$/, "-")}0001` : null;
  return (
    <Split
      rail={
        <Rail label={pick?.label ?? "Series"} width={360}>
          {pick ? (
            <>
              <RailSec title={pick.label} rows={[["Prefix now", pick.prefix], ["Next number", `${pick.next}, fixed`], ["Issued so far", pick.issued.toLocaleString("en-GB")]]} />
              {pick.fixedPrefix ? (
                <RailSec title="Its prefix" after={<span className="muted">Journal numbers are the ledger’s own: JE- every year.</span>} />
              ) : (
                <section>
                  <div className="sec-title">From {fromLabel}</div>
                  <div className="bk-fld">
                    <label className="bk-lab" htmlFor="series-prefix">
                      Prefix <span className="muted">optional</span>
                    </label>
                    <Input id="series-prefix" value={prefix} disabled={!data.can.change} placeholder={`${pick.prefix.replace(/-$/, "")}-${String(from.getUTCFullYear()).slice(2)}-`} onChange={(event) => setPrefix(event.target.value)} />
                  </div>
                  <span className="muted" style={{ display: "block", marginTop: 8 }}>
                    {first ? `The first ${pick.label.toLowerCase()} is ${first}` : `Left empty, ${pick.label.toLowerCase()}s keep ${pick.prefix} and count on`}
                  </span>
                  {data.can.change ? (
                    <div className="bk-racts">
                      <Button variant="primary" icon="check" shortcut="Ctrl S" busy={saving} disabled={saving || prefix.trim().toUpperCase() === (pick.nextYear?.prefix ?? "")} onClick={() => onSave(pick, prefix)}>
                        Save
                      </Button>
                      <Button variant="quiet" onClick={() => setPrefix(pick.nextYear?.prefix ?? "")}>
                        Cancel
                      </Button>
                    </div>
                  ) : null}
                </section>
              )}
            </>
          ) : null}
        </Rail>
      }
    >
      <BooksFinding finding={data.finding} />
      <BkTools find="Search series" query={q} onFind={setQ} count={`${rows.length} series`} end={<Button variant="quiet" icon="export" onClick={onExport}>Export</Button>} />
      <TableShell label="Series" foot={<TableFoot range={`${data.rows.length} series`} />}>
        <table className="table" aria-label="Series">
          <colgroup>
            <col />
            <col style={{ width: 110 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 190 }} />
            <col style={{ width: 56 }} />
          </colgroup>
          <thead>
            <tr>
              <th className="fill">Document</th>
              <th>Prefix</th>
              <th>Next number</th>
              <th>Last issued</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className={row.key === pick?.key ? "bk-sel" : undefined} aria-selected={row.key === pick?.key || undefined} tabIndex={0} style={{ cursor: "pointer" }} onClick={() => onSelect(row.key)} onKeyDown={(event) => event.key === "Enter" && onSelect(row.key)}>
                <td className="fill">{row.label}</td>
                <td>
                  <span className="muted">{row.prefix}</span>
                </td>
                <td>
                  <span className="mono" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    {row.next} <Icon name="lock" />
                  </span>
                </td>
                <td className="truncate">{row.last ?? <span className="muted">None yet</span>}</td>
                <td>{row.fixedPrefix ? null : <Button variant="quiet" iconOnly icon="edit" label={`Edit ${row.label}`} onClick={() => onSelect(row.key)} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </Split>
  );
}

/* ── Locks & periods ─────────────────────────────────────────────────── */

const POLICIES: Array<{ value: LockPolicy; label: string }> = [
  { value: "STRICT", label: "Nobody" },
  { value: "MANAGER_OVERRIDE", label: "Owner or manager, with a reason" },
  { value: "SOFT_WARN", label: "Anyone, with a warning" },
];

/**
 * Books → Settings → Locks & periods (no board of its own: the Settings
 * level's shape): who may post into a closed month, the freeze date before
 * which nothing posts at all, and each month's state. Reopening a month is
 * the owner's, with a reason (§4.15, the owner's default 7).
 */
export function BkLocksView({ data, onPolicy, onFreeze, onReopen, busy }: { data: LocksPage; onPolicy: (policy: LockPolicy) => void; onFreeze: (date: string | null) => void; onReopen: (id: string, month: string) => void; busy: boolean }) {
  const [freeze, setFreeze] = React.useState(data.freezeBefore ?? "");
  React.useEffect(() => setFreeze(data.freezeBefore ?? ""), [data.freezeBefore]);
  return (
    <Split
      rail={
        <Rail label="Locks" width={360}>
          <section>
            <div className="sec-title">Into a closed month, who may post</div>
            <Segmented label="Who may post into a closed month" value={data.policy} onChange={(policy) => data.can.freeze && onPolicy(policy)} items={POLICIES.map((policy) => ({ value: policy.value, label: policy.label.split(",")[0] }))} />
            <span className="muted" style={{ display: "block", marginTop: 8 }}>
              {POLICIES.find((policy) => policy.value === data.policy)?.label}.{!data.can.freeze ? " Only the owner changes this." : ""}
            </span>
          </section>
          <section>
            <div className="sec-title">Freeze</div>
            <div className="bk-fld">
              <label className="bk-lab" htmlFor="freeze-date">
                Nothing posts on or before
              </label>
              <Input id="freeze-date" type="date" value={freeze} disabled={!data.can.freeze} onChange={(event) => setFreeze(event.target.value)} />
            </div>
            <span className="muted" style={{ display: "block", marginTop: 8 }}>
              Open or closed, as when the accountant has signed the year off.
            </span>
            {data.can.freeze ? (
              <div className="bk-racts">
                <Button variant="primary" icon="lock" shortcut="Ctrl S" busy={busy} disabled={busy || freeze === (data.freezeBefore ?? "")} onClick={() => onFreeze(freeze || null)}>
                  Save the freeze
                </Button>
                {data.freezeBefore ? (
                  <Button variant="quiet" disabled={busy} onClick={() => onFreeze(null)}>
                    Lift it
                  </Button>
                ) : null}
              </div>
            ) : null}
          </section>
        </Rail>
      }
    >
      <BooksFinding finding={data.finding} />
      <TableShell label="Months" foot={<TableFoot range={`${data.periods.length} months`} sums={[{ label: "Open", value: data.open }, { label: "Closed", value: data.closed }]} />}>
        {data.periods.length === 0 ? (
          <TableEmpty title="No months yet">A month opens with its first posting.</TableEmpty>
        ) : (
          <table className="table" aria-label="Months">
            <colgroup>
              <col style={{ width: 170 }} />
              <col style={{ width: 110 }} />
              <col />
              <col style={{ width: 200 }} />
              <col style={{ width: 130 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Month</th>
                <th>State</th>
                <th className="fill">Closed</th>
                <th>Reopened</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.periods.map((row) => (
                <tr key={row.id}>
                  <td>{row.month}</td>
                  <td>
                    <St word={row.state} />
                  </td>
                  <td className="fill truncate">{row.closed ?? <span className="muted">—</span>}</td>
                  <td className="truncate" title={row.reason ?? undefined}>
                    {row.reopened ?? <span className="muted">—</span>}
                  </td>
                  <td>
                    {row.state === "Closed" && data.can.reopen ? (
                      <Button variant="quiet" size="sm" icon="history" onClick={() => onReopen(row.id, row.month)}>
                        Reopen
                      </Button>
                    ) : row.state === "Open" && data.can.close ? (
                      <ButtonLink variant="quiet" size="sm" href={`/books/periods?period=${row.from.slice(0, 7)}`}>
                        Checklist
                      </ButtonLink>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableShell>
    </Split>
  );
}

/* ── Opening balances ────────────────────────────────────────────────── */

/** The opening balances as BkSetup draws them: the day, each account's debit or credit, balanced, and who posted them. */
export function OpeningSection({ opening, onRevise, onCsv, canChange, headed = true, revise = true }: { opening: OpeningBalances; onRevise: () => void; onCsv: () => void; canChange: boolean; headed?: boolean; /** Off where the top bar already carries Revise. */ revise?: boolean }) {
  return (
    <>
      {headed ? (
        <div className="group-head bk-gh">
          <h2>{opening.dateLabel ? `Opening balances, ${opening.dateLabel}` : "Opening balances"}</h2>
          <span className="sum">{opening.lines.length} accounts</span>
        </div>
      ) : null}
      <table className="table" aria-label="Opening balances">
        <colgroup>
          <col style={{ width: 90 }} />
          <col />
          <col style={{ width: 150 }} />
          <col style={{ width: 150 }} />
        </colgroup>
        <thead>
          <tr>
            <th>Code</th>
            <th className="fill">Account</th>
            <th className="num">Debit</th>
            <th className="num">Credit</th>
          </tr>
        </thead>
        <tbody>
          {opening.lines.length === 0 ? (
            <tr>
              <td />
              <td className="fill" colSpan={3}>
                <span className="muted">None yet: the books started from nothing. Add what each account held the day before they started.</span>
              </td>
            </tr>
          ) : (
            opening.lines.map((line) => (
              <tr key={line.accountId}>
                <td>
                  <span className="ref">{line.code}</span>
                </td>
                <td className="fill truncate">{line.name}</td>
                <td className="num">{line.debit ? n2(line.debit) : ""}</td>
                <td className="num">{line.credit ? n2(line.credit) : ""}</td>
              </tr>
            ))
          )}
        </tbody>
        {opening.lines.length ? (
          <tfoot>
            <tr className="tot">
              <td />
              <td className="fill">{Math.abs(opening.debit - opening.credit) < 0.005 ? "Balanced" : "Does not balance"}</td>
              <td className="num">{n2(opening.debit)}</td>
              <td className="num">{n2(opening.credit)}</td>
            </tr>
          </tfoot>
        ) : null}
      </table>
      <div className="foot-row" style={{ padding: "12px 24px" }}>
        <span>
          {opening.posted ? (
            <>
              Posted {opening.posted.on} by <Person name={opening.posted.by ?? "Someone"} />
            </>
          ) : (
            <span className="muted">Not posted yet</span>
          )}
        </span>
        {canChange ? (
          <div className="end">
            {revise ? (
              <Button icon="edit" onClick={onRevise}>
                {opening.posted ? "Revise the opening balances" : "Add the opening balances"}
              </Button>
            ) : null}
            <Button variant="quiet" iconOnly icon="upload" label="Bring in a trial balance, CSV" onClick={onCsv} />
          </div>
        ) : null}
      </div>
    </>
  );
}

/* ── Set up the books ────────────────────────────────────────────────── */

/**
 * Books → Settings → Set up the books (design/core-modules/boards/view/BkSetup.html):
 * each step with its state and where it is done, then the opening balances.
 */
export function BkSetupView({ data, onRevise, onCsv, onSeed, seeding }: { data: SetupPage; onRevise: () => void; onCsv: () => void; onSeed: () => void; seeding: boolean }) {
  return (
    <div className="bk-body">
      <div className="bk-col">
        <BooksFinding finding={data.finding} />
        <div>
          {data.steps.map((step) => (
            <div key={step.key} className="bk-chk" style={{ gridTemplateColumns: "24px minmax(0,1fr) minmax(0,1.2fr) 220px" }}>
              <span className={step.done ? "bk-ok" : undefined} style={step.done ? undefined : { color: "var(--color-warning)" }}>
                <Icon name={step.done ? "check" : "warn"} />
              </span>
              <span className="lead">{step.label}</span>
              <span>{step.detail}</span>
              <span className="end">
                {step.key === "chart" && !data.seeded && data.can.change ? (
                  <Button variant="primary" icon="run" shortcut="Ctrl ↵" busy={seeding} onClick={onSeed}>
                    Set up the chart
                  </Button>
                ) : step.action?.primary && data.can.change ? (
                  <ButtonLink variant="primary" icon="posting" shortcut="Ctrl ↵" href={step.action.href}>
                    {step.action.label}
                  </ButtonLink>
                ) : step.action ? (
                  <ButtonLink variant="quiet" icon="arrow" href={step.action.href}>
                    {step.action.label}
                  </ButtonLink>
                ) : null}
              </span>
            </div>
          ))}
        </div>
        <OpeningSection opening={data.opening} onRevise={onRevise} onCsv={onCsv} canChange={data.can.change} />
      </div>
    </div>
  );
}

/* ── Year end ────────────────────────────────────────────────────────── */

/**
 * Books → Close the month → Year end (design/core-modules/boards/view/BkYearEnd.html):
 * the six steps to the year's end with their state, the year in the rail, and
 * the accountant export.
 */
export function BkYearEndView({ data, exportHref }: { data: YearEndPage; exportHref: string }) {
  return (
    <Split
      rail={
        <Rail label="Financial year" width={340}>
          <RailSec
            title="Financial year"
            rows={[
              ["This year", data.rail.thisYear],
              ["Books start", data.rail.booksStart ?? "—"],
              ["Retained earnings", data.rail.retainedEarnings ?? "—"],
              ["Closing entry by", data.rail.closingBy],
            ]}
            after={
              <ButtonLink icon="arrow" href="/management/money-and-tax">
                Open Money and tax
              </ButtonLink>
            }
          />
        </Rail>
      }
    >
      <BooksFinding finding={data.finding} />
      <TableShell
        label="Steps"
        foot={
          <TableFoot
            range={`${data.steps.length} steps`}
            sums={[
              { label: "Done", value: data.done },
              { label: "Year ends", value: data.yearEnds },
            ]}
            end={
              <a className="btn" href={exportHref} download>
                <Icon name="export" />
                Accountant export
              </a>
            }
          />
        }
      >
        <table className="table" aria-label="Steps">
          <colgroup>
            <col style={{ width: 260 }} />
            <col />
            <col style={{ width: 130 }} />
            <col style={{ width: 110 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Step</th>
              <th>What it does</th>
              <th>When</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {data.steps.map((step) => (
              <tr key={step.key}>
                <td>
                  {step.key === "close" ? <Link href="/books/periods">{step.step}</Link> : step.key === "revalue" ? <Link href="/books/rates?tab=revaluation">{step.step}</Link> : step.key === "qpd" ? <Link href="/books/provisional-tax">{step.step}</Link> : step.step}
                </td>
                <td className="fill bk-fw">
                  <span className="muted">{step.what}</span>
                </td>
                <td>{step.when}</td>
                <td>
                  <St word={step.state === "Not yet" ? "Draft" : step.state} label={step.state} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </Split>
  );
}
