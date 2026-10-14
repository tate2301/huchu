"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  BuilderBar,
  BuilderGrid,
  BuilderInspector,
  BuilderOutline,
  CanvasBlock,
  canvasRows,
  SwitchRow,
  useBlockList,
  type BlockKind,
  type BuilderMode,
} from "@/components/builder/grid";
import { Button, Empty, Field, Icon, Input, TextArea } from "@/components/core";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { formatValue } from "@/lib/reports/format";
import { naturalGrouping, naturalMeasure, type LayoutBlock, type Measure, type ReportLayout } from "@/lib/reports/layout";
import { AGGREGATES, type Aggregate, type ReportColumn, type ReportMeta } from "@/lib/reports/types";
import { AGGREGATE_LABELS, applyView, defaultView, isNumeric } from "@/lib/reports/view";

import { Leaf } from "./report-blocks";
import type { ReportResponse } from "./use-report";

/**
 * Arranging a report's page (PageReportArrange), on the builder grid: the
 * blocks it opens with in the outline, the page drawn live from the report's
 * own rows so the page being arranged is the page people will see, and the
 * selected block's settings on the right. Publish saves it for everyone.
 */

type Setup = {
  report: ReportMeta;
  enabled: boolean;
  arranged: boolean;
  viewSaved: boolean;
  ownLayout: ReportLayout;
};

type Kind = "figures" | "bars" | "trend" | "breakdown" | "heading" | "text" | "table";

const KINDS: Record<Kind, BlockKind> = {
  figures: { id: "figures", label: "Headline figures", icon: "figure" },
  bars: { id: "bars", label: "Bar chart", icon: "reports" },
  trend: { id: "trend", label: "Trend over time", icon: "insights" },
  breakdown: { id: "breakdown", label: "Breakdown", icon: "list" },
  heading: { id: "heading", label: "Heading", icon: "sections" },
  text: { id: "text", label: "Text", icon: "sentence" },
  table: { id: "table", label: "The table", icon: "table" },
};

/** Drawing widths on the page: a block across it, and half of it. */
const FULL = 760;
const HALF = 370;

const GROUPABLE = new Set(["text", "status", "relation"]);

function kindOf(block: LayoutBlock): Kind {
  return block.type === "chart" ? block.form : block.type;
}

function newId(kind: string, existing: readonly LayoutBlock[]): string {
  const taken = new Set(existing.map((block) => block.id));
  for (let n = 1; ; n += 1) {
    const id = `${kind}-${n}`;
    if (!taken.has(id)) return id;
  }
}

/** What a block is called in the outline: its title or text, else its kind. */
function blockName(block: LayoutBlock, meta: ReportMeta): string {
  if (block.type === "heading") return block.text.trim() || "Heading";
  if (block.type === "text") return block.text.trim().split("\n")[0]!.slice(0, 60) || "Text";
  if (block.type === "chart") {
    if (block.title) return block.title;
    const by = meta.columns.find((column) => column.key === block.by);
    return `${measureName(block.measure, meta.columns)}, by ${by ? (block.form === "trend" ? "expected close" : by.label.toLowerCase()) : block.by}`.replace(/^./, (c) => c.toUpperCase());
  }
  return KINDS[kindOf(block)].label;
}

function measureName(measure: Measure | undefined, columns: ReportColumn[]): string {
  if (!measure) return "Rows";
  const column = columns.find((candidate) => candidate.key === measure.column);
  return measure.fn === "sum" ? (column?.label ?? measure.column) : `${AGGREGATE_LABELS[measure.fn]} of ${column?.label ?? measure.column}`;
}

function createBlock(kind: string, existing: readonly LayoutBlock[], meta: ReportMeta): LayoutBlock {
  const id = newId(kind, existing);
  const measure = naturalMeasure(meta.columns) ?? undefined;
  switch (kind as Kind) {
    case "figures":
      return { id, type: "figures" };
    case "bars": {
      const by = naturalGrouping(meta.columns) ?? meta.columns.find((column) => GROUPABLE.has(column.kind)) ?? meta.columns[0]!;
      return { id, type: "chart", form: "bars", by: by.key, measure };
    }
    case "trend": {
      const by = meta.columns.find((column) => column.kind === "date") ?? meta.columns[0]!;
      return { id, type: "chart", form: "trend", by: by.key, measure };
    }
    case "breakdown":
      return { id, type: "breakdown" };
    case "table":
      return { id, type: "table" };
    case "heading":
      return { id, type: "heading", text: "" };
    default:
      return { id, type: "text", text: "" };
  }
}

const ROWS = "rows";

