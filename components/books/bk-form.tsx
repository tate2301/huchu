"use client";

import * as React from "react";

import { Icon, type IconName } from "@/components/core";

/**
 * Books' forms as the boards draw them (books_pages_a.py `form_page`, `fsec`,
 * `field`, `wsec`): sections down the left with their title and a line on
 * what they are for, the summary on the right. Pure markup.
 */

export function BkFormPage({ children, rail }: { children: React.ReactNode; rail: React.ReactNode }) {
  return (
    <div className="bk bk-fm">
      <div className="bk-fl">{children}</div>
      <aside className="rail" aria-label="Summary">
        {rail}
      </aside>
    </div>
  );
}

export function FormSec({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <section className="form-sec">
      <header>
        <h2>{title}</h2>
        <p>{text}</p>
      </header>
      <div className="body">{children}</div>
    </section>
  );
}

export function WideSec({ title, text, children }: { title: string; text?: string; children: React.ReactNode }) {
  return (
    <section className="bk-wide">
      <header>
        <h2>{title}</h2>
        {text ? <p>{text}</p> : null}
      </header>
      {children}
    </section>
  );
}

/** A label over its control, "optional" after it where it is, a hint or an error under it. */
export function BkField({
  label,
  htmlFor,
  optional = false,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  optional?: boolean;
  hint?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>
        {label}
        {optional ? (
          <>
            {" "}
            <span className="opt">optional</span>
          </>
        ) : null}
      </label>
      {children}
      {error ? (
        <p className="error" role="alert">
          <Icon name="warn" />
          {error}
        </p>
      ) : hint ? (
        <span className="bk-hint">{hint}</span>
      ) : null}
    </div>
  );
}

/** A box under a field: what the app knows about the choice (green when it is in order, amber when it is not). */
export function BkBox({ tone, icon, children }: { tone?: "ok" | "warn"; icon: IconName; children: React.ReactNode }) {
  return (
    <div className={tone ? `bk-box ${tone}` : "bk-box"}>
      <Icon name={icon} />
      <span>{children}</span>
    </div>
  );
}

/** Two choices side by side, as the board's currency switch draws them. */
export function BkSeg<V extends string>({ label, value, options, onChange }: { label: string; value: V; options: Array<{ value: V; label: string }>; onChange: (value: V) => void }) {
  return (
    <div className="seg" role="tablist" aria-label={label} style={{ alignSelf: "flex-start" }}>
      {options.map((option) => (
        <button key={option.value} type="button" role="tab" aria-selected={option.value === value} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function RailFigure({ title, figure, rows }: { title: string; figure?: React.ReactNode; rows: Array<[React.ReactNode, React.ReactNode]> }) {
  return (
    <section>
      <div className="sec-title">{title}</div>
      {figure !== undefined ? <div className="figure">{figure}</div> : null}
      <dl className="attrs">
        {rows.map(([term, value], index) => (
          <React.Fragment key={index}>
            <dt>{term}</dt>
            <dd className="num">{value}</dd>
          </React.Fragment>
        ))}
      </dl>
    </section>
  );
}

/** What pressing the primary does, step by step (the board's `ol.steps`). */
export function RailSteps({ title, steps }: { title: string; steps: Array<[string, string]> }) {
  return (
    <section>
      <div className="sec-title">{title}</div>
      <ol className="steps" style={{ gap: 12 }}>
        {steps.map(([lead, rest], index) => (
          <li className="step" key={lead}>
            <span className="n">{index + 1}</span>
            <b>{lead}</b>
            <span>{rest}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Today in Harare, as YYYY-MM-DD. */
export function todayHarare(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Harare", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
