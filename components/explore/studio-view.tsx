"use client";

import * as React from "react";
import dynamic from "next/dynamic";

import { Button, ButtonLink, Icon, Segmented, VaneMark } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { GUARDS, type CheckedQuestion, type Refusal } from "@/lib/explore/guard";
import type { ExploreTable } from "@/lib/explore/products";
import type { Step } from "@/lib/explore/steps";

import type { QuestionResult } from "./use-explore";
import { Worksheet } from "./worksheet";

// CodeMirror is heavy and browser-only: the editor loads after the page.
const QueryEditor = dynamic(() => import("@/components/reports/custom/query-editor").then((mod) => mod.QueryEditor), {
  ssr: false,
  loading: () => <div className="skeleton" style={{ height: 160 }} />,
});

export type AskMode = "new" | "change";

/** Where a refused change is done instead, by the table it would have changed. */
const DO_IT_IN: Array<[RegExp, { label: string; href: string; icon: "payments" | "books" | "pipeline" | "store" | "person"; place: string }]> = [
  [/invoice|payment|receipt/, { label: "Record a payment", href: "/books/payments", icon: "payments", place: "Books" }],
  [/^(books|journal|bank|vat|expense|bill)/, { label: "Open Books", href: "/books", icon: "books", place: "Books" }],
  [/^(crm|quote|deal|lead|visit|site|customer)/, { label: "Open the CRM", href: "/crm", icon: "pipeline", place: "the CRM" }],
  [/^(retail|sale|product|till|stock)/, { label: "Open Tender", href: "/retail", icon: "store", place: "Tender" }],
  [/^(people|payroll|staff|employee|leave|pay)/, { label: "Open People", href: "/people", icon: "person", place: "People" }],
];

function doItIn(table: string | null) {
  if (!table) return null;
  return DO_IT_IN.find(([pattern]) => pattern.test(table.toLowerCase()))?.[1] ?? null;
}

/** A change, a second statement or a locked table: refused before it ran, with where to go instead. */
export function GuardNotice({ refusal }: { refusal: Refusal }) {
  const place = refusal.kind === "change" ? doItIn(refusal.table) : null;
  return (
    <div className="ex-guard">
      <div className="banner banner-warning" role="status">
        <Icon name={refusal.kind === "locked" ? "lock" : "warn"} />
        <div>
          {refusal.kind === "change" ? (
            <>
              <b>Explore only reads.</b>
              <p>
                Questions run read-only, over the tables your role reads, and nothing else. Nothing was changed.
                {place ? ` To ${refusal.verb === "delete" ? "remove" : "change"} ${refusal.table}, do it in ${place.place}.` : ""}
              </p>
            </>
          ) : refusal.kind === "locked" ? (
            <>
              <b>
                Only {refusal.who} read {refusal.table}.
              </b>
              <p>Your role does not read it in the app, so it does not here. Ask one of them, or ask Vane about what you can read.</p>
            </>
          ) : (
            <>
              <b>One statement per question.</b>
              <p>A second statement is refused before anything runs. Split it into two questions.</p>
            </>
          )}
          <div className="ex-guard-acts">
            {place ? (
              <ButtonLink href={place.href} icon={place.icon}>
                {place.label}
              </ButtonLink>
            ) : null}
            <ButtonLink href="/help" variant="quiet" icon="help">
              Read about Explore
            </ButtonLink>
          </div>
        </div>
      </div>
      <div className="card ex-limits">
        <b>What every question runs inside</b>
        <div className="prow">
          <span>Statements</span>
          <span className="muted">{GUARDS.statements}</span>
        </div>
        <div className="prow">
          <span>Tables</span>
          <span className="muted">{GUARDS.tables}</span>
        </div>
        <div className="prow">
          <span>Rows back</span>
          <span className="muted mono">{GUARDS.rows}</span>
        </div>
        <div className="prow">
          <span>Time</span>
          <span className="muted mono">{GUARDS.time}</span>
        </div>
      </div>
    </div>
  );
}

export type StudioNote = { text: string; versions: Array<{ sql: string; note: string; at: string }>; onRestore: (index: number) => void };

/**
 * The studio's body (the ExploreStudio board): ask in plain words, the steps
 * beside the SQL, what Vane changed, then the rows. A question the guard
 * refuses shows why instead of rows. Pure: the page feeds it.
 */
