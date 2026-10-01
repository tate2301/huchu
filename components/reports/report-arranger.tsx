"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { EmptyState, Skeleton, Switch } from "@corelithzw/react";
import { PageEditor, type EditorKind } from "@/components/editor/page-editor";
import editor from "@/components/editor/page-editor.module.css";
import { PageChrome } from "@/components/layout/page-chrome";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { BarChart3, ChartLine, Hash, ListBullets, MoreHorizontal, TableRows, TextAlignLeft, TextT } from "@/lib/icons";
import {
  naturalGrouping,
  naturalMeasure,
  type LayoutBlock,
  type Measure,
  type ReportLayout,
} from "@/lib/reports/layout";
import { AGGREGATES, type Aggregate, type ReportColumn, type ReportMeta } from "@/lib/reports/types";
import { AGGREGATE_LABELS, applyView, defaultView, isNumeric } from "@/lib/reports/view";

import { Leaf } from "./report-blocks";
import styles from "./report-arranger.module.css";
import type { ReportResponse } from "./use-report";

/**
 * Arranging a report's page: the blocks it opens with, in order, each drawn
 * live from the report's own rows so the page being arranged is the page
 * people will see. Built on the same page editor as the forms and templates —
 * drag to move, `/` to add, a toolbar on the selected block.
 */

type Setup = {
  report: ReportMeta;
  enabled: boolean;
  arranged: boolean;
  viewSaved: boolean;
  ownLayout: ReportLayout;
};

type BlockKind = "figures" | "bars" | "trend" | "breakdown" | "heading" | "text" | "table";

const KINDS: Record<BlockKind, EditorKind> = {
  figures: { id: "figures", label: "Headline figures", icon: Hash },
  bars: { id: "bars", label: "Bar chart", icon: BarChart3 },
  trend: { id: "trend", label: "Trend over time", icon: ChartLine },
  breakdown: { id: "breakdown", label: "Breakdown", icon: ListBullets },
  heading: { id: "heading", label: "Heading", icon: TextT },
  text: { id: "text", label: "Text", icon: TextAlignLeft },
  table: { id: "table", label: "The table", icon: TableRows },
};

/** Preview widths in the editor's column: a block across it, and half of it. */
const FULL = 580;
const HALF = 290;

const GROUPABLE = new Set(["text", "status", "relation"]);

function kindOf(block: LayoutBlock): BlockKind {
  return block.type === "chart" ? block.form : block.type;
}

function newId(kind: string, existing: readonly LayoutBlock[]): string {
  const taken = new Set(existing.map((block) => block.id));
  for (let n = 1; ; n += 1) {
    const id = `${kind}-${n}`;
    if (!taken.has(id)) return id;
  }
}

function createBlock(kind: string, text: string, existing: readonly LayoutBlock[], meta: ReportMeta): LayoutBlock {
  const id = newId(kind, existing);
  const measure = naturalMeasure(meta.columns) ?? undefined;
  switch (kind as BlockKind) {
    case "figures":
      return { id, type: "figures" };
    case "bars": {
      const by = naturalGrouping(meta.columns) ?? meta.columns.find((column) => GROUPABLE.has(column.kind)) ?? meta.columns[0]!;
      return { id, type: "chart", form: "bars", by: by.key, measure, ...(text ? { title: text } : {}) };
    }
    case "trend": {
      const by = meta.columns.find((column) => column.kind === "date") ?? meta.columns[0]!;
      return { id, type: "chart", form: "trend", by: by.key, measure, ...(text ? { title: text } : {}) };
    }
    case "breakdown":
      return { id, type: "breakdown" };
    case "table":
      return { id, type: "table" };
    case "heading":
      return { id, type: "heading", text };
    default:
      return { id, type: "text", text };
  }
}