function measureOptions(columns: ReportColumn[]): Array<[string, string]> {
  return [
    [ROWS, "How many rows"],
    ...columns
      .filter((column) => isNumeric(column.kind))
      .flatMap((column) => (["sum", "avg", "max"] as Aggregate[]).map((fn): [string, string] => [`${fn}:${column.key}`, `${AGGREGATE_LABELS[fn]} of ${column.label}`])),
  ];
}

/** A choice as the arranger draws it: its name over a box showing what is picked; the box opens the list. */
function Choice({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  const id = useId();
  const picked = options.find(([optionValue]) => optionValue === value)?.[1] ?? "";
  return (
    <div className="field rb-pick">
      <label htmlFor={id}>
        <span>{label}</span>
        <span className="selbox">
          <span className="truncate">{picked}</span>
          <Icon name="down" />
        </span>
      </label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </div>
  );
}

/** The selected block's settings, as the inspector's Block tab lists them. */
function BlockSettings({ block, update, meta }: { block: LayoutBlock; update: (next: LayoutBlock) => void; meta: ReportMeta }) {
  const half =
    block.type === "table" ? null : (
      <SwitchRow label="Half width" help="Sits beside the next block." checked={Boolean(block.half)} onChange={(on) => update({ ...block, half: on || undefined })} />
    );
  const grouped = meta.columns.filter((column) => GROUPABLE.has(column.kind));

  if (block.type === "heading") {
    return (
      <>
        <Field label="Text">
          <Input aria-label="Text" value={block.text} placeholder="Heading" onChange={(event) => update({ ...block, text: event.target.value })} />
        </Field>
        <Choice
          label="Size"
          value={String(block.level ?? 2)}
          options={[
            ["1", "Large"],
            ["2", "Medium"],
          ]}
          onChange={(value) => update({ ...block, level: Number(value) as 1 | 2 })}
        />
        {half}
      </>
    );
  }
  if (block.type === "text") {
    return (
      <>
        <Field label="Text">
          <TextArea aria-label="Text" value={block.text} placeholder="A note for everyone who opens this report" onChange={(event) => update({ ...block, text: event.target.value })} />
        </Field>
        {half}
      </>
    );
  }
  if (block.type === "table") {
    return <p className="rb-note">The report&apos;s rows, as each person filters, groups and sets its columns. It is always the page&apos;s full width.</p>;
  }
  if (block.type === "figures") {
    return (
      <>
        <p className="rb-note">How many rows, and every total the table shows, each as a figure.</p>
        {half}
      </>
    );
  }
  if (block.type === "breakdown") {
    return (
      <>
        <Choice
          label="One line for each"
          value={block.by ?? "view"}
          options={[["view", "The table's grouping"], ...grouped.map((column): [string, string] => [column.key, column.label])]}
          onChange={(value) => update({ ...block, by: value === "view" ? undefined : value })}
        />
        <Choice
          label="Show at most"
          value={String(block.limit ?? 12)}
          options={[5, 8, 12, 20].map((n): [string, string] => [String(n), `${n} lines`])}
          onChange={(value) => update({ ...block, limit: Number(value) })}
        />
        {half}
      </>
    );
  }

  const candidates = meta.columns.filter((column) => (block.form === "trend" ? column.kind === "date" : GROUPABLE.has(column.kind)));
  return (
    <>
      <Field label="Title">
        <Input aria-label="Title" value={block.title ?? ""} placeholder={blockName({ ...block, title: undefined }, meta)} onChange={(event) => update({ ...block, title: event.target.value || undefined })} />
      </Field>
      <Choice
        label={block.form === "trend" ? "Over" : "One bar for each"}
        value={block.by}
        options={candidates.map((column) => [column.key, column.label])}
        onChange={(by) => update({ ...block, by })}
      />
      <Choice
        label="Measure"
        value={block.measure ? `${block.measure.fn}:${block.measure.column}` : ROWS}
        options={measureOptions(meta.columns)}
        onChange={(value) => {
          if (value === ROWS) return update({ ...block, measure: undefined });
          const [fn, column] = value.split(":") as [Aggregate, string];
          if (AGGREGATES.includes(fn)) update({ ...block, measure: { column, fn } });
        }}
      />
      {block.form === "bars" ? (
        <Choice
          label="Show at most"
          value={String(block.limit ?? 8)}
          options={[5, 8, 10, 15].map((n): [string, string] => [String(n), `${n} bars, the rest as Other`])}
          onChange={(value) => update({ ...block, limit: Number(value) })}
        />
      ) : null}
      {half}
      <p className="rb-note">Charts have one colour and no legend, on screen and in the PDF.</p>
    </>
  );
}

export function ReportArranger({ reportKey }: { reportKey: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();

  const setup = useQuery({
    queryKey: ["reports", reportKey, "settings"],
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
  const [mode, setMode] = useState<BuilderMode>("build");
  const [tab, setTab] = useState<"block" | "page">("block");

  // The page's rows name what their sums are in (`withCurrency`); the settings' columns do not.
  const loadedColumns = data.data?.report?.columns;
  const meta = useMemo(() => (setup.data?.report ? { ...setup.data.report, columns: loadedColumns ?? setup.data.report.columns } : null), [setup.data, loadedColumns]);
  const context = useMemo(() => {
    if (!meta) return null;
    const view = defaultView(meta);
    return { meta, view, params: data.data?.params ?? {}, applied: applyView(data.data?.rows ?? [], meta.columns, view) };
  }, [meta, data.data]);

  const list = useBlockList<LayoutBlock>({
    blocks,
    onChange: setDraft,
    create: (kind, existing) => createBlock(kind, existing, meta!),
    duplicate: (block, existing) => ({ ...block, id: newId(kindOf(block), existing) }),
    initial: (blocks.find((block) => block.type === "chart") ?? blocks[0])?.id ?? null,
  });

  const save = async (layout: ReportLayout | null) => {
    setSaving(true);
    try {
      await fetchJson(`/api/v2/reports/${encodeURIComponent(reportKey)}/settings`, { method: "PATCH", body: JSON.stringify({ layout }) });
      await queryClient.invalidateQueries({ queryKey: ["reports", reportKey] });
      setDraft(null);
      toast({ title: layout ? "Page published" : "Back to the report's own page", variant: "success" });
    } catch (error) {
      toast({ title: "Not published", description: getApiErrorMessage(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const back = async () => {
    if (dirty) {
      const leave = await dsConfirm({
        title: "Leave without publishing",
        description: "The changes to the page are lost.",
        confirmLabel: "Leave",
        variant: "danger",
      });
      if (!leave) return;
    }
    router.push(`/reports/${reportKey}`);
  };

  const hasTable = blocks.some((block) => block.type === "table");
  const kinds = Object.values(KINDS).filter((kind) => kind.id !== "table" || !hasTable);
  const onPage = new Set(blocks.map(kindOf));
  const problems = blocks.length === 0 ? ["An empty page shows nothing. Add the table at least."] : [];

  const bar = (
    <BuilderBar
      lead={
        <>
          <Button variant="quiet" iconOnly icon="back" label="Back" onClick={() => void back()} />
          <span className="rb-mark" aria-hidden="true">
            <Icon name="reports" />
          </span>
          <div className="st-name">
            <b className="truncate">{meta?.title ?? "Report"}</b>
            <span>Arranging the page, for everyone</span>
          </div>
        </>
      }
      mode={mode}
      onMode={setMode}
      saved={saving ? { state: "saving" } : dirty ? { state: "dirty" } : { state: "saved", at: null }}
      actions={
        <Button onClick={() => setDraft(null)} disabled={!dirty || saving}>
          Discard
        </Button>
      }
      publish={{
        onPublish: () => (dirty ? void save({ blocks }) : router.push(`/reports/${reportKey}`)),
        disabled: problems.length > 0,
        busy: saving,
      }}
    />
  );

  if (setup.isLoading || (!setup.data && !setup.isError)) {
    return (
      <BuilderGrid
        scope="arrange"
        wideBar
        bar={bar}
        outline={<div className="pm-body" aria-busy="true" style={{ paddingTop: 16 }}>{[0, 1, 2, 3].map((n) => <div key={n} className="skeleton" style={{ height: 28, marginBottom: 6 }} />)}</div>}
        canvas={
          <div className="rb-board" aria-busy="true" aria-label="Loading">
            <div className="skeleton" style={{ height: 80 }} />
            <div className="skeleton" style={{ height: 220 }} />
          </div>
        }
        canvasLabel="The page"
      />
    );
  }

  if (setup.isError || !meta || !context) {
    return (
      <BuilderGrid
        scope="arrange"
        wideBar
        mode="preview"
        bar={bar}
        canvas={
          <div className="rb-board">
            <Empty
              icon="warn"
              title="This report cannot be arranged"
              action={
                <Button icon="history" onClick={() => void setup.refetch()}>
                  Try again
                </Button>
              }
            >
              {setup.error ? getApiErrorMessage(setup.error) : "Check the connection and try again."} Only managers arrange a report&apos;s page.
            </Empty>
          </div>
        }
        canvasLabel="The page"
      />
    );
  }

  const selected = list.selected;
  const preview = mode === "preview";

  const draw = (block: LayoutBlock) => {
    const tag = { icon: KINDS[kindOf(block)].icon, label: KINDS[kindOf(block)].label };
    const common = { preview, selected: selected?.id === block.id, onSelect: () => list.select(block.id), tag, label: blockName(block, meta) };
    if (block.type === "table") {
      // A stand-in for the table: the columns that name a row, and the money.
      const money = context.applied.columns.find((column) => column.kind === "money");
      const lead = context.applied.columns.filter((column) => column !== money).slice(0, money ? 3 : 4);
      const shown = money ? [...lead, money] : lead;
      return (
        <CanvasBlock key={block.id} {...common}>
          <div className="rb-scroll">
            <table className="table">
              <thead>
                <tr>
                  {shown.map((column) => (
                    <th key={column.key} className={isNumeric(column.kind) ? "num" : undefined}>
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {context.applied.rows.slice(0, 3).map((row) => (
                  <tr key={row.id}>
                    {shown.map((column) => (
                      <td key={column.key} className={isNumeric(column.kind) ? "num" : undefined}>
                        {formatValue(row[column.key], column)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="rb-note" style={{ margin: "12px 0 0" }}>
            {context.applied.rows.length.toLocaleString("en-US")} rows. Filters, grouping and columns as each person sets them.
          </p>
        </CanvasBlock>
      );
    }
    if (block.type === "heading" || block.type === "text") {
      return (
        <CanvasBlock key={block.id} {...common} plain>
          {block.text.trim() ? (
            <Leaf block={block} width={block.half ? HALF : FULL} {...context} />
          ) : (
            <p className="muted">{block.type === "heading" ? "A heading" : "A note"}. Write it in Block, on the right.</p>
          )}
        </CanvasBlock>
      );
    }
    return (
      <CanvasBlock key={block.id} {...common}>
        <Leaf block={block} width={block.half ? HALF : FULL} {...context} />
      </CanvasBlock>
    );
  };

  return (
    <BuilderGrid
      scope="arrange"
      wideBar
      mode={mode}
      bar={bar}
      outline={
        <BuilderOutline
          heading="The page"
          entries={blocks.map((block) => ({ id: block.id, icon: KINDS[kindOf(block)].icon, title: blockName(block, meta) }))}
          selected={selected?.id ?? null}
          onSelect={list.select}
          onMove={list.move}
          kinds={kinds}
          onAdd={list.add}
          catalogue={kinds.filter((kind) => !onPage.has(kind.id as Kind))}
        />
      }
      canvas={
        <div className="rb-board">
          {canvasRows(blocks.map((block) => ({ ...block, half: block.type === "table" ? undefined : block.half }))).map((row) =>
            row.length === 2 ? (
              <div className="rb-cols" key={row[0]!.id}>
                {row.map((block) => draw(blocks.find((candidate) => candidate.id === block.id)!))}
              </div>
            ) : (
              draw(blocks.find((candidate) => candidate.id === row[0]!.id)!)
            ),
          )}
          {blocks.length === 0 ? (
            <Empty icon="reports" title="Nothing on the page" action={<Button icon="plus" onClick={() => list.add("table")}>Add the table</Button>}>
              An empty page shows nothing. Add the table at least, and press / for the rest.
            </Empty>
          ) : null}
        </div>
      }
      canvasLabel="The page"
      inspector={
        <BuilderInspector<"block" | "page">
          tabs={[
            { value: "block", label: "Block" },
            { value: "page", label: "Page" },
          ]}
          tab={tab}
          onTab={setTab}
        >
          {tab === "page" ? (
            <>
              <h2>The page</h2>
              <p className="rb-note">
                Everyone who opens {meta.title.toLowerCase()} opens this page: its figures, charts and table, in this order. Each person still filters and groups the table their own way.
              </p>
              {setup.data?.arranged ? (
                <Button icon="history" onClick={() => void save(null)} disabled={saving || dirty}>
                  Go back to the report&apos;s own page
                </Button>
              ) : null}
            </>
          ) : selected ? (
            <>
              <h2>{KINDS[kindOf(selected)].label}</h2>
              <BlockSettings block={selected} update={list.update} meta={meta} />
              <div className="rb-acts">
                {selected.type !== "table" ? (
                  <Button icon="docs" onClick={() => list.duplicate(selected)}>
                    Duplicate
                  </Button>
                ) : null}
                <Button variant="quiet" icon="x" onClick={() => list.remove(selected)}>
                  Delete
                </Button>
              </div>
            </>
          ) : (
            <p className="rb-note">Choose a block on the page, or add one with /.</p>
          )}
        </BuilderInspector>
      }
      inspectorLabel="Inspector"
    />
  );
}
