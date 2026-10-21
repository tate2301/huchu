import * as React from "react";
import Link from "next/link";

import { Avatar, Icon, VaneMark, type IconName } from "@/components/core";

/**
 * A record page (`.k-rec`): the document on the left, what it is waiting on
 * and what happened to it on the right (`.k-rs`, "This document"). Under 1100px
 * the side drops below.
 */
export function BkRecord({ children, side }: { children: React.ReactNode; side?: React.ReactNode }) {
  return (
    <div className="k-rec">
      <div className="k-rm">{children}</div>
      {side ? (
        <aside className="k-rs" aria-label="This document">
          {side}
        </aside>
      ) : null}
    </div>
  );
}

/** The record's head (`.k-dhd`): its name, its state and facts on one line, and its big figure. */
export function BkRecordHead({ title, meta, big, bigNote }: { title: React.ReactNode; meta?: React.ReactNode[]; big?: React.ReactNode; bigNote?: React.ReactNode }) {
  return (
    <div className="k-dhd">
      <div>
        <h2>{title}</h2>
        {meta && meta.length ? (
          <div className="k-dm">
            {meta.map((part, index) => (
              <React.Fragment key={index}>{typeof part === "string" ? <span>{part}</span> : part}</React.Fragment>
            ))}
          </div>
        ) : null}
      </div>
      {big ? (
        <div className="k-big">
          {big}
          {bigNote ? <span className="k-bs">{bigNote}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/** The record's facts (`.k-facts`): four to a row, a label over its value. */
export function BkFacts({ items }: { items: ReadonlyArray<{ label: string; value: React.ReactNode; mono?: boolean }> }) {
  return (
    <dl className="k-facts">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd className={item.mono ? "mono" : undefined}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A block on the side or under the lines (`.k-blk`): its head with an icon, then its body. */
export function BkBlock({ icon, title, code, meta, children }: { icon: IconName; title: string; code?: React.ReactNode; meta?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="k-blk">
      <div className="k-bh">
        <Icon name={icon} />
        <b>{title}</b>
        {code ? <span className="mono">{code}</span> : null}
        {meta ? <span className="k-bm">{meta}</span> : null}
      </div>
      {children}
    </section>
  );
}

export type BkStep = {
  /** "Asked", "Approves", "Pays". */
  role: string;
  name: string;
  /** "1 Oct 14:20, fitter", "Owner, over $500. Limit fixed when it was sent". */
  note?: string | null;
  state: "done" | "now" | "todo" | "refused";
  avatarUrl?: string | null;
};

const STEP_ICON: Record<BkStep["state"], IconName> = { done: "done", now: "clock", todo: "clock", refused: "block" };

/** An approval chain (`.k-appr`): who asked, who approves and who pays, each with their state. */
export function BkApproval({ steps }: { steps: readonly BkStep[] }) {
  return (
    <ol className="k-appr">
      {steps.map((step, index) => (
        <li key={`${step.role}-${index}`} className={`is-${step.state}`}>
          <Avatar name={step.name} src={step.avatarUrl ?? null} size={24} className="pav" />
          <span>
            <b>{step.role}</b> {step.name}
            {step.note ? <span className="k-an">{step.note}</span> : null}
          </span>
          <Icon name={STEP_ICON[step.state]} />
        </li>
      ))}
    </ol>
  );
}

export type BkEvent = { who: string | null; what: React.ReactNode; when: string; avatarUrl?: string | null };

/** A record's history (`.k-hist`): who did what, when. The system's entries carry its mark, not a face. */
export function BkHistory({ items }: { items: readonly BkEvent[] }) {
  return (
    <ol className="k-hist">
      {items.map((item, index) => (
        <li key={index}>
          {item.who ? (
            <Avatar name={item.who} src={item.avatarUrl ?? null} size={20} className="pav" />
          ) : (
            <span className="k-sys">
              <Icon name="gear" />
            </span>
          )}
          <span>
            <b>{item.who ?? "System"}</b> {item.what}
          </span>
          <span className="k-bm">{item.when}</span>
        </li>
      ))}
    </ol>
  );
}

/** What Vane proposes on a record (`.k-vane`), always with what it read. A person presses the button. */
export function BkVane({ children, read, action }: { children: React.ReactNode; read: string; action?: React.ReactNode }) {
  return (
    <div className="k-vane">
      <VaneMark />
      <span>
        {children}
        <span className="k-read">
          <Icon name="eye" />
          Read: {read}
        </span>
      </span>
      {action}
    </div>
  );
}

/**
 * A "Needs you" row (`.k-nr`): 36px, an icon, what waits, its amount or its
 * one fact, the count, and the way in. Warnings and failures carry their tone.
 */
export function BkNeedsRow({ icon, label, amount, count, href, tone }: { icon: IconName; label: string; amount?: React.ReactNode; count: number; href: string; tone?: "warn" | "bad" }) {
  return (
    <Link className={tone ? `k-nr is-${tone}` : "k-nr"} href={href}>
      <Icon name={icon} />
      <span className="k-nl truncate">{label}</span>
      {amount ? <span className="k-na">{amount}</span> : null}
      <span className="k-nn">{count}</span>
      <Icon name="chev" />
    </Link>
  );
}

/** A line with its share of the whole (`.k-hb`): what, a muted fact, the amount, and its bar. */
export function BkShareRow({ label, fact, amount, share }: { label: string; fact?: string | null; amount: React.ReactNode; share: number }) {
  return (
    <div className="k-hb">
      <span>
        <span style={{ color: "var(--color-ink)" }}>{label}</span> {fact ? <span className="muted">{fact}</span> : null}
      </span>
      {amount}
      <span className="k-track">
        <i style={{ width: `${Math.max(0, Math.min(100, share * 100))}%` }} />
      </span>
    </div>
  );
}

/** A dated or labelled line with its amount (`.k-up2`, `.k-up3` without a date). */
export function BkLine({ when, label, amount }: { when?: string | null; label: React.ReactNode; amount: React.ReactNode }) {
  return (
    <div className={when ? "k-up2" : "k-up2 k-up3"}>
      {when ? <span className="mono">{when}</span> : null}
      <span className="truncate">{label}</span>
      {amount}
    </div>
  );
}
