"use client";

import * as React from "react";

import { Icon, type IconName } from "@/components/core";
import type { HistoryItem, PostingRow } from "@/lib/books/record-view";

/**
 * A Books record page's parts, as the boards draw them (books_pages_a.py
 * `rec_head`, `strip`, `sec`, `posting`, `timeline`, `callout`, `rail_sec`):
 * the title with one pill and one muted line; one strip of at most four
 * tiles; sections on the 24px edge with tables full bleed; the rail.
 */

const plain = (n: number) => new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export function RecordHead({ title, pill, line }: { title: React.ReactNode; pill?: React.ReactNode; line?: React.ReactNode[] }) {
  const items = (line ?? []).filter((item) => item !== null && item !== undefined && item !== "");
  return (
    <div className="bk-hd">
      <div className="tr">
        <div className="bk-title">{title}</div>
        {pill}
      </div>
      {items.length ? (
        <div className="ml">
          {items.map((item, index) => (
            <React.Fragment key={index}>
              {index ? <i>·</i> : null}
              <span>{item}</span>
            </React.Fragment>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Strip({ tiles }: { tiles: Array<{ label: string; value: React.ReactNode; note?: React.ReactNode }> }) {
  return (
    <div className="bk-strip">
      <div className="kstrip" style={{ gridTemplateColumns: `repeat(${tiles.length},minmax(0,1fr))` }}>
        {tiles.map((tile) => (
          <div className="kt" key={tile.label}>
            <span className="kt-l">{tile.label}</span>
            <span className="kt-v">{tile.value}</span>
            <span className="kt-n">{tile.note ?? ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Callout({ tone = "warn", icon, children, action }: { tone?: "warn" | "ok" | "plain"; icon: IconName; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className={tone === "plain" ? "bk-box bk-callout" : `bk-box ${tone} bk-callout`}>
      <Icon name={icon} />
      <span className="grow">{children}</span>
      {action}
    </div>
  );
}

export function Section({ id, title, sum, children }: { id: string; title: string; sum?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <div className="group-head">
        <h2 id={id}>{title}</h2>
        {sum !== undefined && sum !== null && sum !== "" ? <span className="sum">{sum}</span> : null}
      </div>
      {children}
    </section>
  );
}

/** A table edge to edge of its pane (the owner, 19 Oct): its cells keep the 24px gutter. */
export function Bleed({ children }: { children: React.ReactNode }) {
  return <div className="bk-bleed">{children}</div>;
}

export function PostingTable({ rows }: { rows: PostingRow[] }) {
  return (
    <Bleed>
      <table className="table" aria-label="Posting">
        <colgroup>
          <col style={{ width: 120 }} />
          <col style={{ width: 80 }} />
          <col />
          <col style={{ width: 120 }} />
          <col style={{ width: 120 }} />
        </colgroup>
        <thead>
          <tr>
            <th>Entry</th>
            <th>Date</th>
            <th>Account</th>
            <th className="num">Debit</th>
            <th className="num">Credit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((line, index) => (
            <tr key={index}>
              <td>{line.entry ? <span className="ref">{line.entry}</span> : null}</td>
              <td className="muted">{line.date}</td>
              <td>
                <span className="cell-lead">{line.account}</span>
              </td>
              <td className="num">{line.debit !== null ? plain(line.debit) : ""}</td>
              <td className="num">{line.credit !== null ? plain(line.credit) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Bleed>
  );
}

export function History({ items }: { items: HistoryItem[] }) {
  return (
    <Bleed>
      <ol className="bk-tl">
        {items.map((item, index) => (
          <li key={index}>
            <span className={item.tone ? `d ${item.tone}` : "d"} />
            <span>{item.text}</span>
            <time>{item.when}</time>
          </li>
        ))}
      </ol>
    </Bleed>
  );
}

/** A rail section: a title over at most four label and value rows. */
export function RailSection({ title, rows }: { title: string; rows: Array<[string, React.ReactNode]> }) {
  return (
    <section>
      <div className="sec-title">{title}</div>
      <dl className="attrs">
        {rows.map(([term, value]) => (
          <React.Fragment key={term}>
            <dt>{term}</dt>
            <dd>{value ?? "—"}</dd>
          </React.Fragment>
        ))}
      </dl>
    </section>
  );
}

/** A key and value table (the board's `bk-kvt`): a record's facts, full bleed. */
export function FactTable({ label, rows }: { label: string; rows: Array<[string, React.ReactNode]> }) {
  return (
    <Bleed>
      <table className="table bk-kvt" aria-label={label}>
        <colgroup>
          <col style={{ width: 180 }} />
          <col />
        </colgroup>
        <tbody>
          {rows.map(([term, value]) => (
            <tr key={term}>
              <td>{term}</td>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Bleed>
  );
}