export function StudioView({
  title,
  sql,
  onSql,
  tables,
  checked,
  steps,
  periodStart,
  ask,
  note,
  result,
  running,
  error,
  onRerun,
  noun,
  sort,
  templatesHref = "/explore/templates",
}: {
  title: string;
  sql: string;
  onSql: (sql: string) => void;
  tables: readonly ExploreTable[];
  checked: CheckedQuestion | null;
  steps: Step[];
  periodStart: string;
  /** Ask in plain words; left out where there is no Vane to ask (the portal's library). */
  ask: { text: string; mode: AskMode; asking: boolean; canChange: boolean; onText: (text: string) => void; onMode: (mode: AskMode) => void; onAsk: () => void } | null;
  note: StudioNote | null;
  result: QuestionResult | null;
  running: boolean;
  error: Error | null;
  onRerun: () => void;
  noun?: string;
  sort?: { key: string; dir: "asc" | "desc" } | null;
  /** Where "Start from a template" goes from an empty question; null offers none. */
  templatesHref?: string | null;
}) {
  const refusal = checked && !checked.ok && checked.refusal.kind !== "problem" ? checked.refusal : null;
  const problem = checked && !checked.ok ? checked.problem : null;
  return (
    <>
      {ask ? (
        <form
          className="ex-ask"
          onSubmit={(event) => {
            event.preventDefault();
            ask.onAsk();
          }}
        >
          <VaneMark size={20} />
          <label className="input-wrap">
            <Icon name="search" />
            <input
              aria-label="Ask in plain words"
              placeholder="Ask in plain words: site visits since 1 September whose quote isn't accepted"
              value={ask.text}
              onChange={(event) => ask.onText(event.target.value)}
            />
          </label>
          <Segmented
            label="This asks"
            value={ask.mode}
            onChange={(mode) => ask.onMode(mode)}
            items={[
              { value: "new", label: "New question" },
              { value: "change", label: "Change this" },
            ]}
          />
          <Button type="submit" icon="sendq" busy={ask.asking} disabled={ask.asking || ask.text.trim().length < 3}>
            Ask
          </Button>
        </form>
      ) : null}
      <div className="ex-edit">
        <div className="ex-steps">
          <div className="ex-h">
            <span>Steps</span>
            <span>They follow the SQL</span>
          </div>
          {steps.length ? (
            <ol>
              {steps.map((step, index) => (
                <li key={index} className={step.icon === "x" ? "is-refused" : undefined}>
                  <Icon name={step.icon === "x" ? "warn" : "step"} />
                  <span>{step.text}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">Ask in plain words, start from a table on the left, or write the SQL.</p>
          )}
        </div>
        <div className="ex-sql">
          <div className="ex-h">
            <span className="ex-h-l">
              <Icon name="sql" />
              SQL, read only
            </span>
            <span className="mono">period_start() = {periodStart}</span>
          </div>
          <QueryEditor value={sql} onChange={onSql} tables={tables} problem={refusal ? null : problem} label="The question, in SQL" />
          {problem && !refusal ? <p className="ex-problem">{problem.message}</p> : null}
        </div>
      </div>
      {note ? (
        <div className="ex-note">
          <VaneMark size={16} />
          <span>{note.text}</span>
          <div className="end">
            <MenuButton
              variant="quiet"
              icon="history"
              align="end"
              label="Earlier versions"
              disabled={note.versions.length === 0}
              items={note.versions.map((version, index) => ({ key: String(index), label: `${version.at}: ${version.note}`, onSelect: () => note.onRestore(index) }))}
            >
              Earlier versions
            </MenuButton>
          </div>
        </div>
      ) : null}
      {refusal ? (
        <GuardNotice refusal={refusal} />
      ) : !sql.trim() ? (
        <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
          <Icon name="explore" className="glyph" />
          <h2>Ask a question, or start from a table</h2>
          <p>Questions read the tables your role reads, in this workspace, and change nothing.</p>
          {templatesHref ? (
            <ButtonLink href={templatesHref} icon="list">
              Start from a template
            </ButtonLink>
          ) : null}
        </div>
      ) : error ? (
        <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
          <Icon name="warn" className="glyph" />
          <h2>The question did not run</h2>
          <p>{error.message}</p>
          <Button icon="history" onClick={onRerun}>
            Try again
          </Button>
        </div>
      ) : result ? (
        <div className={running ? "ex-rows is-stale" : "ex-rows"}>
          <Worksheet key={sql === "" ? "empty" : "rows"} result={result} title={title} noun={noun} sort={sort} />
        </div>
      ) : problem ? (
        <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
          <Icon name="sql" className="glyph" />
          <h2>Not ready to run</h2>
          <p>{problem.message}</p>
        </div>
      ) : (
        <div className="ex-rows" aria-busy="true" aria-label="Running the question">
          <div style={{ padding: "var(--space-16) var(--space-24)", display: "flex", flexDirection: "column", gap: 10 }}>
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <div key={n} className="skeleton" style={{ height: 22 }} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
