"use client";

import * as React from "react";

import { Button, ButtonLink, Empty, Icon, Select, SelectCell, TableFoot, TableShell, useSelection } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { money } from "@/lib/books/format";
import type { NeedsPostingQuery, NeedsPostingRow, NeedsPostingTab, NeedsPostingView } from "@/lib/books/needs-posting";

import { BooksFinding } from "./figures";

export type NeedsPostingData = NeedsPostingView & {
  can: { retry: boolean; map: boolean; redate: boolean; delete: boolean };
  accounts: Array<{ id: string; code: string; name: string }>;
};

/** "$367.20", or nothing for an event with no amount. */
const amountWords = (row: Pick<NeedsPostingRow, "amount" | "currency">) => (row.amount === null ? "" : money(row.amount, row.currency));

const TABS: Array<{ value: NeedsPostingTab; label: string }> = [
  { value: "failed", label: "Failed" },
  { value: "waiting", label: "Waiting" },
];

/** This month's name, for "Post in October". */
const thisMonth = () => new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "Africa/Harare" }).format(new Date());

/** Under the chosen row: what fixes it, and how often it has been tried. */
function FixPanel({
  row,
  can,
  accounts,
  busy,
  onMap,
  onRedate,
  onRetry,
  onDelete,
}: {
  row: NeedsPostingRow;
  can: NeedsPostingData["can"];
  accounts: NeedsPostingData["accounts"];
  busy: boolean;
  onMap: (accountId: string) => void;
  onRedate: () => void;
  onRetry: () => void;
  onDelete: () => void;
}) {
  const [account, setAccount] = React.useState("");
  React.useEffect(() => setAccount(""), [row.id]);
  const fix = row.fix;
  const month = thisMonth();
  let left: React.ReactNode;
  if (fix?.kind === "map") {
    left = (
      <>
        <div className="bk-h3">Map the missing account</div>
        <div className="bk-fld">
          <span className="bk-lab" id={`map-${row.id}-l`}>
            {fix.label}
          </span>
          <Select aria-labelledby={`map-${row.id}-l`} value={account} onChange={(event) => setAccount(event.target.value)} disabled={!can.map}>
            <option value="">Choose an account</option>
            {accounts.map((option) => (
              <option key={option.id} value={option.id}>
                {option.code} {option.name}
              </option>
            ))}
          </Select>
        </div>
        {can.map ? (
          <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
            <Button variant="ink" icon="check" shortcut="Ctrl ↵" busy={busy} disabled={busy || !account} onClick={() => onMap(account)}>
              Map and retry
            </Button>
            <ButtonLink variant="quiet" icon="plus" href="/books/chart">
              Make a new account
            </ButtonLink>
          </div>
        ) : (
          <span className="muted" style={{ fontSize: 13 }}>
            The owner or the accountant maps accounts.
          </span>
        )}
      </>
    );
  } else if (fix?.kind === "month") {
    left = (
      <>
        <div className="bk-h3">{fix.month ? `${fix.month} is closed` : "Its date is frozen"}</div>
        <span className="muted" style={{ fontSize: 13 }}>
          Closed months are never posted into on their own. Post it in {month}, or reopen the month first.
        </span>
        {can.redate ? (
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <Button variant="ink" icon="check" shortcut="Ctrl ↵" busy={busy} disabled={busy} onClick={onRedate}>
              Post in {month}
            </Button>
          </div>
        ) : (
          <span className="muted" style={{ fontSize: 13 }}>
            Ask the owner to post it in {month}.
          </span>
        )}
      </>
    );
  } else if (fix?.kind === "rule") {
    left = (
      <>
        <div className="bk-h3">{fix.label}</div>
        <span className="muted" style={{ fontSize: 13 }}>
          {row.why}. Once a rule says where it goes, Retry posts it.
        </span>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <ButtonLink icon="posting" href={fix.href}>
            Posting rules
          </ButtonLink>
        </div>
      </>
    );
  } else {
    left = (
      <>
        <div className="bk-h3">Why it didn’t post</div>
        <span className="muted" style={{ fontSize: 13 }}>
          {row.why}.
        </span>
        {can.retry ? (
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <Button variant="ink" icon="arrow" shortcut="Ctrl ↵" busy={busy} disabled={busy} onClick={onRetry}>
              Retry now
            </Button>
          </div>
        ) : null}
      </>
    );
  }
  return (
    <div className="bk-map" aria-label={`Fix ${row.ref ?? row.title}`}>
      <div>
        {left}
        {can.delete ? (
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--color-border-subtle, rgba(0,0,0,0.08))" }}>
            <Button
              variant="quiet"
              icon="x"
              disabled={busy}
              onClick={onDelete}
              style={{ color: "var(--color-danger, #d32f2f)" }}
            >
              Delete event
            </Button>
          </div>
        ) : null}
      </div>
      <div>
        <div className="bk-h3">Tries</div>
        <dl className="attrs">
          <dt>First</dt>
          <dd>{row.tries.first}</dd>
          <dt>Last</dt>
          <dd>{row.tries.last}</dd>
          <dt>Tries</dt>
          <dd>{row.tries.count}</dd>
          <dt>Next</dt>
          <dd>{row.tries.next}</dd>
        </dl>
      </div>
    </div>
  );
}

