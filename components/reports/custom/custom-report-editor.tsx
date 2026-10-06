"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { EmptyState, Skeleton, Switch } from "@corelithzw/react";
import { PageEditor, type EditorKind } from "@/components/editor/page-editor";
import editor from "@/components/editor/page-editor.module.css";
import { PageChrome } from "@/components/layout/page-chrome";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { BarChart3, ChartLine, ChevronDown, ChevronRight, Hash, ListBullets, TableRows, TextAlignLeft, TextT } from "@/lib/icons";
import {
  customReportInputSchema,
  freeBlockId,
  freeBlockName,
  sourceStem,
  type BlockDisplay,
  type CustomBlock,
  type CustomDocument,
  type CustomReport,
  type CustomReportInput,
  type DateDefault,
  type QueryBlock,
  periodParams,
} from "@/lib/reports/custom/document";
import { naturalGrouping, naturalMeasure, type Measure } from "@/lib/reports/layout";
import { resolveParams } from "@/lib/reports/params";
import { AGGREGATES, type Aggregate, type ReportColumn } from "@/lib/reports/types";
import { AGGREGATE_LABELS } from "@/lib/reports/view";

import arranger from "../report-arranger.module.css";
import { chartColumns, CustomBlockResult } from "./custom-block";
import styles from "./custom-report-editor.module.css";
import { QueryEditor } from "./query-editor";
import { useCustomData, useReportSources, type ReportSource } from "./use-custom-data";

/**
 * Building a report: a page of blocks, each a query over the workspace's
 * report sources and a way of showing what it returns. Built on the same page
 * editor as a report's own arranger — drag to move, `/` to add, a toolbar on
 * the selected block — with the query written in place and its result drawn
 * live under it, from real rows, as it is typed.
 */

type BlockKind = "table" | "bars" | "trend" | "figures" | "breakdown" | "heading" | "text";

const KINDS: Record<BlockKind, EditorKind> = {
  table: { id: "table", label: "Table", icon: TableRows },
  bars: { id: "bars", label: "Bar chart", icon: BarChart3 },
  trend: { id: "trend", label: "Trend over time", icon: ChartLine },
  figures: { id: "figures", label: "Headline figures", icon: Hash },
  breakdown: { id: "breakdown", label: "Breakdown", icon: ListBullets },
  heading: { id: "heading", label: "Heading", icon: TextT },
  text: { id: "text", label: "Text", icon: TextAlignLeft },
};

function kindOf(block: CustomBlock): BlockKind {
  if (block.type !== "query") return block.type;
  return block.display.type === "chart" ? block.display.form : block.display.type;
}

/** The dates a report can open on, as the person picks them. */
const PERIODS: Array<{ id: string; label: string; from: DateDefault | null; to: DateDefault | null }> = [
  { id: "7", label: "The last 7 days", from: "-7d", to: "today" },
  { id: "30", label: "The last 30 days", from: "-30d", to: "today" },
  { id: "90", label: "The last 90 days", from: "-90d", to: "today" },
  { id: "365", label: "The last 12 months", from: "-365d", to: "today" },
  { id: "month", label: "This month so far", from: "monthStart", to: "today" },
  { id: "year", label: "This year so far", from: "yearStart", to: "today" },
  { id: "any", label: "Any time", from: null, to: null },
];

function periodId(period: CustomDocument["period"]): string {
  return PERIODS.find((entry) => entry.from === period.from && entry.to === period.to)?.id ?? "custom";
}

/* ──────────────────────────────────────────────────────────────────────────
   New blocks
   ────────────────────────────────────────────────────────────────────────── */

/** The source a new block starts from: the one the page last read, else the first there is. */
function defaultSource(blocks: readonly CustomBlock[], sources: readonly ReportSource[]): ReportSource | null {
  for (const block of [...blocks].reverse()) {
    if (block.type !== "query") continue;
    const key = /^\s*from\s+([A-Za-z0-9_-]+)/m.exec(block.query)?.[1];
    const source = sources.find((candidate) => candidate.key === key);
    if (source) return source;
  }
  return sources[0] ?? null;
}

