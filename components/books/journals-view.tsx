"use client";

import * as React from "react";

import { Button, Drawer, Field, Icon, Input, Person, SelectCell, TableFoot, TableShell, useSelection } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { money } from "@/lib/books/format";
import {
  JOURNAL_SORT_LABEL,
  JOURNAL_SORTS,
  JOURNAL_STATE_WORD,
  JOURNAL_TAB_LABEL,
  JOURNAL_TABS,
  type JournalCan,
  type JournalDetail,
  type JournalQuery,
  type JournalRow,
  type JournalsView,
} from "@/lib/books/journals";

import { n2 } from "./bk-b";
import { BkChip, BkState, BkTabs, BkTools, useBkLayout } from "./bk-list";
import { Cents } from "./figures";

const TONE: Record<JournalRow["state"], Parameters<typeof BkState>[0]["tone"]> = { draft: "plain", "to-approve": "warning", posted: "success", reversed: "void", voided: "void" };

/**
 * Books → Ledger → Journals (design/core-modules/boards/view/BkJournals.html):
 * the tabs by state, the search with Period, Made by and Filters, and eight
 * columns on 32px rows; a draft has no number yet. A row opens its lines in a
 * drawer.
 */
export function JournalsPageView({
  data,
  onQuery,
  onOpen,
  onPost,
  exportHref,
}: {
  data: JournalsView;
  onQuery: (next: Partial<JournalQuery>) => void;
  onOpen: (id: string) => void;
  onPost: (rows: JournalRow[]) => void;
  exportHref: string;
}) {
  const ids = React.useMemo(() => data.rows.map((row) => row.id), [data.rows]);
  const source = React.useMemo(() => data.rows, [data.rows]);
  const layout = useBkLayout(
    "journals",
    [
      { key: "narrative", label: "Narrative", nth: 3 },
      { key: "date", label: "Date", nth: 4 },
      { key: "by", label: "Made by", nth: 5 },
      { key: "state", label: "State", nth: 6 },
      { key: "note", label: "Note", nth: 8 },
    ],
    [
      { key: "state", label: "State", by: (row) => JOURNAL_STATE_WORD[row.state] },
      { key: "by", label: "Made by", by: (row) => row.madeBy.name },
    ],
    source,
  );
  const selection = useSelection(ids);
  const query = data.query;
  const selected = data.rows.filter((row) => selection.isSelected(row.id));
  const drafts = selected.filter((row) => row.state === "draft");
  const { from, to, of } = data.range;
  const c = data.currency;
  const maker = data.makers.find((option) => option.id === query.by);
  const sourceChosen = data.sources.find((option) => option.value === query.source);
  const filtered = Boolean(query.q || query.source || query.by || query.period !== "any");

  const filters: MenuEntry[] = [
    { key: "any", label: "Any source", checked: !query.source, onSelect: () => onQuery({ source: "", page: 1 }) },
    { separator: true },
    ...data.sources.map((option) => ({ key: option.value, label: option.label, checked: query.source === option.value, onSelect: () => onQuery({ source: option.value, page: 1 }) })),
  ];

  return (
    <div className="bk bk-dense">
      <BkTabs
        label="Journals"
        value={query.tab}
        onChange={(tab) => onQuery({ tab, page: 1 })}
        items={JOURNAL_TABS.map((tab) => ({ value: tab, label: JOURNAL_TAB_LABEL[tab], count: data.counts[tab] }))}
      />
      <BkTools
        find="Search journals"
        query={query.q}
        onFind={(q) => onQuery({ q, page: 1 })}
        count={of.toLocaleString("en-GB")}
        chips={
          <>
            <BkChip
              label="Period"
              value={data.periodLabel}
              set={query.period !== "any"}
              items={data.periods.map((option) => ({ key: option.value, label: option.label, checked: query.period === option.value, onSelect: () => onQuery({ period: option.value, page: 1 }) }))}
            />
            <BkChip
              label="Made by"
              value={maker?.name ?? "Anyone"}
              set={Boolean(maker)}
              items={[
                { key: "anyone", label: "Anyone", checked: !query.by, onSelect: () => onQuery({ by: "", page: 1 }) },
                { separator: true },
                ...data.makers.map((option) => ({ key: option.id, label: <Person name={option.name} src={option.image ?? undefined} />, checked: query.by === option.id, onSelect: () => onQuery({ by: option.id, page: 1 }) })),
              ]}
            />
          </>
        }
        filters={filters}
        end={
          <>
            <MenuButton
              variant="quiet"
              icon="sort"
              label="Sort"
              items={JOURNAL_SORTS.map((sort) => ({ key: sort, label: JOURNAL_SORT_LABEL[sort], checked: query.sort === sort, onSelect: () => onQuery({ sort, page: 1 }) }))}
            >
              Sort
            </MenuButton>
            {layout.tools}
            <a className="btn" href={exportHref} download>
              <Icon name="export" />
              Export
            </a>
          </>
        }
      />
      <div className={layout.wrap} style={{ display: "contents" }}>
        {layout.style}
        <TableShell
          label="Journals"
          foot={
            <TableFoot
              range={of === 0 ? "None" : `${from} to ${to} of ${of.toLocaleString("en-GB")}`}
              page={{
                onPrevious: query.page > 1 ? () => onQuery({ page: query.page - 1 }) : undefined,
                onNext: to < of ? () => onQuery({ page: query.page + 1 }) : undefined,
              }}
              selection={{
                count: selected.length,
                sum: { label: "Total", value: money(selected.reduce((sum, row) => sum + row.amount, 0), c) },
                onClear: selection.clear,
                note: selected.length > drafts.length && drafts.length ? "Only drafts post; the rest are skipped" : undefined,
                actions:
                  drafts.length && data.can.post ? (
                    <Button icon="check" onClick={() => onPost(drafts)}>
                      Post {drafts.length}
                    </Button>
                  ) : null,
              }}
            />
          }
        >
          {data.rows.length === 0 ? (
            <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
              <b>{filtered ? "No journal matches" : query.tab === "all" ? "No journals yet" : `No ${JOURNAL_TAB_LABEL[query.tab].toLowerCase()} journals`}</b>
            </div>
          ) : (
            <table className="table" aria-label="Journals">
              <colgroup>
                <col style={{ width: 44 }} />
                <col style={{ width: 112 }} />
                <col />
                <col style={{ width: 72 }} />
                <col style={{ width: 168 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 128 }} />
                <col style={{ width: 280 }} />
              </colgroup>
              <thead>
                <tr>
                  <SelectCell head checked={selection.all} indeterminate={selection.some} onChange={selection.toggleAll} label="Select every journal" />
                  <th>Number</th>
                  <th>Narrative</th>
                  <th>Date</th>
                  <th>Made by</th>
                  <th>State</th>
                  <th className="num">Amount, {c}</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {layout.rows((row) => (
                  <tr
                    key={row.id}
                    aria-selected={selection.isSelected(row.id) || undefined}
                    tabIndex={0}
                    style={{ cursor: "pointer" }}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest("label.check")) return;
                      onOpen(row.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") onOpen(row.id);
                    }}
                  >
                    <SelectCell checked={selection.isSelected(row.id)} onChange={() => selection.toggle(row.id)} label={`Select ${row.ref ?? row.memo}`} />
                    <td>{row.ref ? <span className="ref">{row.ref}</span> : <span className="muted">No number</span>}</td>
                    <td className="fill truncate" title={row.memo}>
                      <span className="cell-lead">{row.memo}</span>
                    </td>
                    <td className="muted">{row.date}</td>
                    <td>
                      <span className="cell-lead">
                        <Person name={row.madeBy.name} src={row.madeBy.image ?? undefined} />
                      </span>
                    </td>
                    <td>
                      <BkState tone={TONE[row.state]}>{JOURNAL_STATE_WORD[row.state]}</BkState>
                    </td>
                    <td className="num">
                      <Cents value={row.amount} currency={c} />
                    </td>
                    <td className="muted truncate" title={row.note ?? undefined}>
                      {row.note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TableShell>
      </div>
    </div>
  );
}

/**
 * One journal in a drawer: its lines with their cost centres, and what can be
 * done by its state and by this person's rights. Post (or send for a second
 * person), Approve and post, Send back, Delete a draft; Reverse a posted
 * manual journal, for the owner or whoever may void.
 */
export function JournalDrawer({
  journal,
  open,
  onOpenChange,
  onAct,
  busy,
  can,
}: {
  journal: JournalDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAct: (action: "post" | "approve" | "withdraw" | "reverse" | "delete", input: { reason?: string; periodOverrideReason?: string }) => void;
  busy: boolean;
  can: JournalCan | null;
}) {
  const [reason, setReason] = React.useState("");
  const [reversing, setReversing] = React.useState(false);
  React.useEffect(() => {
    setReason("");
    setReversing(false);
  }, [journal?.id, open]);
  const state = journal?.state;
  const title = journal ? journal.ref ?? "Draft journal" : "Journal";
  const footer = !journal || !can ? null : state === "draft" ? (
    <>
      {can.deleteDraft ? (
        <Button variant="quiet" icon="x" disabled={busy} onClick={() => onAct("delete", {})}>
          Delete the draft
        </Button>
      ) : null}
      {can.post ? (
        <Button variant="primary" icon="check" shortcut="Ctrl ↵" busy={busy} disabled={busy || (journal.needsReason && reason.trim().length < 3)} onClick={() => onAct("post", { periodOverrideReason: reason.trim() || undefined })}>
          Post this journal
        </Button>
      ) : null}
    </>
  ) : state === "to-approve" && can.post ? (
    <>
      <Button disabled={busy} onClick={() => onAct("withdraw", { reason: reason.trim() || undefined })}>
        Send back
      </Button>
      <Button variant="primary" icon="check" shortcut="Ctrl ↵" busy={busy} disabled={busy || (journal.needsReason && reason.trim().length < 3)} onClick={() => onAct("approve", { periodOverrideReason: reason.trim() || undefined })}>
        Approve and post
      </Button>
    </>
  ) : state === "posted" && journal.manual && can.reverse ? (
    reversing ? (
      <>
        <Button variant="quiet" onClick={() => setReversing(false)}>
          Cancel
        </Button>
        <Button variant="primary" icon="history" shortcut="Ctrl ↵" busy={busy} disabled={busy || reason.trim().length < 3} onClick={() => onAct("reverse", { reason: reason.trim() })}>
          Reverse it
        </Button>
      </>
    ) : (
      <Button icon="history" onClick={() => setReversing(true)}>
        Reverse
      </Button>
    )
  ) : null;
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={title} sub={journal ? journal.meta : undefined} width={640} footer={footer}>
      {journal ? (
        <div className="bk-dense" style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: 16 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "16px 24px 0" }}>
            <b style={{ fontSize: 16, color: "var(--color-ink)", flex: 1 }}>{journal.memo}</b>
            <BkState tone={TONE[journal.state]}>{JOURNAL_STATE_WORD[journal.state]}</BkState>
          </div>
          <table className="table" style={{ tableLayout: "fixed" }} aria-label="Lines">
            <colgroup>
              <col />
              <col style={{ width: 150 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 110 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Account</th>
                <th>Cost centre</th>
                <th className="num">Debit</th>
                <th className="num">Credit</th>
              </tr>
            </thead>
            <tbody>
              {journal.lines.map((line, index) => (
                <tr key={index}>
                  <td className="truncate">
                    <span className="bk-code">{line.code}</span> {line.account}
                  </td>
                  <td className="truncate">{line.costCentre ?? <span className="muted">General</span>}</td>
                  <td className="num">{line.debit ? n2(line.debit) : ""}</td>
                  <td className="num">{line.credit ? n2(line.credit) : ""}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="tot">
                <td>Totals</td>
                <td>{Math.abs(journal.totals.debit - journal.totals.credit) < 0.005 ? "Balanced" : "Does not balance"}</td>
                <td className="num">{n2(journal.totals.debit)}</td>
                <td className="num">{n2(journal.totals.credit)}</td>
              </tr>
            </tfoot>
          </table>
          {[journal.currencyNote, journal.waitingFor, journal.link].filter(Boolean).map((note) => (
            <span key={note} className="muted" style={{ padding: "0 24px" }}>
              {note}
            </span>
          ))}
          {journal.attachment ? (
            <a className="ref" style={{ padding: "0 24px" }} href={journal.attachment.url} target="_blank" rel="noreferrer">
              {journal.attachment.name}
            </a>
          ) : null}
          {(state === "draft" || state === "to-approve") && journal.needsReason ? (
            <div style={{ padding: "0 24px" }}>
              <Field label="Why it posts into a closed month" htmlFor="journal-reason">
                <Input id="journal-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
              </Field>
            </div>
          ) : null}
          {reversing ? (
            <div style={{ padding: "0 24px" }}>
              <Field label="Why it is reversed" htmlFor="journal-reason">
                <Input id="journal-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
              </Field>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="skeleton" style={{ height: 200, margin: 24 }} />
      )}
    </Drawer>
  );
}
