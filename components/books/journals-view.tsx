"use client";

import * as React from "react";

import { Button, Drawer, Field, Input, SelectCell, TableFoot, TableShell, useSelection } from "@/components/core";
import { money } from "@/lib/books/format";
import {
  JOURNAL_SORT_LABEL,
  JOURNAL_SORTS,
  JOURNAL_STATE_WORD,
  JOURNAL_TAB_LABEL,
  JOURNAL_TABS,
  type JournalDetail,
  type JournalQuery,
  type JournalRow,
  type JournalsView,
} from "@/lib/books/journals";

import { Lead, n2, St } from "./bk-b";
import { BkChip, BkQuietTools, BkTabs, BkTools } from "./bk-list";
import { BooksFinding } from "./figures";

const STATE_TONE: Record<JournalRow["state"], string> = { draft: "Draft", "to-approve": "To approve", posted: "Posted", reversed: "Reversed", voided: "Void" };

/**
 * Books → Ledger → Journals (design/core-modules/boards/view/BkJournals.html):
 * the finding, the tabs by state, the search with Sort and Source, and six
 * columns; a draft has no number yet. A row opens its lines in a drawer.
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
  const selection = useSelection(ids);
  const query = data.query;
  const selected = data.rows.filter((row) => selection.isSelected(row.id));
  const drafts = selected.filter((row) => row.state === "draft");
  const { from, to, of } = data.range;
  const c = data.currency;
  const source = data.sources.find((option) => option.value === query.source);
  const filtered = Boolean(query.q || query.source);
  return (
    <div className="bk">
      <BooksFinding finding={data.finding} />
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
        count={`${of.toLocaleString("en-GB")} ${of === 1 ? "journal" : "journals"}`}
        chips={
          <>
            <BkChip
              label="Sort"
              value={JOURNAL_SORT_LABEL[query.sort]}
              set={query.sort === "needs"}
              items={JOURNAL_SORTS.map((sort) => ({ key: sort, label: JOURNAL_SORT_LABEL[sort], checked: query.sort === sort, onSelect: () => onQuery({ sort, page: 1 }) }))}
            />
            <BkChip
              label="Source"
              value={source?.label ?? "Any"}
              set={Boolean(source)}
              items={[
                { key: "any", label: "Any source", checked: !query.source, onSelect: () => onQuery({ source: "", page: 1 }) },
                { separator: true },
                ...data.sources.map((option) => ({ key: option.value, label: option.label, checked: query.source === option.value, onSelect: () => onQuery({ source: option.value, page: 1 }) })),
              ]}
            />
          </>
        }
        end={<BkQuietTools exportHref={exportHref} />}
      />
      <TableShell
        label="Journals"
        foot={
          <TableFoot
            range={of === 0 ? "None" : `${from} to ${to} of ${of.toLocaleString("en-GB")}`}
            sums={[
              { label: "Drafts", value: money(data.draftTotal, c) },
              { label: "To approve", value: money(data.waitingTotal, c) },
            ]}
            page={{
              onPrevious: query.page > 1 ? () => onQuery({ page: query.page - 1 }) : undefined,
              onNext: to < of ? () => onQuery({ page: query.page + 1 }) : undefined,
            }}
            selection={{
              count: selected.length,
              sum: { label: "Total", value: money(selected.reduce((sum, row) => sum + row.amount, 0), c) },
              onClear: selection.clear,
              note: selected.length > drafts.length && drafts.length ? "Only drafts post; the rest are skipped" : undefined,
              actions: drafts.length ? (
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
            <p className="muted">{filtered ? "Clear the search or the Source to see the rest." : "Make one with New journal. Documents post their own journals here as they are issued."}</p>
          </div>
        ) : (
          <table className="table" aria-label="Journals">
            <colgroup>
              <col style={{ width: 44 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 90 }} />
              <col />
              <col style={{ width: 150 }} />
              <col style={{ width: 130 }} />
            </colgroup>
            <thead>
              <tr>
                <SelectCell head checked={selection.all} indeterminate={selection.some} onChange={selection.toggleAll} label="Select every row on this page" />
                <th>Number</th>
                <th>Date</th>
                <th className="fill">Memo</th>
                <th className="num">Amount</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
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
                  <td>{row.ref ? <span className="ref">{row.ref}</span> : <span className="muted">No number yet</span>}</td>
                  <td>
                    <span className="muted">{row.date}</span>
                  </td>
                  <td className="fill truncate" title={row.memo}>
                    <Lead sub={row.source}>{row.memo}</Lead>
                  </td>
                  <td className="num">{money(row.amount, c)}</td>
                  <td>
                    <St word={STATE_TONE[row.state]} label={JOURNAL_STATE_WORD[row.state]} />
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

/**
 * One journal in a drawer: its lines with their cost centres, the slip, and
 * what can be done by its state. Post (or send for a second person), Approve
 * and post, Send back, Delete a draft; Reverse a posted manual journal.
 */
export function JournalDrawer({
  journal,
  open,
  onOpenChange,
  onAct,
  busy,
}: {
  journal: JournalDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAct: (action: "post" | "approve" | "withdraw" | "reverse" | "delete", input: { reason?: string; periodOverrideReason?: string }) => void;
  busy: boolean;
}) {
  const [reason, setReason] = React.useState("");
  const [reversing, setReversing] = React.useState(false);
  React.useEffect(() => {
    setReason("");
    setReversing(false);
  }, [journal?.id, open]);
  const state = journal?.state;
  const title = journal ? journal.ref ?? "Draft journal" : "Journal";
  const footer = !journal ? null : state === "draft" ? (
    <>
      <Button variant="quiet" icon="x" disabled={busy} onClick={() => onAct("delete", {})}>
        Delete the draft
      </Button>
      <Button variant="primary" icon="check" shortcut="Ctrl ↵" busy={busy} disabled={busy || (journal.needsReason && reason.trim().length < 3)} onClick={() => onAct("post", { periodOverrideReason: reason.trim() || undefined })}>
        Post this journal
      </Button>
    </>
  ) : state === "to-approve" ? (
    <>
      <Button disabled={busy} onClick={() => onAct("withdraw", { reason: reason.trim() || undefined })}>
        Send back
      </Button>
      <Button variant="primary" icon="check" shortcut="Ctrl ↵" busy={busy} disabled={busy || (journal.needsReason && reason.trim().length < 3)} onClick={() => onAct("approve", { periodOverrideReason: reason.trim() || undefined })}>
        Approve and post
      </Button>
    </>
  ) : state === "posted" && journal.manual ? (
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
        <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: 16 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "16px 24px 0" }}>
            <b style={{ fontSize: 16, color: "var(--color-ink)", flex: 1 }}>{journal.memo}</b>
            <St word={STATE_TONE[journal.state]} label={JOURNAL_STATE_WORD[journal.state]} />
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
                    <span className="ref">{line.code}</span> {line.account}
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
          {[journal.currencyNote, journal.waitingFor, journal.link, journal.periodNote].filter(Boolean).map((note) => (
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
              <Field label="Why it is reversed" htmlFor="journal-reason" help="Kept in the audit trail. The mirror is dated today.">
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