function createBlock(kind: string, text: string, existing: readonly CustomBlock[], sources: readonly ReportSource[]): CustomBlock {
  if (kind === "heading") return { id: freeBlockId("heading", existing), type: "heading", text };
  if (kind === "text") return { id: freeBlockId("text", existing), type: "text", text };

  const source = defaultSource(existing, sources);
  const columns = source?.columns ?? [];
  const from = source ? `from ${source.key}\n` : "from ";
  const measure = naturalMeasure(columns) ?? undefined;
  const base = { id: freeBlockId("query", existing), type: "query" as const, name: freeBlockName(source ? sourceStem(source.key) : "result", existing), ...(text ? { title: text } : {}) };

  switch (kind as BlockKind) {
    case "bars": {
      const by = naturalGrouping(columns) ?? chartColumns(columns, "bars").by[0];
      return { ...base, query: from, display: { type: "chart", form: "bars", by: by?.key ?? "", ...(measure ? { measure } : {}) } };
    }
    case "trend": {
      const by = chartColumns(columns, "trend").by[0];
      return { ...base, query: from, display: { type: "chart", form: "trend", by: by?.key ?? "", ...(measure ? { measure } : {}) } };
    }
    case "figures": {
      const totals = columns.filter((column) => column.total === "sum").map((column) => `${column.key} = sum(${column.key})`);
      return { ...base, query: `${from}aggregate ${["rows = count()", ...totals].join(", ")}\n`, display: { type: "figures" } };
    }
    case "breakdown":
      return { ...base, query: from, display: { type: "breakdown" } };
    default:
      return { ...base, query: from, display: { type: "table" } };
  }
}

