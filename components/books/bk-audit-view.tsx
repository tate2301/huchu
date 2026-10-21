"use client";

import * as React from "react";
import Link from "next/link";

import { Button, Drawer, Icon, Person, TableShell } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { AUDIT_DATES, AUDIT_DATES_LABEL, AUDIT_KIND_LABEL, AUDIT_KINDS, type AuditKind, type AuditPage, type AuditQuery, type AuditRow } from "@/lib/books/audit";

import { BkChip, BkState, BkTools, useBkLayout } from "./bk-list";

/** The one word a row's Kind column carries. */
const KIND_WORD: Record<Exclude<AuditKind, "all">, string> = { void: "void", revise: "revise", delete: "delete", reopen: "reopen", override: "override", superuser: "sign in", other: "other" };

/** "Mon 12 Oct 16:21" as the trail writes it: "12 Oct 16:21". */
const dayAndTime = (when: string) => when.replace(/^[A-Za-z]{3} /, "");

/** What happened, on one line: "Revised INV-0133 → INV-0134: wrong customer". Pure. */
export function auditSentence(row: Pick<AuditRow, "what" | "detail" | "reason">): string {
  return `${[row.what, row.detail].filter(Boolean).join(" ")}${row.reason ? `: ${row.reason}` : ""}`;
}

const sub = (row: AuditRow) => (row.who.operator ? `superuser, ${row.who.session ?? ""}`.replace(/, $/, "") : (row.who.sub ?? "").toLowerCase());

/**
 * Books → Ledger → Audit trail (design: bk-audit): when, who, what, kind, and
 * the snapshot kept with it. Look only; nothing here changes the books.
 */
export function BkAuditView({ data, onQuery, exportHref }: { data: AuditPage; onQuery: (next: Partial<AuditQuery>) => void; exportHref: string }) {
  const q = data.query;
  const { from, to, of } = data.range;
  const [oldest, setOldest] = React.useState(false);
  const [open, setOpen] = React.useState<AuditRow | null>(null);
  const source = React.useMemo(() => (oldest ? [...data.rows].reverse() : data.rows), [data.rows, oldest]);
  const layout = useBkLayout<AuditRow>("audit", [{ key: "who", label: "Who", nth: 2 }, { key: "what", label: "What", nth: 3 }, { key: "kind", label: "Kind", nth: 4 }, { key: "kept", label: "Kept", nth: 5 }], [{ key: "kind", label: "Kind", by: (row) => KIND_WORD[row.kind] }, { key: "who", label: "Who", by: (row) => row.who.name }], source);
  return (
    <div className="bk">
      <BkTools
        find="Search the trail"
        query={q.q}
        onFind={(next) => onQuery({ q: next, page: 1 })}
        count={String(of)}
        chips={
          <>
            <BkChip label="Kind" value={q.kind === "all" ? "Any" : AUDIT_KIND_LABEL[q.kind]} set={q.kind !== "all"} items={AUDIT_KINDS.map((kind) => ({ key: kind, label: kind === "all" ? "Any" : AUDIT_KIND_LABEL[kind], checked: kind === q.kind, onSelect: () => onQuery({ kind, page: 1 }) }))} />
            <BkChip
              label="Who"
              value={q.who || "Anyone"}
              set={Boolean(q.who)}
              items={[{ key: "anyone", label: "Anyone", checked: !q.who, onSelect: () => onQuery({ who: "", page: 1 }) }, { separator: true }, ...data.people.map((name) => ({ key: name, label: name, checked: name === q.who, onSelect: () => onQuery({ who: name, page: 1 }) }))]}
            />
          </>
        }
        filters={AUDIT_DATES.map((dates) => ({ key: dates, label: AUDIT_DATES_LABEL[dates], checked: dates === q.dates, onSelect: () => onQuery({ dates, page: 1 }) }))}
        end={
          <>
            <MenuButton
              variant="quiet"
              icon="sort"
              label="Sort"
              items={[
                { key: "newest", label: "Newest first", checked: !oldest, onSelect: () => setOldest(false) },
                { key: "oldest", label: "Oldest first", checked: oldest, onSelect: () => setOldest(true) },
              ]}
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
        <TableShell label="Audit trail">
          {data.rows.length === 0 ? (
            <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
              <b>{q.q || q.kind !== "all" || q.who ? "No change matches" : "No changes to posted records"}</b>
            </div>
          ) : (
            <table className="table" aria-label="Audit trail">
              <colgroup>
                <col style={{ width: 130 }} />
                <col style={{ width: 300 }} />
                <col />
                <col style={{ width: 110 }} />
                <col style={{ width: 130 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>What</th>
                  <th>Kind</th>
                  <th>Kept</th>
                </tr>
              </thead>
              <tbody>
                {layout.rows((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className="bk-code">{dayAndTime(row.when)}</span>
                    </td>
                    <td className="truncate">
                      <span className="bk-who">{row.who.operator ? <span className="truncate">{row.who.name}</span> : <Person name={row.who.name} src={row.who.image} />}</span>
                      {sub(row) ? <span className="bk-sub">{sub(row)}</span> : null}
                    </td>
                    <td className="fill truncate" title={auditSentence(row)}>
                      {auditSentence(row)}
                    </td>
                    <td>
                      <span className="bk-src" style={{ marginLeft: 0 }}>
                        {KIND_WORD[row.kind]}
                      </span>
                    </td>
                    <td>
                      {row.kept ? (
                        <Button variant="quiet" icon="history" onClick={() => setOpen(row)}>
                          Snapshot
                        </Button>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TableShell>
      </div>
      <Drawer open={open !== null} onOpenChange={(next) => (next ? undefined : setOpen(null))} title={open ? [open.what, open.detail].filter(Boolean).join(" ") : "Snapshot"} width={480}>
        {open ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "16px 24px" }}>
            <dl className="attrs" style={{ margin: 0 }}>
              <dt>When</dt>
              <dd>{dayAndTime(open.when)}</dd>
              <dt>Who</dt>
              <dd>
                {open.who.name}
                {sub(open) ? <span className="muted">, {sub(open)}</span> : null}
              </dd>
              <dt>Reason</dt>
              <dd>{open.reason ?? "—"}</dd>
              {open.href ? (
                <>
                  <dt>Record</dt>
                  <dd>
                    <Link href={open.href}>{open.detail ?? "Open it"}</Link>
                  </dd>
                </>
              ) : null}
            </dl>
            <pre className="mono bk-kept">{open.kept}</pre>
            {!data.chainUnbroken && open.chained ? <BkState tone="danger">Chain broken: tell Corelith</BkState> : null}
          </div>
        ) : null}
      </Drawer>
      {of > 25 ? (
        <div className="bk-sh" style={{ padding: "8px 24px" }}>
          <span className="n" style={{ marginLeft: 0 }}>
            {from === 1 ? "" : `${from} to `}
            {to} of {of}
          </span>
          <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <Button variant="quiet" disabled={q.page <= 1} onClick={() => onQuery({ page: q.page - 1 })}>
              Previous
            </Button>
            <Button variant="quiet" disabled={to >= of} onClick={() => onQuery({ page: q.page + 1 })}>
              Next
            </Button>
          </span>
        </div>
      ) : null}
    </div>
  );
}
