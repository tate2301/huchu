"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@corelithzw/react";

import { blockTitle, periodWords } from "@/components/reports/custom/report-builder-blocks";
import { problemOf, ReportBuilderView } from "@/components/reports/custom/report-builder-view";
import { useCustomData, useReportSources } from "@/components/reports/custom/use-custom-data";
import { periodParams, type CustomDocument, type CustomReportInput } from "@/lib/reports/custom/document";
import { tablesRead } from "@/lib/reports/custom/run";
import { resolveParams } from "@/lib/reports/params";
import { EMPTY_REPORT } from "@/lib/library/report-kinds";

import type { PayloadEditorProps } from "./editors";
import { PreviewProvider, PreviewWorkspacePicker, UnreadNotice, usePreview, type PreviewWorkspace } from "./preview";

/**
 * A library report, built in Reports' own builder. The builder takes the
 * whole window, as it does in a workspace; this page keeps the report's name,
 * who gets it, and the save. Its blocks run on the chosen workspace's rows.
 */

/** The payload as the builder holds it: kept as it is mid-change (two blocks named alike), checked when saved. */
function documentOf(value: unknown): CustomDocument {
  const held = value as Partial<CustomDocument> | null;
  return held && typeof held === "object" && Array.isArray(held.blocks) && held.period ? (held as CustomDocument) : EMPTY_REPORT;
}

export function LibraryReportEditor({ value, onChange, title }: PayloadEditorProps) {
  const preview = usePreview();
  const [open, setOpen] = useState(false);
  const document = useMemo(() => documentOf(value), [value]);
  return (
    <PreviewProvider data={preview.data}>
      <div className="space-y-6">
        <PreviewWorkspacePicker value={preview.workspace} onChange={preview.setWorkspace} error={preview.sourcesError} />
        <ReportSummary document={document} workspace={preview.workspace} unread={preview.unread} onOpen={() => setOpen(true)} />
      </div>
      {open ? (
        <BuilderWindow
          title={title?.trim() || "Untitled report"}
          document={document}
          onChange={onChange}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </PreviewProvider>
  );
}

/** The report as this page shows it: its dates, its blocks, and what keeps it from being saved. */
function ReportSummary({
  document,
  workspace,
  unread,
  onOpen,
}: {
  document: CustomDocument;
  workspace: PreviewWorkspace | null;
  unread: (tables: readonly string[]) => string[];
  onOpen: () => void;
}) {
  const params = useMemo(() => resolveParams(periodParams(document.period), {}), [document.period]);
  const sources = useReportSources();
  const data = useCustomData(document.blocks, sources.data?.sources, params);
  const problems = document.blocks.flatMap((block) => {
    if (block.type !== "query") return [];
    const problem = problemOf(data.checks.get(block.id), data.results.get(block.id));
    return problem ? [`${block.name}: ${problem.message}`] : [];
  });
  const reads = tablesRead(data.checks, data.tables);

  return (
    <section className="space-y-3" aria-label="The report">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="t-section-title text-[var(--ink)]">On the report</h2>
        <span className="t-body-sm text-[var(--text-muted)]">Opens on {periodWords(document.period).toLowerCase()}</span>
        <Button variant="primary" className="ml-auto" onClick={onOpen}>
          Open the builder
        </Button>
      </div>
      {document.blocks.length === 0 ? (
        <p className="t-body-sm text-[var(--text-muted)]">Nothing yet. Open the builder to add a table, a chart or figures, each from a question over the report sources.</p>
      ) : (
        <ol className="divide-y divide-[var(--line)] rounded-[var(--radius-sm)] shadow-[inset_0_0_0_1px_var(--line)]">
          {document.blocks.map((block) => {
            const result = block.type === "query" ? data.results.get(block.id) : undefined;
            return (
              <li key={block.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 truncate text-[var(--ink)]">{blockTitle(block)}</span>
                {block.type === "query" ? <span className="font-mono text-xs text-[var(--text-muted)]">{block.name}</span> : null}
                <span className="ml-auto font-mono text-xs text-[var(--text-muted)]">
                  {result?.ok ? `${result.rows.length.toLocaleString("en-US")} ${result.rows.length === 1 ? "row" : "rows"}` : ""}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <UnreadNotice workspace={workspace} tables={unread(reads)} />
      {problems.length ? (
        <ul role="alert" className="space-y-1 text-sm text-[var(--bad)]">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Reports' builder over the whole window, on the report this page holds. Done hands it back. */
function BuilderWindow({
  title,
  document,
  onChange,
  onClose,
}: {
  title: string;
  document: CustomDocument;
  onChange: (next: unknown) => void;
  onClose: () => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const sources = useReportSources();
  const params = useMemo(() => resolveParams(periodParams(document.period), {}), [document.period]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const data = useCustomData(document.blocks, sources.data?.sources, params, filters);
  const draft: CustomReportInput = { title, description: null, audience: "JUST_ME", document };
  const problems = document.blocks.flatMap((block) => {
    if (block.type !== "query") return [];
    const problem = problemOf(data.checks.get(block.id), data.results.get(block.id));
    return problem ? [`${block.name}: ${problem.message}`] : [];
  });

  // The page under it stays put while the builder is open, and focus starts inside it.
  useEffect(() => {
    const before = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";
    frame.current?.focus();
    return () => {
      window.document.body.style.overflow = before;
    };
  }, []);

  return (
    <div ref={frame} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Build ${title}`} className="fixed inset-0 z-50 bg-[var(--surface)] focus:outline-none">
      <ReportBuilderView
        report={{ id: "library", canShare: false }}
        draft={draft}
        onDraft={(next) => onChange(next.document)}
        sources={sources.data?.sources ?? []}
        data={data}
        params={params}
        problems={problems}
        onBack={onClose}
        backLabel="Back to the library item"
        held={{ onDone: onClose }}
        filters={filters}
        onFilter={(column, next) =>
          setFilters((current) => {
            const out = { ...current };
            if (next === null) delete out[column];
            else out[column] = next;
            return out;
          })
        }
        onCopy={(text) => void navigator.clipboard?.writeText(text)}
      />
    </div>
  );
}