/** A display switched to another kind, keeping what still fits the result's columns. */
function redisplay(kind: BlockKind, display: BlockDisplay, columns: ReportColumn[]): BlockDisplay {
  if (kind === "table" || kind === "figures") return { type: kind };
  if (kind === "breakdown") return { type: "breakdown" };
  const form = kind as "bars" | "trend";
  const { by } = chartColumns(columns, form);
  const keep = display.type === "chart" && by.some((column) => column.key === display.by) ? display.by : null;
  const measure = display.type === "chart" ? display.measure : undefined;
  return {
    type: "chart",
    form,
    by: keep ?? (form === "bars" ? naturalGrouping(columns) ?? by[0] : by[0])?.key ?? "",
    ...(measure ? { measure } : {}),
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   Toolbar
   ────────────────────────────────────────────────────────────────────────── */

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={`${arranger.select} w-auto`} aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map(([optionValue, optionLabel]) => (
          <SelectItem key={optionValue} value={optionValue}>
            {optionLabel}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function HalfToggle({ block, update }: { block: CustomBlock; update: (next: CustomBlock) => void }) {
  return (
    <label className={arranger.toggle}>
      Half width
      <Switch
        checked={Boolean(block.half)}
        onChange={(event) => update({ ...block, half: event.target.checked || undefined })}
        aria-label="Half width"
      />
    </label>
  );
}

const ROWS = "rows";

function measureOptions(columns: ReportColumn[]): Array<[string, string]> {
  return [
    [ROWS, "Rows"],
    ...chartColumns(columns, "bars").measures.flatMap((column) =>
      (["sum", "avg", "max"] as Aggregate[]).map((fn): [string, string] => [
        `${fn}:${column.key}`,
        fn === "sum" ? column.label : `${column.label} (${AGGREGATE_LABELS[fn].toLowerCase()})`,
      ]),
    ),
  ];
}

function BlockToolbar({
  block,
  update,
  columns,
}: {
  block: CustomBlock;
  update: (next: CustomBlock) => void;
  /** The block's result columns, once it has run. */
  columns: ReportColumn[];
}) {
  const rule = <span className={editor.toolbarRule} aria-hidden="true" />;
  if (block.type === "heading") {
    return (
      <>
        <Choice
          label="Size"
          value={String(block.level ?? 2)}
          options={[
            ["1", "Large"],
            ["2", "Medium"],
          ]}
          onChange={(value) => update({ ...block, level: Number(value) as 1 | 2 })}
        />
        {rule}
        <HalfToggle block={block} update={update} />
      </>
    );
  }
  if (block.type === "text") return <HalfToggle block={block} update={update} />;

  const { display } = block;
  const kind = kindOf(block);
  const setDisplay = (next: BlockDisplay) => update({ ...block, display: next });
  return (
    <>
      <Choice
        label="Show as"
        value={kind}
        options={(["table", "bars", "trend", "figures", "breakdown"] as BlockKind[]).map((id) => [id, KINDS[id].label])}
        onChange={(value) => setDisplay(redisplay(value as BlockKind, display, columns))}
      />
      {display.type === "chart" ? (
        <>
          {rule}
          <Choice
            label={display.form === "trend" ? "Over" : "By"}
            value={display.by}
            options={chartColumns(columns, display.form).by.map((column) => [
              column.key,
              `${display.form === "trend" ? "Over" : "By"} ${column.label.toLowerCase()}`,
            ])}
            onChange={(by) => setDisplay({ ...display, by })}
          />
          {rule}
          <Choice
            label="Measure"
            value={display.measure ? `${display.measure.fn}:${display.measure.column}` : ROWS}
            options={measureOptions(columns)}
            onChange={(value) => {
              if (value === ROWS) {
                return setDisplay({ type: "chart", form: display.form, by: display.by, ...(display.limit ? { limit: display.limit } : {}) });
              }
              const [fn, ...rest] = value.split(":");
              if (AGGREGATES.includes(fn as Aggregate)) {
                setDisplay({ ...display, measure: { fn: fn as Measure["fn"], column: rest.join(":") } });
              }
            }}
          />
          {display.form === "bars" ? (
            <>
              {rule}
              <Choice
                label="Bars shown"
                value={String(display.limit ?? 8)}
                options={[5, 8, 10, 15].map((n): [string, string] => [String(n), `Top ${n}`])}
                onChange={(value) => setDisplay({ ...display, limit: Number(value) })}
              />
            </>
          ) : null}
        </>
      ) : null}
      {display.type === "breakdown" ? (
        <>
          {rule}
          <Choice
            label="By"
            value={display.by ?? "auto"}
            options={[
              ["auto", "By its first grouping"],
              ...chartColumns(columns, "bars").by.map((column): [string, string] => [column.key, `By ${column.label.toLowerCase()}`]),
            ]}
            onChange={(value) => setDisplay(value === "auto" ? { type: "breakdown" } : { ...display, by: value })}
          />
        </>
      ) : null}
      {rule}
      <HalfToggle block={block} update={update} />
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Sources
   ────────────────────────────────────────────────────────────────────────── */

function SourceList({ sources, onCopy }: { sources: readonly ReportSource[]; onCopy: (text: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const areas = useMemo(() => {
    const byArea = new Map<string, ReportSource[]>();
    for (const source of sources) byArea.set(source.area, [...(byArea.get(source.area) ?? []), source]);
    return [...byArea.entries()];
  }, [sources]);

  return (
    <nav aria-label="Sources you can query" className="grid gap-4">
      <p className="text-[12px] leading-[1.5] text-[var(--text-muted)]">
        Every report you can open is a source. Click a name to copy it.
      </p>
      {areas.map(([area, list]) => (
        <section key={area}>
          <h3 className="mb-1 text-[12px] font-semibold text-[var(--text-strong)]">{area}</h3>
          <ul>
            {list.map((source) => (
              <li key={source.key}>
                <div className="flex items-center">
                  <button
                    type="button"
                    className={styles.sourceButton}
                    aria-expanded={open === source.key}
                    aria-label={`${open === source.key ? "Hide" : "Show"} the columns of ${source.title}`}
                    onClick={() => setOpen(open === source.key ? null : source.key)}
                    style={{ width: "auto" }}
                  >
                    {open === source.key ? <ChevronDown className="size-3" aria-hidden="true" /> : <ChevronRight className="size-3" aria-hidden="true" />}
                  </button>
                  <button type="button" className={styles.sourceButton} onClick={() => onCopy(source.key)} title={`Copy ${source.key}`}>
                    <span className="min-w-0 flex-1 truncate">{source.title}</span>
                    <span className="font-mono text-[11px] text-[var(--text-subtle)]">{source.key}</span>
                  </button>
                </div>
                {open === source.key ? (
                  <ul className={styles.columnList}>
                    {source.columns.map((column) => (
                      <li key={column.key}>
                        <button type="button" className={styles.sourceButton} onClick={() => onCopy(column.key)} title={column.label}>
                          <span className="min-w-0 flex-1 truncate font-mono">{column.key}</span>
                          <span className="text-[var(--text-subtle)]">{column.kind}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   The editor
   ────────────────────────────────────────────────────────────────────────── */

const FULL = 960;
const HALF = 460;

function inputOf(report: CustomReport): CustomReportInput {
  return { title: report.title, description: report.description ?? null, shared: report.shared, document: report.document };
}

export function CustomReportEditor({ id }: { id: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const queryKey = ["reports", "custom", id];

  const report = useQuery({
    queryKey,
    queryFn: () => fetchJson<{ report: CustomReport }>(`/api/v2/reports/custom/${encodeURIComponent(id)}`),
  });
  const sources = useReportSources();

  const saved = report.data ? inputOf(report.data.report) : null;
  const [draft, setDraft] = useState<CustomReportInput | null>(null);
  const current = draft ?? saved;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);
  const [saving, setSaving] = useState(false);

  const change = (patch: Partial<CustomReportInput>) => current && setDraft({ ...current, ...patch });
  const setBlocks = (blocks: CustomBlock[]) => current && setDraft({ ...current, document: { ...current.document, blocks } });

  const blocks = useMemo(() => current?.document.blocks ?? [], [current?.document.blocks]);
  const period = current?.document.period;
  const params = useMemo(() => (period ? resolveParams(periodParams(period), {}) : {}), [period]);
  const data = useCustomData(blocks, sources.data?.sources, params);

  const parsed = current ? customReportInputSchema.safeParse(current) : null;
  const problems = parsed && !parsed.success ? [...new Set(parsed.error.issues.map((issue) => issue.message))] : [];

  const save = async () => {
    if (!current || !parsed?.success) return;
    setSaving(true);
    try {
      await fetchJson(`/api/v2/reports/custom/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(parsed.data) });
      await queryClient.invalidateQueries({ queryKey: ["reports"] });
      setDraft(null);
      toast({ title: `${current.title} saved`, variant: "success" });
    } catch (error) {
      toast({ title: "Not saved", description: getApiErrorMessage(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ⌘S saves; leaving with unsaved changes asks first.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (dirty && !saving) void save();
      }
    };
    const onLeave = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onLeave);
    };
  });

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => toast({ title: `Copied ${text}` }),
      () => undefined,
    );
  };

  const chrome = (
    <PageChrome
      title={current?.title ? `Edit ${current.title}` : "Edit report"}
      backHref={`/reports/custom/${id}`}
      backLabel={current?.title ?? "Report"}
    >
      {current ? (
        dirty ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={saving}>
              Discard
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={saving || problems.length > 0}>
              Save the report
            </Button>
          </>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => router.push(`/reports/custom/${id}`)}>
            Done
          </Button>
        )
      ) : null}
    </PageChrome>
  );

  if (report.isLoading || sources.isLoading) {
    return (
      <>
        {chrome}
        <div className="mx-auto grid w-full max-w-[880px] gap-3" aria-busy="true" aria-live="polite">
          <Skeleton height={36} width={320} />
          <Skeleton height={140} />
          <Skeleton height={220} />
        </div>
      </>
    );
  }

  if (report.isError || sources.isError || !current || !report.data) {
    return (
      <>
        {chrome}
        <EmptyState
          title="This report did not open"
          body={getApiErrorMessage(report.error ?? sources.error)}
          action={
            <Button variant="secondary" size="sm" onClick={() => void Promise.all([report.refetch(), sources.refetch()])}>
              Try again
            </Button>
          }
        />
      </>
    );
  }

  if (!report.data.report.editable) {
    return (
      <>
        {chrome}
        <EmptyState
          title="You can open this report, not change it"
          body="Only whoever made it, or a manager once it is shared, can change it. Make a copy to build on it."
          action={
            <Button variant="secondary" size="sm" onClick={() => router.push(`/reports/custom/${id}`)}>
              Open the report
            </Button>
          }
        />
      </>
    );
  }

  const sourceList = sources.data?.sources ?? [];
  const columnsOf = (block: CustomBlock): ReportColumn[] => {
    const check = block.type === "query" ? data.checks.get(block.id) : undefined;
    return check?.ok ? check.query.columns : [];
  };
  const blockContext = (block: QueryBlock) => ({
    ...data.context,
    // A block can read any other block on the page, but not itself.
    blocks: new Map(
      blocks.flatMap((other) => {
        if (other.type !== "query" || other.id === block.id) return [];
        const check = data.checks.get(other.id);
        return check?.ok ? [[other.name, check.query.columns] as const] : [];
      }),
    ),
  });

  const header = (
    <div>
      <input
        className={styles.titleInput}
        value={current.title}
        placeholder="Name this report"
        aria-label="Report title"
        onChange={(event) => change({ title: event.target.value })}
      />
      <textarea
        className={styles.descriptionInput}
        value={current.description ?? ""}
        placeholder="What it answers, for whoever opens it"
        aria-label="Description"
        rows={1}
        onChange={(event) => change({ description: event.target.value || null })}
      />
      <div className={styles.settings}>
        <span className="flex items-center gap-2">
          Opens on
          <Select
            value={periodId(current.document.period)}
            onValueChange={(value) => {
              const picked = PERIODS.find((entry) => entry.id === value);
              if (picked) change({ document: { ...current.document, period: { from: picked.from, to: picked.to } } });
            }}
          >
            <SelectTrigger size="sm" className="w-auto" aria-label="The dates it opens on">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {periodId(current.document.period) === "custom" ? <SelectItem value="custom">Its own dates</SelectItem> : null}
              {PERIODS.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </span>
        {report.data.report.mine ? (
          <label className={arranger.toggle}>
            Everyone in the workspace can open it
            <Switch
              checked={current.shared}
              onChange={(event) => change({ shared: event.target.checked })}
              aria-label="Everyone in the workspace can open it"
            />
          </label>
        ) : null}
        <span className="ml-auto font-mono text-[11px]">
          {params.from || params.to ? `${params.from || "…"} – ${params.to || "…"}` : "Any time"} · $from and $to in a query
        </span>
      </div>
    </div>
  );

  return (
    <>
      {chrome}
      <div className={styles.frame}>
        <PageEditor<CustomBlock>
          wide
          items={blocks}
          onChange={setBlocks}
          kinds={Object.values(KINDS)}
          defaultKind="text"
          addPlaceholder="Type a note, or / for a table, a chart or figures"
          header={header}
          itemName={(block) => (block.type === "query" ? `@${block.name}` : KINDS[kindOf(block)].label)}
          create={(kind, text, existing) => createBlock(kind, text, existing, sourceList)}
          duplicate={(block, existing) =>
            block.type === "query"
              ? { ...block, id: freeBlockId("query", existing), name: freeBlockName(block.name, existing) }
              : { ...block, id: freeBlockId(block.type, existing) }
          }
          renderItem={(block, update) => {
            if (block.type === "heading") {
              return (
                <input
                  className={`${arranger.headingInput}${block.level === 1 ? ` ${arranger.headingLarge}` : ""}`}
                  value={block.text}
                  placeholder="Heading"
                  aria-label="Heading"
                  onChange={(event) => update({ ...block, text: event.target.value })}
                />
              );
            }
            if (block.type === "text") {
              return (
                <textarea
                  className={arranger.textInput}
                  value={block.text}
                  placeholder="A note for whoever opens this report"
                  aria-label="Text"
                  onChange={(event) => update({ ...block, text: event.target.value })}
                />
              );
            }
            const check = data.checks.get(block.id);
            const problem = check && !check.ok ? check.problem : null;
            const result = data.results.get(block.id);
            const reads = check?.ok ? check.query.reports : [];
            return (
              <div>
                <div className={styles.blockHead}>
                  <input
                    className={styles.blockTitle}
                    value={block.title ?? ""}
                    placeholder="Untitled — a title shows above it"
                    aria-label="Block title"
                    onChange={(event) => update({ ...block, title: event.target.value || undefined })}
                  />
                  <label className="flex items-center gap-1 font-mono text-[11px] text-[var(--text-subtle)]">
                    @
                    <input
                      className={styles.blockName}
                      value={block.name}
                      aria-label="Block name, for other blocks to read it"
                      title="Other blocks read this one as @name"
                      onChange={(event) => update({ ...block, name: event.target.value.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 40) })}
                    />
                  </label>
                </div>
                <QueryEditor
                  value={block.query}
                  onChange={(query) => update({ ...block, query })}
                  context={blockContext(block)}
                  problem={problem}
                  label={`Query for @${block.name}`}
                />
                {problem ? null : (
                  <div className={styles.preview}>
                    <div className={block.display.type === "table" ? styles.previewScroll : undefined}>
                      <CustomBlockResult
                        block={block}
                        check={check}
                        result={result}
                        loading={reads.some((key) => !data.loaded.has(key))}
                        params={params}
                        width={block.half ? HALF : FULL}
                        truncated={reads.some((key) => data.truncated.has(key))}
                      />
                    </div>
                    {result?.ok ? (
                      <p className="mt-2 font-mono text-[11px] text-[var(--text-muted)]">
                        {result.rows.length.toLocaleString("en-US")} rows · {result.columns.length} columns
                        {block.half ? " · half width, beside the next half block" : ""}
                      </p>
                    ) : null}
                  </div>
                )}
                {problem ? (
                  <p role="alert" className="mt-2 font-mono text-[12px] leading-[1.5] text-[var(--status-error-text)]">
                    {problem.message}
                  </p>
                ) : null}
              </div>
            );
          }}
          renderToolbar={(block, update) => <BlockToolbar block={block} update={update} columns={columnsOf(block)} />}
          problems={problems}
        />
        <aside className={styles.aside}>
          <SourceList sources={sourceList} onCopy={copy} />
        </aside>
      </div>
    </>
  );
}
