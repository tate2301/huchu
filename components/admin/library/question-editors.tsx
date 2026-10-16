"use client";

import { useMemo, type ReactNode } from "react";

import "@/components/explore/explore.css";
import { Kit, KitScreen } from "@/components/core";
import { StudioView } from "@/components/explore/studio-view";
import { useQuestion, type QuestionResult } from "@/components/explore/use-explore";
import { useReportSources } from "@/components/reports/custom/use-custom-data";
import { describeSteps } from "@/lib/explore/steps";
import type { ExploreCatalog } from "@/lib/explore/types";
import { PRODUCTS, type ProductKey } from "@/lib/explore/products";
import { insightFromResult } from "@/lib/library/insights";
import { EMPTY_EXPLORE, EMPTY_INSIGHT, type ExplorePayload, type InsightPayload } from "@/lib/library/report-kinds";
import type { ReportRow } from "@/lib/reports/types";

import type { PayloadEditorProps } from "./editors";
import { PreviewProvider, PreviewWorkspacePicker, UnreadNotice, usePreview, type PreviewWorkspace } from "./preview";

/**
 * A library Explore question and a library insight, written in Explore's own
 * studio: the steps beside the SQL, the guard's refusals, and the rows,
 * run in this tab on the chosen workspace's rows (or over empty tables).
 */

const field =
  "h-9 w-full rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] focus:border-[var(--action)] focus:outline-none";

function payloadOf<T extends object>(value: unknown, empty: T): T {
  return value && typeof value === "object" ? ({ ...empty, ...(value as Partial<T>) } as T) : empty;
}

/** Explore's studio on one SQL question, without Vane's ask: what the item reads and its rows. */
function Studio({
  sql,
  onSql,
  title,
  noun,
  workspace,
  unread,
  children,
}: {
  sql: string;
  onSql: (sql: string) => void;
  title: string;
  noun?: string;
  workspace: PreviewWorkspace | null;
  unread: (tables: readonly string[]) => string[];
  /** Drawn over the studio from its answer (an insight's card). */
  children?: (result: QuestionResult | null) => ReactNode;
}) {
  const sources = useReportSources();
  const catalog = useMemo<ExploreCatalog | undefined>(
    () =>
      sources.data
        ? {
            canUse: true,
            engine: "sources",
            workspaceName: workspace?.name ?? "No workspace",
            sources: sources.data.sources as Extract<ExploreCatalog, { canUse: true }>["sources"],
            tables: null,
            locked: [],
            templates: [],
            saved: [],
          }
        : undefined,
    [sources.data, workspace],
  );
  const question = useQuestion(sql, catalog, "sources");
  const steps = useMemo(() => describeSteps(sql), [sql]);
  return (
    <div className="space-y-4">
      <UnreadNotice workspace={workspace} tables={unread(question.reads)} />
      {children?.(question.result)}
      <Kit className="flex h-[640px] flex-col overflow-hidden rounded-[var(--radius-sm)] shadow-[inset_0_0_0_1px_var(--line)]">
        <KitScreen slug="explore">
          <div className="ex-main">
            <StudioView
              title={title}
              sql={sql}
              onSql={onSql}
              tables={question.tables}
              checked={question.checked}
              steps={steps}
              periodStart={question.period.from}
              ask={null}
              note={null}
              result={question.result}
              running={question.running}
              error={question.error}
              onRerun={question.rerun}
              noun={noun}
              templatesHref={null}
            />
          </div>
        </KitScreen>
      </Kit>
    </div>
  );
}

