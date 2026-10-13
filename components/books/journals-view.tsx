"use client";

import * as React from "react";

import { Button, Field, Icon, Input } from "@/components/core";
import { money } from "@/lib/books/format";
import type { JournalDetail, JournalQuery, JournalsView, JournalState, JournalTab } from "@/lib/books/journals";

const TABS: Array<{ value: JournalTab; label: string }> = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "posted", label: "Posted" },
  { value: "reversed", label: "Reversed" },
  { value: "voided", label: "Voided" },
];

const PILL: Record<JournalState, { cls: string; label: string }> = {
  posted: { cls: "pill pill-ok", label: "Posted" },
  draft: { cls: "pill pill-warn", label: "Draft" },
  reversed: { cls: "pill pill-n", label: "Reversed" },
  voided: { cls: "pill pill-n", label: "Voided" },
};

/** The same states as a dot and a word, for the table. */
const STATUS: Record<JournalState, { cls: string; label: string }> = {
  posted: { cls: "status status-success", label: "Posted" },
  draft: { cls: "status status-warning", label: "Draft" },
  reversed: { cls: "status", label: "Reversed" },
  voided: { cls: "status", label: "Voided" },
};

const plain = (n: number) => (n ? n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");

/** One journal beside the list: its lines, and Post or Reverse. */
export function JournalAside({
  journal,
  onClose,
  onPost,
  onReverse,
  busy = false,
}: {
  journal: JournalDetail;
  onClose: () => void;
  onPost: (reason: string | undefined) => void;
  onReverse: (reason: string | undefined) => void;
  busy?: boolean;
}) {
  const [reason, setReason] = React.useState("");
  const [reversing, setReversing] = React.useState(false);
  React.useEffect(() => {
    setReason("");
    setReversing(false);
  }, [journal.id]);
  const pill = PILL[journal.state];
  return (
    <aside className="kaside" aria-label={journal.ref} style={{ width: 400, padding: 0, gap: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, height: 56, padding: "0 12px 0 24px", boxShadow: "inset 0 -1px 0 var(--color-line)", flex: "none" }}>
        <span className="mono" style={{ fontWeight: 600, color: "var(--color-ink)" }}>
          {journal.ref}
        </span>
        <span className={pill.cls}>{pill.label}</span>
        <span style={{ flex: 1 }} />
        <Button variant="quiet" iconOnly icon="x" label="Close" onClick={onClose} />
      </div>
      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 4 }}>
        <b style={{ fontSize: 16, color: "var(--color-ink)" }}>{journal.memo}</b>
        <span className="muted">{journal.meta}</span>
      </div>
      <div className="wt" style={{ flex: "none" }}>
        <table className="table" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 64 }} />
            <col />
            <col style={{ width: 90 }} />
            <col style={{ width: 90 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Code</th>
              <th>Account</th>
              <th className="num">Debit</th>
              <th className="num">Credit</th>
            </tr>
          </thead>
          <tbody>
            {journal.lines.map((line, index) => (
              <tr key={index}>
                <td>
                  <span className="ref">{line.code}</span>
                </td>
                <td>{line.account}</td>
                <td className="num">{plain(line.debit)}</td>
                <td className="num">{plain(line.credit)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="tot">
              <td />
              <td>Totals</td>
              <td className="num">{plain(journal.totals.debit)}</td>
              <td className="num">{plain(journal.totals.credit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {journal.periodNote ? (
        <p className="muted" style={{ padding: "16px 24px" }}>
          {journal.periodNote}
        </p>
      ) : null}
      {(journal.state === "draft" && journal.needsReason) || reversing ? (
        <div style={{ padding: "0 24px 16px" }}>
          <Field label={reversing ? "Why it is reversed" : "Why it posts into a closed month"} htmlFor="journal-reason" optional={reversing}>
            <Input id="journal-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
        </div>
      ) : null}
      <span style={{ flex: 1 }} />
      {journal.state === "draft" ? (
        <div className="drawer-f">
          <Button
            variant="primary"
            icon="check"
            shortcut="Ctrl ↵"
            busy={busy}
            disabled={busy || (journal.needsReason && reason.trim().length < 3)}
            onClick={() => onPost(reason.trim() || undefined)}
          >
            Post this journal
          </Button>
        </div>
      ) : journal.state === "posted" ? (
        <div className="drawer-f">
          {reversing ? (
            <>
              <Button variant="quiet" onClick={() => setReversing(false)}>
                Cancel
              </Button>
              <Button variant="primary" icon="history" shortcut="Ctrl ↵" busy={busy} disabled={busy} onClick={() => onReverse(reason.trim() || undefined)}>
                Reverse it
              </Button>
            </>
          ) : (
            <Button icon="history" onClick={() => setReversing(true)}>
              Reverse
            </Button>
          )}
        </div>
      ) : null}
    </aside>
  );
}

/**
 * Books → Journals (PageBooksJournals): the tools, the finding, the list with
 * what is in draft at its foot, and the chosen journal beside it.
 */
export function JournalsPageView({
  data,
  selectedId,
  aside,
  onQuery,
  onSelect,
  exportHref,
}: {
  data: JournalsView;
  selectedId: string | null;
  aside: React.ReactNode;
  onQuery: (next: Partial<JournalQuery>) => void;
  onSelect: (id: string) => void;
  exportHref: string;
}) {
  const [q, setQ] = React.useState(data.query.q);
  React.useEffect(() => {
    if (q === data.query.q) return;
    const timer = window.setTimeout(() => onQuery({ q, page: 1 }), 300);
    return () => window.clearTimeout(timer);
  }, [q, data.query.q, onQuery]);
  const { from, to, of } = data.range;
  return (
    <div style={{ flex: "1 1 auto", display: "flex", minHeight: 0 }}>
      <div className="kbody">
        <div className="ws-tools tl-narrow">
          <label className="input-wrap ws-find">
            <Icon name="search" />
            <input type="search" aria-label="Search journals" placeholder="Search journals" value={q} onChange={(event) => setQ(event.target.value)} />
          </label>
          <div className="seg" role="tablist" aria-label="Journals">
            {TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={data.query.tab === tab.value}
                tabIndex={data.query.tab === tab.value ? 0 : -1}
                onClick={() => onQuery({ tab: tab.value, page: 1 })}
              >
                {tab.label}
                {(tab.value === "all" || tab.value === "draft") && data.counts[tab.value] ? (
                  <>
                    {" "}
                    <span className="n">{data.counts[tab.value]}</span>
                  </>
                ) : null}
              </button>
            ))}
          </div>
          <div className="end">
            <a className="btn" href={exportHref} download aria-label="Export">
              <Icon name="export" />
              <span className="tl-lbl">Export</span>
            </a>
          </div>
        </div>
        <div className="finding">
          <p className="lede-figure">
            {data.finding.fact}
            {data.finding.rest ? <span className="q"> {data.finding.rest}</span> : null}
          </p>
        </div>
        {data.rows.length === 0 ? (
          <p className="muted" style={{ padding: "0 24px" }}>
            {data.query.q ? "No journal matches. Clear the search to see the rest." : "No journals here."}
          </p>
        ) : (
          <div className="wt table-wrap" style={{ flex: "none", display: "block" }}>
            <table className="table" style={{ tableLayout: "fixed", minWidth: 680 }}>
              <colgroup>
                <col style={{ width: 100 }} />
                <col style={{ width: 80 }} />
                <col />
                <col style={{ width: 130 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 110 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Date</th>
                  <th>Memo</th>
                  <th>Source</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr
                    key={row.id}
                    aria-selected={row.id === selectedId || undefined}
                    tabIndex={0}
                    style={{ cursor: "pointer" }}
                    onClick={() => onSelect(row.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") onSelect(row.id);
                    }}
                  >
                    <td>
                      <span className="ref">{row.ref}</span>
                    </td>
                    <td className="muted">{row.date}</td>
                    <td className="fill" title={row.memo}>
                      <span className="cell-lead">{row.memo}</span>
                    </td>
                    <td className="muted">{row.source}</td>
                    <td className="num">{money(row.amount)}</td>
                    <td>
                      <span className={STATUS[row.state].cls}>{STATUS[row.state].label}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="tot">
                  <td>
                    {data.rows.length} of {of}
                  </td>
                  <td />
                  <td className="fill" />
                  <td>In draft</td>
                  <td className="num">{money(data.draftTotal)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <div className="table-foot foot-row" style={{ marginTop: "auto" }}>
          <span className="num">{of === 0 ? "None" : `${from} to ${to} of ${of}`}</span>
          <span style={{ flex: 1 }} />
          {data.query.page > 1 || to < of ? (
            <>
              <Button icon="back" disabled={data.query.page <= 1} onClick={() => onQuery({ page: data.query.page - 1 })}>
                Previous
              </Button>
              <Button iconEnd="chev" disabled={to >= of} onClick={() => onQuery({ page: data.query.page + 1 })}>
                Next
              </Button>
            </>
          ) : null}
        </div>
      </div>
      {aside}
    </div>
  );
}