/**
 * Close the month → Needs posting (BkNeedsPosting): the finding, Failed and
 * Waiting, the list with the chosen row's fix under it, and the foot.
 */
export function NeedsPostingPageView({
  data,
  selectedId,
  busy,
  exportHref,
  onQuery,
  onSelect,
  onRetry,
  onMap,
  onRedate,
  onDelete,
}: {
  data: NeedsPostingData;
  selectedId: string | null;
  busy: boolean;
  exportHref: string;
  onQuery: (next: Partial<NeedsPostingQuery>) => void;
  onSelect: (id: string) => void;
  onRetry: (ids: string[]) => void;
  onMap: (id: string, accountId: string) => void;
  onRedate: (id: string) => void;
  onDelete: (ids: string[]) => void;
}) {
  const [q, setQ] = React.useState(data.query.q);
  React.useEffect(() => {
    if (q === data.query.q) return;
    const timer = window.setTimeout(() => onQuery({ q }), 300);
    return () => window.clearTimeout(timer);
  }, [q, data.query.q, onQuery]);

  const ids = React.useMemo(() => data.rows.map((row) => row.id), [data.rows]);
  const selection = useSelection(ids);
  const selectedIds = React.useMemo(() => data.rows.filter((row) => selection.isSelected(row.id)).map((row) => row.id), [data.rows, selection]);
  const [confirmDeleteIds, setConfirmDeleteIds] = React.useState<string[] | null>(null);

  const selected = data.rows.find((row) => row.id === selectedId) ?? data.rows[0] ?? null;
  const source = data.sources.find((option) => option.value === data.query.source);
  const tabWord = data.query.tab === "failed" ? "failed" : "waiting";

  return (
    <>
      <BooksFinding finding={data.finding} />
      <div className="tabs bk-tabs" role="tablist" aria-label="Needs posting">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            className="tab"
            aria-selected={data.query.tab === tab.value}
            tabIndex={data.query.tab === tab.value ? 0 : -1}
            onClick={() => onQuery({ tab: tab.value })}
          >
            {tab.label} <span className="n">{data.counts[tab.value]}</span>
          </button>
        ))}
      </div>
      <div className="ws-tools tl-narrow">
        <label className="input-wrap ws-find">
          <Icon name="search" />
          <input type="search" aria-label="Search events" placeholder="Search events" value={q} onChange={(event) => setQ(event.target.value)} />
        </label>
        <MenuButton
          className="chipsel"
          label="Source"
          iconEnd="down"
          items={[
            { key: "any", label: "Any source", checked: !data.query.source, onSelect: () => onQuery({ source: "" }) },
            ...(data.sources.length ? [{ separator: true as const }] : []),
            ...data.sources.map((option) => ({ key: option.value, label: option.label, checked: data.query.source === option.value, onSelect: () => onQuery({ source: option.value }) })),
          ]}
        >
          Source <b>{source?.label ?? "Any"}</b>
        </MenuButton>
        <span className="ws-n">{data.rows.length === 1 ? "1 event" : `${data.rows.length} events`}</span>
        <div className="end">
          <span className="sepv" />
          <a className="btn" href={exportHref} download>
            <Icon name="export" />
            <span className="tl-lbl">Export</span>
          </a>
        </div>
      </div>
      {data.rows.length === 0 ? (
        <Empty icon="done" title={data.query.q || data.query.source ? "Nothing matches" : data.query.tab === "failed" ? "Nothing failed to post" : "Nothing is waiting"}>
          {data.query.q || data.query.source
            ? "Clear the search or the source to see the rest."
            : "Every money event reached the ledger. When one can’t post, it shows here with the reason and a way to fix it."}
        </Empty>
      ) : (
        <TableShell
          label="Money that has not reached the ledger"
          foot={
            <TableFoot
              range={`${data.rows.length} ${tabWord}`}
              sums={[
                ...(data.total ? [{ label: "Amount", value: money(data.total.amount, data.total.currency) }] : []),
                ...(data.heldUp ? [{ label: "Month held up", value: data.heldUp }] : []),
              ]}
              selection={
                selectedIds.length === 0
                  ? undefined
                  : {
                      count: selectedIds.length,
                      onClear: selection.clear,
                      actions: (
                        <>
                          {data.can.retry ? (
                            <Button
                              icon="arrow"
                              disabled={busy}
                              onClick={() => onRetry(selectedIds)}
                            >
                              Retry selected
                            </Button>
                          ) : null}
                          {data.can.delete ? (
                            <Button
                              variant="danger"
                              icon="x"
                              disabled={busy}
                              onClick={() => setConfirmDeleteIds(selectedIds)}
                            >
                              Delete selected
                            </Button>
                          ) : null}
                        </>
                      ),
                    }
              }
            />
          }
        >
          <table className="table">
            <colgroup>
              <col style={{ width: 44 }} />
              <col />
              <col style={{ width: "1%" }} />
              <col style={{ width: "1%" }} />
              <col style={{ width: "1%" }} />
              <col style={{ width: 100 }} />
            </colgroup>
            <thead>
              <tr>
                <SelectCell
                  head
                  checked={selection.all}
                  indeterminate={selection.some}
                  onChange={selection.toggleAll}
                  label="Select every event on this page"
                />
                <th>Document</th>
                <th>Since</th>
                <th className="num">Amount</th>
                <th>Why it didn’t post</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => {
                const on = row.id === selected?.id;
                return (
                  <React.Fragment key={row.id}>
                    <tr
                      className={on ? "bk-sel" : undefined}
                      aria-selected={on || selection.isSelected(row.id) || undefined}
                      tabIndex={0}
                      style={{ cursor: "pointer" }}
                      onClick={() => onSelect(row.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && event.target === event.currentTarget) onSelect(row.id);
                      }}
                    >
                      <SelectCell
                        checked={selection.isSelected(row.id)}
                        onChange={() => selection.toggle(row.id)}
                        label={`Select ${row.ref ?? row.title}`}
                      />
                      <td className="fill bk-fw">
                        <span className="cell-lead">
                          {row.ref ? <span className="ref">{row.ref}</span> : null} {row.href ? <a href={row.href} onClick={(event) => event.stopPropagation()}>{row.title}</a> : row.title}
                        </span>
                        {row.sub ? (
                          <span className="sub" style={{ display: "block", fontSize: 12, color: "var(--color-muted)" }}>
                            {row.sub}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <span className="muted" style={{ whiteSpace: "nowrap" }}>
                          {row.since}
                        </span>
                      </td>
                      <td className="num">{amountWords(row)}</td>
                      <td>
                        <span style={{ color: "var(--color-ink)" }}>{row.why}</span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }} onClick={(event) => event.stopPropagation()}>
                          {data.can.retry && !row.held ? (
                            <Button
                              size="sm"
                              icon="arrow"
                              disabled={busy}
                              onClick={() => onRetry([row.id])}
                            >
                              Retry
                            </Button>
                          ) : null}
                          {data.can.delete ? (
                            <Button
                              size="sm"
                              variant="quiet"
                              icon="x"
                              disabled={busy}
                              aria-label="Delete event"
                              title="Delete event and remove from failed to post"
                              onClick={() => setConfirmDeleteIds([row.id])}
                            />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          {selected ? (
            <FixPanel
              row={selected}
              can={data.can}
              accounts={data.accounts}
              busy={busy}
              onMap={(accountId) => onMap(selected.id, accountId)}
              onRedate={() => onRedate(selected.id)}
              onRetry={() => onRetry([selected.id])}
              onDelete={() => setConfirmDeleteIds([selected.id])}
            />
          ) : null}
        </TableShell>
      )}
      <Dialog open={Boolean(confirmDeleteIds)} onOpenChange={(open) => { if (!open) setConfirmDeleteIds(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmDeleteIds?.length === 1 ? "Delete failed event?" : `Delete ${confirmDeleteIds?.length} failed events?`}
            </DialogTitle>
            <DialogDescription>
              This will remove {confirmDeleteIds?.length === 1 ? "this event" : "these events"} from failed to post and permanently delete the integration event {confirmDeleteIds?.length === 1 ? "record" : "records"}. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="quiet" onClick={() => setConfirmDeleteIds(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon="x"
              busy={busy}
              disabled={busy}
              onClick={() => {
                if (confirmDeleteIds) {
                  const target = [...confirmDeleteIds];
                  setConfirmDeleteIds(null);
                  onDelete(target);
                  selection.clear();
                }
              }}
            >
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