function ProductField({ value, onChange }: { value: ProductKey; onChange: (next: ProductKey) => void }) {
  return (
    <label className="block space-y-1.5">
      <span className="t-label text-[var(--ink)]">Product</span>
      <select className={field} value={value} onChange={(event) => onChange(event.target.value as ProductKey)}>
        {PRODUCTS.map((product) => (
          <option key={product.key} value={product.key}>
            {product.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** An Explore question for workspaces' Templates: what it answers, its product, what a row is, and its SQL. */
export function LibraryExploreEditor({ value, onChange, title }: PayloadEditorProps) {
  const preview = usePreview();
  const payload = payloadOf<ExplorePayload>(value, EMPTY_EXPLORE);
  const set = (patch: Partial<ExplorePayload>) => onChange({ ...payload, ...patch });
  return (
    <PreviewProvider data={preview.data}>
      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5 sm:col-span-2">
            <span className="t-label text-[var(--ink)]">What it answers</span>
            <input className={field} value={payload.answers} maxLength={200} placeholder="Which quotes have had no answer for a week" onChange={(event) => set({ answers: event.target.value })} />
          </label>
          <ProductField value={payload.product} onChange={(product) => set({ product })} />
          <label className="block space-y-1.5">
            <span className="t-label text-[var(--ink)]">One row is</span>
            <input className={field} value={payload.noun ?? ""} maxLength={40} placeholder="quotes" onChange={(event) => set({ noun: event.target.value || undefined })} />
          </label>
        </section>
        <PreviewWorkspacePicker value={preview.workspace} onChange={preview.setWorkspace} error={preview.sourcesError} />
        <Studio
          sql={payload.sql}
          onSql={(sql) => set({ sql })}
          title={title?.trim() || "Untitled question"}
          noun={payload.noun}
          workspace={preview.workspace}
          unread={preview.unread}
        />
      </div>
    </PreviewProvider>
  );
}

/** An insight for workspaces' Insights page: its SQL, and the headline and line its first row fills. */
export function LibraryInsightEditor({ value, onChange, title }: PayloadEditorProps) {
  const preview = usePreview();
  const payload = payloadOf<InsightPayload>(value, EMPTY_INSIGHT);
  const set = (patch: Partial<InsightPayload>) => onChange({ ...payload, ...patch });
  const named = title?.trim() || "This insight";
  return (
    <PreviewProvider data={preview.data}>
      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5 sm:col-span-2">
            <span className="t-label text-[var(--ink)]">Headline</span>
            <input className={field} value={payload.headline} maxLength={200} onChange={(event) => set({ headline: event.target.value })} />
            <span className="block text-[13px] text-[var(--text-muted)]">
              Write a column in braces, like <span className="font-mono">{"{quotes}"}</span>, and the first row fills it.
            </span>
          </label>
          <label className="block space-y-1.5 sm:col-span-2">
            <span className="t-label text-[var(--ink)]">The line under it</span>
            <input className={field} value={payload.body ?? ""} maxLength={600} onChange={(event) => set({ body: event.target.value || undefined })} />
          </label>
          <ProductField value={payload.product} onChange={(product) => set({ product })} />
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-[var(--ink)]">
            <input type="checkbox" checked={payload.onlyWhenRows} onChange={(event) => set({ onlyWhenRows: event.target.checked })} />
            Show it only when its answer has rows
          </label>
        </section>
        <PreviewWorkspacePicker value={preview.workspace} onChange={preview.setWorkspace} error={preview.sourcesError} />
        <Studio sql={payload.sql} onSql={(sql) => set({ sql })} title={named} workspace={preview.workspace} unread={preview.unread}>
          {(result) => <InsightCard payload={payload} result={result} title={named} />}
        </Studio>
      </div>
    </PreviewProvider>
  );
}

/** The insight as a workspace would see it on Insights, filled from this answer's first row. */
function InsightCard({ payload, result, title }: { payload: InsightPayload; result: QuestionResult | null; title: string }) {
  const insight = result
    ? insightFromResult(
        { id: "preview", key: "preview", title, sql: payload.sql, headline: payload.headline, body: payload.body ?? null, onlyWhenRows: payload.onlyWhenRows, reads: [] },
        { ok: true, columns: result.columns, rows: result.rows as ReportRow[], truncated: result.truncated },
        false,
      )
    : null;
  return (
    <section aria-label="As Insights shows it" className="space-y-1 rounded-[var(--radius-sm)] px-4 py-3 shadow-[inset_0_0_0_1px_var(--line)]">
      <span className="t-label block text-[var(--text-muted)]">As Insights shows it</span>
      {!result ? (
        <p className="t-body-sm text-[var(--text-muted)]">It shows here once its question has run.</p>
      ) : insight ? (
        <>
          <p className="text-base font-semibold text-[var(--ink)]">{insight.headline}</p>
          {insight.body ? <p className="text-sm text-[var(--ink)]">{insight.body}</p> : null}
        </>
      ) : (
        <p className="t-body-sm text-[var(--text-muted)]">Its answer has no rows here, so it would not be shown.</p>
      )}
    </section>
  );
}
