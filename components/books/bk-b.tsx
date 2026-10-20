"use client";

import * as React from "react";

/**
 * The parts the Bank & cash, Tax, Close and Settings boards share
 * (books_pages_b.py `split`, `rail_`, `rsec`, `st`, `lead`, `flag`): a page
 * column with its rail, a rail section of at most four rows, the state word
 * toned as the boards tone it, a cell's lead with its muted second line, and
 * the "To confirm" mark on a value the research could not confirm.
 */

export function Split({ children, rail }: { children: React.ReactNode; rail: React.ReactNode }) {
  return (
    <div className="bk-body">
      <div className="bk-col">{children}</div>
      {rail}
    </div>
  );
}

export function Rail({ width = 340, label, children }: { width?: number; label: string; children: React.ReactNode }) {
  return (
    <aside className="rail bk-rail" style={{ width }} aria-label={label}>
      {children}
    </aside>
  );
}

export function RailSec({
  title,
  end,
  figure,
  rows = [],
  num = false,
  after,
}: {
  title: React.ReactNode;
  end?: React.ReactNode;
  figure?: React.ReactNode;
  rows?: Array<[React.ReactNode, React.ReactNode]>;
  num?: boolean;
  after?: React.ReactNode;
}) {
  return (
    <section>
      <div className="sec-title">
        {title}
        {end ? <span className="end">{end}</span> : null}
      </div>
      {figure !== undefined && figure !== null ? <div className="figure">{figure}</div> : null}
      {rows.length ? (
        <dl className={num ? "attrs n" : "attrs"}>
          {rows.map(([term, value], index) => (
            <React.Fragment key={index}>
              <dt>{term}</dt>
              <dd className={num ? "num" : undefined}>{value ?? "—"}</dd>
            </React.Fragment>
          ))}
        </dl>
      ) : null}
      {after ? <div className="bk-racts">{after}</div> : null}
    </section>
  );
}

export function ToConfirm({ why }: { why?: string | null }) {
  return (
    <span className="pill pill-warn" title={why ?? "Not confirmed with ZIMRA yet: check it and save it in Tax codes & rules."}>
      To confirm
    </span>
  );
}

const TONES: Record<string, "success" | "info" | "warning" | "danger" | "void" | ""> = {
  Posted: "success",
  Paid: "success",
  Matched: "success",
  Closed: "success",
  Filed: "success",
  Valid: "success",
  Reconciled: "success",
  Active: "success",
  Ready: "success",
  "Ready to close": "success",
  Done: "success",
  Open: "info",
  Reviewed: "info",
  Finalised: "info",
  Issued: "info",
  Waiting: "warning",
  Pending: "warning",
  Closing: "warning",
  "To approve": "warning",
  Due: "warning",
  "To match": "warning",
  Overdue: "warning",
  Expired: "warning",
  Failed: "danger",
  Void: "void",
  Excluded: "void",
  Reversed: "void",
  Inactive: "void",
  Draft: "",
};

/** The state word in a cell, toned as the boards tone it (`st`). */
export function St({ word, label }: { word: string; label?: string }) {
  const tone = TONES[word] ?? "";
  const text = label ?? word;
  if (tone === "void") return <span className="status" style={{ color: "var(--color-muted)" }}>{text}</span>;
  if (tone === "warning") return <span className="status status-warning" style={{ color: "var(--color-ink)", fontWeight: 500 }}>{text}</span>;
  return <span className={tone ? `status status-${tone}` : "status"}>{text}</span>;
}

/** A cell's lead and its muted second line (`lead`). */
export function Lead({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <>
      <span className="cell-lead">{children}</span>
      {sub ? (
        <span className="sub" style={{ display: "block", fontSize: 12, color: "var(--color-muted)" }}>
          {sub}
        </span>
      ) : null}
    </>
  );
}

/** Numbers as the boards write them in a column of figures: "1,234.50", "−18.00". */
export function n2(n: number): string {
  const value = Math.round(n * 100) / 100;
  const body = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(value));
  return value < 0 ? `−${body}` : body;
}

/** An empty table's words, in the table's place. */
export function TableEmpty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
      <b>{title}</b>
      <p className="muted">{children}</p>
    </div>
  );
}