/* ──────────────────────────────────────────────────────────────────────────
   Toolbar controls
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
      <SelectTrigger className={`${styles.select} w-auto`} aria-label={label}>
        <SelectValue />
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

function HalfToggle({ block, update }: { block: Exclude<LayoutBlock, { type: "table" }>; update: (next: LayoutBlock) => void }) {
  return (
    <label className={styles.toggle}>
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

function measureValue(measure: Measure | undefined): string {
  return measure ? `${measure.fn}:${measure.column}` : ROWS;
}

function measureOptions(columns: ReportColumn[]): Array<[string, string]> {
  return [
    [ROWS, "Rows"],
    ...columns
      .filter((column) => isNumeric(column.kind))
      .flatMap((column) =>
        (["sum", "avg", "max"] as Aggregate[]).map(
          (fn): [string, string] => [`${fn}:${column.key}`, fn === "sum" ? column.label : `${column.label} (${AGGREGATE_LABELS[fn].toLowerCase()})`],
        ),
      ),
  ];
}

function BlockToolbar({ block, update, meta }: { block: LayoutBlock; update: (next: LayoutBlock) => void; meta: ReportMeta }) {
  if (block.type === "table") return null;
  const rule = <span className={editor.toolbarRule} aria-hidden="true" />;

  if (block.type === "chart") {
    const candidates = meta.columns.filter((column) =>
      block.form === "trend" ? column.kind === "date" : GROUPABLE.has(column.kind),
    );
    return (
      <>
        <Choice
          label="Chart"
          value={block.form}
          options={[
            ["bars", "Bars"],
            ["trend", "Trend"],
          ]}
          onChange={(form) => {
            const by =
              form === "trend"
                ? meta.columns.find((column) => column.kind === "date")
                : naturalGrouping(meta.columns) ?? meta.columns.find((column) => GROUPABLE.has(column.kind));
            if (by) update({ ...block, form: form as "bars" | "trend", by: by.key });
          }}
        />
        {rule}
        <Choice
          label={block.form === "trend" ? "Over" : "By"}
          value={block.by}
          options={candidates.map((column) => [column.key, `${block.form === "trend" ? "Over" : "By"} ${column.label.toLowerCase()}`])}
          onChange={(by) => update({ ...block, by })}
        />
        {rule}
        <Choice
          label="Measure"
          value={measureValue(block.measure)}
          options={measureOptions(meta.columns)}
          onChange={(value) => {
            if (value === ROWS) return update({ ...block, measure: undefined });
            const [fn, column] = value.split(":") as [Aggregate, string];
            if (AGGREGATES.includes(fn)) update({ ...block, measure: { column, fn } });
          }}
        />
        {block.form === "bars" ? (
          <>
            {rule}
            <Choice
              label="Bars shown"
              value={String(block.limit ?? 8)}
              options={[5, 8, 10, 15].map((n): [string, string] => [String(n), `Top ${n}`])}
              onChange={(value) => update({ ...block, limit: Number(value) })}
            />
          </>
        ) : null}
        {rule}
        <HalfToggle block={block} update={update} />
      </>
    );
  }

  if (block.type === "breakdown") {
    const options: Array<[string, string]> = [
      ["", "By the table's grouping"],
      ...meta.columns
        .filter((column) => GROUPABLE.has(column.kind))
        .map((column): [string, string] => [column.key, `By ${column.label.toLowerCase()}`]),
    ];
    return (
      <>
        <Choice
          label="By"
          value={block.by ?? ""}
          options={options.map(([value, label]) => [value || "view", label])}
          onChange={(value) => update({ ...block, by: value === "view" ? undefined : value })}
        />
        {rule}
        <HalfToggle block={block} update={update} />
      </>
    );
  }

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

  return <HalfToggle block={block} update={update} />;
}

/* ──────────────────────────────────────────────────────────────────────────
   The arranger
   ────────────────────────────────────────────────────────────────────────── */

export function ReportArranger({ reportKey }: { reportKey: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const settingsKey = ["reports", reportKey, "settings"];

  const setup = useQuery({
    queryKey: settingsKey,
    queryFn: () => fetchJson<Setup>(`/api/v2/reports/${encodeURIComponent(reportKey)}/settings`),
  });
  const data = useQuery({
    queryKey: ["reports", reportKey, "preview"],
    queryFn: () => fetchJson<ReportResponse>(`/api/v2/reports/${encodeURIComponent(reportKey)}?preview=1`),
  });

  const saved = setup.data?.report.layout?.blocks;
  const [draft, setDraft] = useState<LayoutBlock[] | null>(null);
  const blocks = draft ?? saved ?? [];
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);
  const [saving, setSaving] = useState(false);

  const meta = setup.data?.report ?? null;
  const context = useMemo(() => {
    if (!meta) return null;
    const view = defaultView(meta);
    return { meta, view, params: data.data?.params ?? {}, applied: applyView(data.data?.rows ?? [], meta.columns, view) };
  }, [meta, data.data]);

  const save = async (layout: ReportLayout | null) => {
    setSaving(true);
    try {
      await fetchJson(`/api/v2/reports/${encodeURIComponent(reportKey)}/settings`, {
        method: "PATCH",
        body: JSON.stringify({ layout }),
      });
      await queryClient.invalidateQueries({ queryKey: ["reports", reportKey] });
      setDraft(null);
      toast({ title: layout ? "Page saved" : "Back to the report's own page", variant: "success" });
    } catch (error) {
      toast({ title: "Not saved", description: getApiErrorMessage(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const hasTable = blocks.some((block) => block.type === "table");
  const kinds = Object.values(KINDS).filter((kind) => kind.id !== "table" || !hasTable);

  const chrome = (
    <PageChrome title={meta ? `Arrange ${meta.title.toLowerCase()}` : "Arrange"} backHref={`/reports/${reportKey}`} backLabel={meta?.title ?? "Report"}>
      {meta ? (
        <>
          {dirty ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={saving}>
                Discard
              </Button>
              <Button size="sm" onClick={() => void save({ blocks })} disabled={saving}>
                Save the page
              </Button>
            </>
          ) : null}
          {setup.data?.arranged && !dirty ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="More">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void save(null)}>Go back to the report&apos;s own page</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </>
      ) : null}
    </PageChrome>
  );

  if (setup.isLoading) {
    return (
      <>
        {chrome}
        <div className="mx-auto grid w-full max-w-[640px] gap-3" aria-busy="true">
          <Skeleton height={80} />
          <Skeleton height={220} />
          <Skeleton height={140} />
        </div>
      </>
    );
  }

  if (setup.isError || !meta || !context) {
    return (
      <>
        {chrome}
        <EmptyState
          title="This report cannot be arranged"
          body={setup.error ? getApiErrorMessage(setup.error) : undefined}
          action={
            <Button variant="secondary" size="sm" onClick={() => void setup.refetch()}>
              Try again
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      {chrome}
      <div className={styles.frame}>
        <PageEditor<LayoutBlock>
          items={blocks}
          onChange={setDraft}
          kinds={kinds}
          defaultKind="text"
          addPlaceholder="Type a note, or / for a chart, figures or the table"
          itemName={(block) => KINDS[kindOf(block)].label}
          create={(kind, text, existing) => createBlock(kind, text, existing, meta)}
          duplicate={(block, existing) =>
            block.type === "table" ? createBlock("text", "", existing, meta) : { ...block, id: newId(kindOf(block), existing) }
          }
          renderItem={(block, update) => {
            if (block.type === "heading") {
              return (
                <input
                  className={`${styles.headingInput}${block.level === 1 ? ` ${styles.headingLarge}` : ""}`}
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
                  className={styles.textInput}
                  value={block.text}
                  placeholder="A note for everyone who opens this report"
                  aria-label="Text"
                  onChange={(event) => update({ ...block, text: event.target.value })}
                />
              );
            }
            if (block.type === "table") {
              const shown = context.applied.columns.slice(0, 6);
              return (
                <div className={styles.tableStandIn} aria-label="The table">
                  <div className={`${styles.tableHead} acct-col-head`}>
                    {shown.map((column) => (
                      <span key={column.key}>{column.label}</span>
                    ))}
                  </div>
                  {[0, 1, 2].map((row) => (
                    <div key={row} className={styles.tableRow} />
                  ))}
                  <span className={styles.half}>
                    {context.applied.rows.length.toLocaleString("en-US")} rows · filters, grouping and columns as each person sets them
                  </span>
                </div>
              );
            }
            return (
              <div>
                {block.half ? <p className={styles.half}>Half width — sits beside the next half block</p> : null}
                <Leaf block={block} width={block.half ? HALF : FULL} {...context} />
              </div>
            );
          }}
          renderToolbar={(block, update) => <BlockToolbar block={block} update={update} meta={meta} />}
          problems={blocks.length === 0 ? ["An empty page shows nothing — add the table at least."] : []}
        />
      </div>
    </>
  );
}
