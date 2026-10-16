"use client";

import * as React from "react";

import {
  BuilderBar,
  BuilderGrid,
  BuilderInspector,
  BuilderOutline,
  CanvasBlock,
  canvasRows,
  SwitchRow,
  useBlockList,
  type BuilderMode,
  type SavedState,
} from "@/components/builder/grid";
import { Button, ButtonGroup, Empty, Field, Icon, Input, Segmented, Select, TextArea, useShortcut } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import {
  freeBlockId,
  freeBlockName,
  type BlockDisplay,
  type CustomBlock,
  type CustomReport,
  type CustomReportInput,
  type QueryBlock,
} from "@/lib/reports/custom/document";
import type { BlockCheck, BlockResult } from "@/lib/reports/custom/run";
import { formatValue } from "@/lib/reports/format";
import type { Measure } from "@/lib/reports/layout";
import type { SqlProblem } from "@/lib/reports/sql/guard";
import { blockTable, sqlName, type SqlTable } from "@/lib/reports/sql/schema";
import { stepsFromSql } from "@/lib/reports/sql/steps";
import { stepSentences } from "@/lib/reports/sql/step-words";
import { TEMPLATE_AUDIENCES } from "@/lib/reports/template-access";
import { SEEN_BY_WORDS } from "@/lib/reports/template-words";
import { AGGREGATES, type Aggregate, type ReportColumn, type ReportParams } from "@/lib/reports/types";
import { isNumeric } from "@/lib/reports/view";
import type { ReportSuggestion } from "@/lib/vane/status";

import { chartColumns, CustomBlockResult } from "./custom-block";
import { ControlsView, SentenceView } from "./report-controls";
import { QueryEditor } from "./query-editor";
import { QuerySteps } from "./query-steps";
import {
  addableKinds,
  blockQuestion,
  blockTitle,
  createReportBlock,
  duplicateReportBlock,
  kindIcon,
  kindOf,
  kindWords,
  measureOptions,
  PERIODS,
  periodId,
  periodWords,
  questionName,
  redisplay,
  REPORT_KINDS,
  ROWS,
  type ReportBlockKind,
} from "./report-builder-blocks";
import type { ReportSource } from "./use-custom-data";
import { VaneSuggestion, type SuggestionState } from "./vane-suggestion";

/**
 * A custom report's builder (ReportBuild), on the builder grid: the outline
 * of the board's blocks with Add a block (/), the board as it will read,
 * the selected block's settings, and the shelf of the questions the board
 * asks — each as steps or SQL, run here, its rows beside it, read only.
 *
 * Pure: the report, its draft, its rows and Vane's suggestion come in, edits
 * go out through `onDraft`. The page (`report-builder.tsx`) fetches and
 * saves; the fixture (`app/design/report-build-vane`) passes fixed data.
 */

/** A block's question, once its query has checked and run. */
export type BuilderData = {
  tables: SqlTable[];
  checks: ReadonlyMap<string, BlockCheck>;
  results: ReadonlyMap<string, BlockResult>;
  truncated: ReadonlySet<string>;
  /** Rows are on their way, or the queries are running. */
  pending: boolean;
  running: boolean;
  /** How long the last run took, in milliseconds. */
  ms: number | null;
  rerun: () => void;
  /** The values each of the report's filters can be set to, by column. */
  options?: Readonly<Record<string, readonly string[]>>;
};

export type BuilderSuggestion = {
  item: ReportSuggestion;
  /** Vane's question as a block, run with the others but not on the page until kept. */
  block: QueryBlock;
  state: SuggestionState;
  busy?: boolean;
  /** Vane wrote it on request ("Give Vane a change to make"): kept with its own title and look. */
  written?: boolean;
  onKept: () => void;
  onDismiss: () => void;
};

/** "Give Vane a change to make": Vane writes one block, checked, shown as its suggestion until kept (`/api/vane/write/report-block`). */
export type BuilderAsk = { onAsk: (request: string) => void; busy: boolean };

type InspectorTab = "block" | "look" | "click" | "data" | "settings";
type QueryView = "steps" | "sql";

const NO_FILTERS: Readonly<Record<string, string>> = {};

/**
 * The text columns the board's questions read from their sources: what a
 * filter can narrow by. A column one source has narrows that source's rows.
 */
export function filterableColumns(blocks: readonly CustomBlock[], tables: readonly SqlTable[]): Array<{ column: string; label: string }> {
  const read = new Set(blocks.flatMap((block) => (block.type === "query" ? [...block.query.matchAll(/\bfrom\s+([A-Za-z0-9_]+)|\bjoin\s+([A-Za-z0-9_]+)/gi)].map((match) => (match[1] ?? match[2] ?? "").toLowerCase()) : [])));
  const seen = new Map<string, string>();
  for (const table of tables) {
    if (!read.has(table.name)) continue;
    for (const column of table.columns) {
      if ((column.kind === "text" || column.kind === "status") && !seen.has(column.sql)) seen.set(column.sql, column.label);
    }
  }
  return [...seen].map(([column, label]) => ({ column, label }));
}

/** Drawing widths on the board: a block across it, and beside another. */
const FULL = 816;
const HALF = 400;
/** Rows the shelf shows of a question's result. */
const SHELF_ROWS = 50;

/** What is wrong with a block: its query does not check, or it did not run. */
export function problemOf(check: BlockCheck | undefined, result: BlockResult | undefined): SqlProblem | null {
  if (check && !check.ok) return check.problem;
  if (result && !result.ok) return result.problem;
  return null;
}

function Choice({
  label,
  value,
  options,
  onChange,
  help,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
  help?: string;
}) {
  const id = React.useId();
  return (
    <Field label={label} htmlFor={id} help={help}>
      <Select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  help,
  long = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  help?: string;
  long?: boolean;
}) {
  const id = React.useId();
  return (
    <Field label={label} htmlFor={id} help={help}>
      {long ? (
        <TextArea id={id} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <Input id={id} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      )}
    </Field>
  );
}

/** A result's rows in the shelf: SQL names over the columns, values as they came back. */
function ResultRows({ result }: { result: Extract<BlockResult, { ok: true }> }) {
  const rows = result.rows.slice(0, SHELF_ROWS);
  return (
    <table className="table">
      <thead>
        <tr>
          {result.columns.map((column) => (
            <th key={column.key} className={isNumeric(column.kind) ? "num" : undefined}>
              {column.key}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={row.id ?? index}>
            {result.columns.map((column) => {
              const value = row[column.key];
              const numeric = isNumeric(column.kind);
              return (
                <td key={column.key} className={numeric ? "num" : column.kind === "date" ? "muted" : undefined}>
                  {value === null || value === undefined ? "" : numeric ? String(value) : formatValue(value, column)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ReportBuilderView({
  report,
  draft,
  onDraft,
  sources,
  data,
  params,
  saved,
  problems,
  onPublish,
  publishing = false,
  onDiscard,
  onBack,
  backLabel = "Back to all reports",
  arrangement = "reports",
  onCopy,
  suggestion = null,
  ask = null,
  filters = NO_FILTERS,
  onFilter,
  held = null,
}: {
  report: Pick<CustomReport, "id" | "canShare">;
  draft: CustomReportInput;
  onDraft: (next: CustomReportInput) => void;
  sources: readonly ReportSource[];
  data: BuilderData;
  params: ReportParams;
  /** Left out where the page around the builder saves it. */
  saved?: SavedState;
  /** What stands between this draft and a save. */
  problems: readonly string[];
  onPublish?: () => void;
  publishing?: boolean;
  /** Offered while there is something to throw away. */
  onDiscard?: () => void;
  onBack: () => void;
  /** The way back's name: All reports, or Build. */
  backLabel?: string;
  /**
   * The inspector's tabs as each board draws them: Reports' builder (ReportBuild)
   * splits a block into Block, Look and When clicked; Build's (BuildReport) into
   * Block, Data (its steps, its SQL, its last run) and Settings. Same builder,
   * same settings, filed two ways.
   */
  arrangement?: "reports" | "build";
  /** Copy a source's or a column's name, for a query. */
  onCopy?: (text: string) => void;
  suggestion?: BuilderSuggestion | null;
  /** Offered while Vane works for this workspace; absent while it is paused. */
  ask?: BuilderAsk | null;
  /** The report's filters as set on this board, by column; they narrow its preview. */
  filters?: Readonly<Record<string, string>>;
  onFilter?: (column: string, value: string | null) => void;
  /**
   * The page around the builder holds the report (the portal's library): it
   * names it, says who gets it and saves it, so the builder has no Share, no
   * name or audience of its own, and Done in place of Publish.
   */
  held?: { onDone: () => void } | null;
}) {
  const [mode, setMode] = React.useState<BuilderMode>("build");
  const [tab, setTab] = React.useState<InspectorTab>("block");
  const [views, setViews] = React.useState<Record<string, QueryView>>({});
  const [asked, setAsked] = React.useState("");
  const blocks = draft.document.blocks;
  const setBlocks = (next: CustomBlock[]) => onDraft({ ...draft, document: { ...draft.document, blocks: next } });
  const change = (patch: Partial<CustomReportInput>) => onDraft({ ...draft, ...patch });

  const list = useBlockList<CustomBlock>({
    blocks,
    onChange: setBlocks,
    create: (kind, existing) => createReportBlock(kind, existing, sources),
    duplicate: duplicateReportBlock,
    // It opens on the board's table, as the board draws it: the block most often changed.
    initial: (blocks.find((block) => block.type === "query" && block.display.type === "table") ?? blocks[0])?.id ?? null,
  });
  const selected = list.selected;
  useShortcut("Esc", () => list.select(null), { enabled: Boolean(selected) && mode === "build" });

  const waiting = suggestion && suggestion.state === "waiting" ? suggestion : null;
  const queries = blocks.filter((block): block is QueryBlock => block.type === "query");
  // The question in the shelf: the one picked (there or on the board), else Vane's while it waits, else the selected block's.
  const [picked, setPicked] = React.useState<string | null>(null);
  const shelfId =
    (picked && (queries.some((block) => block.id === picked) || (waiting && picked === waiting.block.id)) ? picked : null) ??
    waiting?.block.id ??
    (selected?.type === "query" ? selected.id : null) ??
    queries[0]?.id ??
    null;
  const question: QueryBlock | null =
    (waiting && shelfId === waiting.block.id ? waiting.block : queries.find((block) => block.id === shelfId)) ?? null;
  const fromVane = Boolean(waiting && question && question.id === waiting.block.id);

  const select = (id: string | null) => {
    list.select(id);
    const block = blocks.find((candidate) => candidate.id === id);
    if (block?.type === "query") setPicked(block.id);
  };

  const columnsOf = (block: CustomBlock): ReportColumn[] => {
    const result = block.type === "query" ? data.results.get(block.id) : undefined;
    return result?.ok ? result.columns : [];
  };
  const rowCount = (block: QueryBlock): number | null => {
    const result = data.results.get(block.id);
    return result?.ok ? result.rows.length : null;
  };
  /** What a block's query can read: the sources, and every other block that has run. */
  const tablesFor = (block: QueryBlock): SqlTable[] => [
    ...data.tables,
    ...blocks.flatMap((other) => {
      if (other.type !== "query" || other.id === block.id) return [];
      const result = data.results.get(other.id);
      return result?.ok ? [blockTable(other.name, result.columns)] : [];
    }),
  ];

  const keep = () => {
    if (!waiting) return;
    const kept: QueryBlock = waiting.written
      ? { ...waiting.block, id: freeBlockId("query", blocks), name: freeBlockName(waiting.block.name, blocks) }
      : {
          ...waiting.block,
          id: freeBlockId("query", blocks),
          name: freeBlockName(waiting.block.name, blocks),
          title: waiting.item.name.charAt(0).toUpperCase() + waiting.item.name.slice(1),
          display: { type: "table" },
        };
    list.insert(kept);
    setPicked(kept.id);
    waiting.onKept();
  };

  /* ── The bar ─────────────────────────────────────────────────────────── */

  const shareItems: MenuEntry[] = [
    { heading: "Seen by" },
    ...TEMPLATE_AUDIENCES.filter((audience) => audience === "JUST_ME" || report.canShare || audience === draft.audience).map((audience) => ({
      key: audience,
      label: SEEN_BY_WORDS[audience],
      checked: draft.audience === audience,
      onSelect: () => change({ audience }),
    })),
  ];

  const bar = (
    <BuilderBar
      name={draft.title}
      mode={mode}
      onMode={setMode}
      saved={saved}
      actions={
        <>
          {onDiscard ? (
            <Button variant="quiet" onClick={onDiscard} disabled={publishing}>
              Discard
            </Button>
          ) : null}
          {held ? null : (
            <MenuButton icon="share" iconEnd={undefined} label="Share" items={shareItems}>
              Share
            </MenuButton>
          )}
        </>
      }
      publish={
        held
          ? { label: "Done", icon: "check", onPublish: held.onDone }
          : onPublish
            ? { onPublish, disabled: problems.length > 0, busy: publishing }
            : undefined
      }
    />
  );

  /* ── The outline ─────────────────────────────────────────────────────── */

  const outline = (
    <BuilderOutline
      head={
        <div className="pm-h">
          <h1 className="truncate">{draft.title || "Untitled report"}</h1>
          <Button variant="quiet" iconOnly icon="back" label={backLabel} onClick={onBack} />
        </div>
      }
      heading="On the board"
      addLabel={arrangement === "build" ? "Add" : undefined}
      entries={blocks.map((block) => ({
        id: block.id,
        icon: kindIcon(block),
        title: blockTitle(block),
        question: blockQuestion(block),
      }))}
      selected={selected?.id ?? null}
      onSelect={select}
      onMove={list.move}
      kinds={addableKinds(blocks)}
      onAdd={list.add}
      after={<Sources sources={sources} onCopy={onCopy} />}
    />
  );

  /* ── The board ───────────────────────────────────────────────────────── */

  const preview = mode === "preview";
  const draw = (block: CustomBlock) => {
    const tag = { icon: kindIcon(block), label: blockTitle(block) };
    if (block.type === "heading") {
      return (
        <CanvasBlock key={block.id} plain preview={preview} selected={selected?.id === block.id} onSelect={() => select(block.id)} tag={tag} label={blockTitle(block)}>
          {block.text.trim() ? <h2 className={block.level === 1 ? "is-large" : undefined}>{block.text}</h2> : <p className="muted">A heading. Write it in Block, on the right.</p>}
        </CanvasBlock>
      );
    }
    if (block.type === "text") {
      return (
        <CanvasBlock key={block.id} plain preview={preview} selected={selected?.id === block.id} onSelect={() => select(block.id)} tag={tag} label={blockTitle(block)}>
          {block.text.trim() ? <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{block.text}</p> : <p className="muted">A note. Write it in Block, on the right.</p>}
        </CanvasBlock>
      );
    }
    if (block.type === "sentence") {
      const from = queries.find((query) => query.name === block.from);
      return (
        <CanvasBlock key={block.id} plain preview={preview} selected={selected?.id === block.id} onSelect={() => select(block.id)} tag={tag} label={blockTitle(block)}>
          <SentenceView block={block} result={from ? data.results.get(from.id) : undefined} loading={Boolean(from) && (data.pending || (data.running && !data.results.get(from!.id)))} />
        </CanvasBlock>
      );
    }
    if (block.type === "controls") {
      return (
        <CanvasBlock key={block.id} plain preview={preview} selected={selected?.id === block.id} onSelect={() => select(block.id)} tag={tag} label={blockTitle(block)}>
          <ControlsView
            block={block}
            datesWords={periodWords(draft.document.period)}
            onDatesClick={() => list.select(null)}
            values={filters}
            options={data.options ?? {}}
            onFilter={(column, value) => onFilter?.(column, value)}
          />
        </CanvasBlock>
      );
    }
    const check = data.checks.get(block.id);
    const result = data.results.get(block.id);
    const reads = check?.ok ? check.checked.tables : [];
    const drawn = (
      <CustomBlockResult
        block={block}
        check={check}
        result={result}
        loading={data.pending || (data.running && !result)}
        params={params}
        width={block.half ? HALF : FULL}
        truncated={reads.some((table) => data.truncated.has(table))}
        foot={preview}
      />
    );
    return (
      <CanvasBlock key={block.id} preview={preview} selected={selected?.id === block.id} onSelect={() => select(block.id)} tag={tag} label={blockTitle(block)}>
        {block.display.type === "table" ? <div className="rb-scroll">{drawn}</div> : drawn}
      </CanvasBlock>
    );
  };

  const canvas = (
    <div className="rb-board">
      {draft.description ? <p className="muted" style={{ margin: 0 }}>{draft.description}</p> : null}
      {/* With its own controls the board narrows where they sit; without, by its dates here. */}
      {blocks.some((block) => block.type === "controls") ? null : (
        <ButtonGroup aria-label="Narrow the board">
          <Button icon="calendar" onClick={() => list.select(null)}>
            {periodWords(draft.document.period)}
          </Button>
        </ButtonGroup>
      )}
      {blocks.length === 0 ? (
        <Empty
          icon="reports"
          title="Nothing on this report yet"
          action={
            <Button icon="plus" onClick={() => list.add("table")}>
              Add a table
            </Button>
          }
        >
          Add a table, a chart or figures, each from a question over the reports you can open. Press / for the list.
        </Empty>
      ) : (
        canvasRows(blocks).map((row) =>
          row.length === 2 ? (
            <div className="rb-cols" key={row[0]!.id}>
              {row.map(draw)}
            </div>
          ) : (
            draw(row[0]!)
          ),
        )
      )}
      {problems.length && !preview ? (
        <ul className="rb-problems" aria-label="Before this can be published" role="alert">
          {problems.map((problem) => (
            <li key={problem}>
              <Icon name="warn" />
              {problem}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );

  /* ── The inspector ───────────────────────────────────────────────────── */

  const reportSettings = (
    <>
      {held ? null : (
        <>
          <TextField label="Name" value={draft.title} placeholder="Name this report" onChange={(title) => change({ title })} />
          <TextField
            label="Description"
            long
            value={draft.description ?? ""}
            placeholder="What it answers, for whoever opens it"
            onChange={(description) => change({ description: description || null })}
          />
        </>
      )}
      <Choice
        label="Opens on"
        value={periodId(draft.document.period)}
        options={[
          ...(periodId(draft.document.period) === "custom" ? ([["custom", "Its own dates"]] as Array<[string, string]>) : []),
          ...PERIODS.map((entry): [string, string] => [entry.id, entry.label]),
        ]}
        onChange={(value) => {
          const period = PERIODS.find((entry) => entry.id === value);
          if (period) change({ document: { ...draft.document, period: { from: period.from, to: period.to } } });
        }}
        help={`${params.from && params.to ? `${params.from} to ${params.to}` : params.from ? `${params.from} onwards` : params.to ? `Up to ${params.to}` : "Any time"}. A question reads them as period_start() and period_end().`}
      />
      {held ? null : (
        <Choice
          label="Seen by"
          value={draft.audience}
          options={TEMPLATE_AUDIENCES.filter((audience) => audience === "JUST_ME" || report.canShare || audience === draft.audience).map((audience): [string, string] => [audience, SEEN_BY_WORDS[audience]])}
          onChange={(audience) => change({ audience: audience as CustomReportInput["audience"] })}
        />
      )}
    </>
  );

  // Build's Data tab: the selected block's question, as steps and as SQL, and its last run.
  const dataOf = (block: CustomBlock) => {
    const asked = block.type === "query" ? block : null;
    if (!asked) return <p className="rb-note">This block reads no question of its own.</p>;
    const tables = tablesFor(asked);
    const parsed = stepsFromSql(asked.query, tables);
    const run = data.results.get(asked.id);
    const lines = asked.query.split("\n").filter((line) => line.trim()).length;
    const showIn = (next: QueryView) => {
      setPicked(asked.id);
      setViews((current) => ({ ...current, [asked.id]: next }));
    };
    return (
      <>
        <div className="ph">{questionName(asked.name)}</div>
        <div className="pl">
          <div className="pl-h">Steps</div>
          {parsed ? (
            <ol className="psteps">
              {stepSentences(parsed, tables).map((sentence, index) => (
                <li key={index}>
                  <Icon name="step" />
                  <span>{sentence}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="rb-note">Written as SQL that steps cannot show.</p>
          )}
          <Button variant="quiet" icon="plus" onClick={() => showIn("steps")}>
            Add a step
          </Button>
        </div>
        <div className="pl">
          <div className="prow">
            <b>Written as SQL</b>
            <span>
              {lines} {lines === 1 ? "line" : "lines"}
            </span>
          </div>
          <Button icon="sql" onClick={() => showIn("sql")}>
            Show the SQL
          </Button>
        </div>
        <div className="pl">
          <div className="pl-h">Last run</div>
          <div className="prow">
            <b>{run?.ok ? `${run.rows.length.toLocaleString("en-US")} ${run.rows.length === 1 ? "row" : "rows"}` : data.running ? "Running" : "Not run yet"}</b>
            <span>{data.ms !== null && run?.ok ? `${(data.ms / 1000).toFixed(2)} s, read only` : "read only"}</span>
          </div>
        </div>
      </>
    );
  };

  const inspector = selected ? (
    <BuilderInspector<InspectorTab>
      tabs={
        arrangement === "build"
          ? [
              { value: "block", label: "Block" },
              { value: "data", label: "Data" },
              { value: "settings", label: "Settings" },
            ]
          : [
              { value: "block", label: "Block" },
              { value: "look", label: "Look" },
              { value: "click", label: "When clicked" },
            ]
      }
      tab={arrangement === "build" ? (tab === "look" || tab === "click" ? "block" : tab) : tab === "data" || tab === "settings" ? "block" : tab}
      onTab={setTab}
    >
      {tab === "block" && arrangement === "build" ? dataOf(selected) : null}
      {tab === "block" ? (
        <BlockSettings
          block={selected}
          update={list.update}
          columns={columnsOf(selected)}
          queries={queries}
          resultOf={(name) => {
            const query = queries.find((candidate) => candidate.name === name);
            const result = query ? data.results.get(query.id) : undefined;
            return result?.ok ? result.columns : [];
          }}
          filterable={filterableColumns(blocks, data.tables)}
          rows={selected.type === "query" ? rowCount(selected) : null}
          onWriteSql={() => {
            if (selected.type !== "query") return;
            setPicked(selected.id);
            setViews((current) => ({ ...current, [selected.id]: "sql" }));
          }}
        />
      ) : tab === "look" ? (
        <LookSettings block={selected} update={list.update} columns={columnsOf(selected)} />
      ) : tab === "data" ? (
        <div className="pl">
          <div className="pl-h">What it returns</div>
          {columnsOf(selected).length ? (
            columnsOf(selected).map((column) => (
              <div key={column.key} className="prow">
                <b>{column.label}</b>
                <span>{column.kind}</span>
              </div>
            ))
          ) : (
            <p className="rb-note">Nothing yet: its question has not run.</p>
          )}
        </div>
      ) : tab === "settings" ? (
        <>
          <LookSettings block={selected} update={list.update} columns={columnsOf(selected)} />
          <p className="rb-note">Rows on this report open nothing when clicked.</p>
          <div className="pl-h">This report</div>
          {reportSettings}
        </>
      ) : (
        <p className="rb-note">Rows on this report open nothing when clicked.</p>
      )}
      <div className="rb-acts">
        <Button icon="docs" onClick={() => list.duplicate(selected)}>
          Duplicate
        </Button>
        <Button variant="quiet" icon="x" onClick={() => list.remove(selected)}>
          Delete
        </Button>
      </div>
    </BuilderInspector>
  ) : (
    <BuilderInspector heading="This report">
      {reportSettings}
    </BuilderInspector>
  );

  /* ── The shelf ───────────────────────────────────────────────────────── */

  const questions = [...queries, ...(waiting ? [waiting.block] : [])];
  const shelfList = (
    <>
      <div className="pg-h">
        <Icon name="sql" />
        <span>Questions</span>
        <Button variant="quiet" iconOnly icon="plus" label="New question" className="pg-add" onClick={() => list.add("table")} />
      </div>
      {questions.map((block) => {
        const count = rowCount(block);
        return (
          <button
            key={block.id}
            type="button"
            className={block.id === question?.id ? "oi is-on" : "oi"}
            aria-current={block.id === question?.id ? "true" : undefined}
            onClick={() => {
              setPicked(block.id);
              if (!waiting || block.id !== waiting.block.id) list.select(block.id);
            }}
          >
            <Icon name={waiting && block.id === waiting.block.id ? "suggestion" : "sql"} />
            <span className="oi-t">{questionName(block.name)}</span>
            {count !== null ? <span className="oi-q">{count.toLocaleString("en-US")}</span> : null}
          </button>
        );
      })}
      {questions.length === 0 ? <p className="rb-empty" style={{ padding: "4px 8px" }}>No questions yet.</p> : null}
    </>
  );

  const view: QueryView | null = question
    ? fromVane
      ? "steps"
      : (views[question.id] ?? (stepsFromSql(question.query, tablesFor(question)) ? "steps" : "sql"))
    : null;
  const steps = question ? stepsFromSql(question.query, tablesFor(question)) : null;
  const problem = question ? problemOf(data.checks.get(question.id), data.results.get(question.id)) : null;
  const update = (query: string) => question && !fromVane && list.update({ ...question, query });

  const shelfMiddle = (
    <>
      <div className="sh-h">
        <Segmented<QueryView>
          label="Write it as"
          value={view ?? "steps"}
          onChange={(next) => question && !fromVane && setViews((current) => ({ ...current, [question.id]: next }))}
          items={[
            { value: "steps", label: "Steps" },
            { value: "sql", label: "SQL" },
          ]}
        />
        <Button icon="run" onClick={data.rerun} busy={data.running}>
          Run
        </Button>
      </div>
      {suggestion ? (
        <VaneSuggestion suggestion={suggestion.item} state={suggestion.state} busy={suggestion.busy} onKeep={keep} onDismiss={suggestion.onDismiss} />
      ) : null}
      {question ? (
        <>
          {view === "steps" && steps ? (
            <ol className="psteps" aria-label={`The steps of ${questionName(question.name)}`}>
              {stepSentences(steps, tablesFor(question)).map((sentence, index) => (
                <li key={index} className={fromVane ? "is-new" : undefined}>
                  <Icon name="step" />
                  <span>{sentence}</span>
                </li>
              ))}
            </ol>
          ) : null}
          {fromVane ? (
            view === "sql" ? <pre className="rb-edit">{question.query}</pre> : null
          ) : (
            <div className="rb-edit">
              {view === "steps" ? (
                <QuerySteps sql={question.query} tables={tablesFor(question)} onChange={update} />
              ) : (
                <QueryEditor value={question.query} onChange={update} tables={tablesFor(question)} problem={problem} label={`The SQL of ${questionName(question.name)}`} />
              )}
            </div>
          )}
        </>
      ) : (
        <p className="rb-empty">Choose a question, or make one with New question.</p>
      )}
    </>
  );

  const result = question ? data.results.get(question.id) : undefined;
  const shelfResults = (
    <>
      <div className="sh-h">
        <span>
          {result?.ok
            ? `${result.rows.length.toLocaleString("en-US")} ${result.rows.length === 1 ? "row" : "rows"}${data.ms !== null ? ` in ${(data.ms / 1000).toFixed(2)} s` : ""}, read only`
            : question && (data.pending || data.running)
              ? "Running"
              : "No rows yet"}
        </span>
        {result?.ok && result.rows.length > SHELF_ROWS ? <span className="muted">Showing {SHELF_ROWS}</span> : null}
      </div>
      {problem ? <p className="rb-problem" role="alert">{problem.message}</p> : result?.ok ? <ResultRows result={result} /> : null}
      {ask ? (
        <form
          className="cl-in"
          onSubmit={(event) => {
            event.preventDefault();
            const request = asked.trim();
            if (!request || ask.busy) return;
            ask.onAsk(request);
            setAsked("");
          }}
        >
          <label className="input-wrap">
            <Icon name="suggestion" />
            <input
              type="text"
              aria-label="Give Vane a change to make"
              placeholder={ask.busy ? "Vane is writing it…" : "Give Vane a change to make"}
              value={asked}
              maxLength={1000}
              disabled={ask.busy}
              onChange={(event) => setAsked(event.target.value)}
            />
          </label>
        </form>
      ) : null}
    </>
  );

  return (
    <BuilderGrid
      scope="report"
      mode={mode}
      bar={bar}
      outline={outline}
      canvas={canvas}
      canvasLabel="The board"
      inspector={inspector}
      inspectorLabel={selected ? `${blockTitle(selected)} ${REPORT_KINDS[kindOf(selected)].label.toLowerCase()}` : "This report"}
      shelf={{ list: shelfList, middle: shelfMiddle, results: shelfResults }}
      shelfTall={Boolean(waiting)}
    />
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Settings
   ────────────────────────────────────────────────────────────────────────── */

function BlockSettings({
  block,
  update,
  columns,
  queries,
  resultOf,
  filterable,
  rows,
  onWriteSql,
}: {
  block: CustomBlock;
  update: (next: CustomBlock) => void;
  columns: ReportColumn[];
  /** The board's questions, for what a sentence reads. */
  queries: readonly QueryBlock[];
  /** A question's result columns, by its name. */
  resultOf: (name: string) => ReportColumn[];
  /** The columns the board's questions read from their sources, for a filter. */
  filterable: Array<{ column: string; label: string }>;
  rows: number | null;
  onWriteSql: () => void;
}) {
  if (block.type === "heading") {
    return <TextField label="Text" value={block.text} placeholder="Heading" onChange={(text) => update({ ...block, text })} />;
  }
  if (block.type === "text") {
    return <TextField label="Text" long value={block.text} placeholder="A note for whoever opens this report" onChange={(text) => update({ ...block, text })} />;
  }
  if (block.type === "sentence") {
    const holes = resultOf(block.from).map((column) => `{${column.key}}`);
    return (
      <>
        <TextField
          label="Title"
          value={block.title ?? ""}
          placeholder="None: it opens the board as its finding"
          onChange={(title) => update({ ...block, title: title || undefined })}
          help="With a title it is a note beside a chart."
        />
        <Choice
          label="Reads"
          value={block.from}
          options={[
            ...(block.from && !queries.some((query) => query.name === block.from) ? ([[block.from, `${questionName(block.from)}, not on the board`]] as Array<[string, string]>) : []),
            ...(block.from ? [] : ([["", "Choose a question"]] as Array<[string, string]>)),
            ...queries.map((query): [string, string] => [query.name, questionName(query.name)]),
          ]}
          onChange={(from) => update({ ...block, from })}
          help="Its first row's values fill the sentence."
        />
        <TextField
          label="The finding"
          long
          value={block.fact}
          placeholder="{visits} site visits drafted {quotes} quotes."
          onChange={(fact) => update({ ...block, fact })}
          help="In ink. Each {column} takes that column's value."
        />
        <TextField
          label="Then"
          long
          value={block.rest ?? ""}
          placeholder="{accepted} were accepted."
          onChange={(rest) => update({ ...block, rest })}
          help={holes.length ? `In grey. It can use ${holes.join(", ")}.` : "In grey."}
        />
      </>
    );
  }
  if (block.type === "controls") {
    const free = filterable.filter((option) => !block.filters.some((filter) => filter.column === option.column));
    return (
      <>
        <SwitchRow label="Dates" help="The report's dates, to change as it is read." checked={block.dates} onChange={(dates) => update({ ...block, dates })} />
        <div className="pl">
          <div className="pl-h">Filters</div>
          {block.filters.map((filter, index) => (
            <div key={filter.column} className="prow" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 8, alignItems: "end" }}>
              <TextField
                label={`Every ${filter.label.toLowerCase()}`}
                value={filter.label}
                help={`Narrows every question by ${filter.column}.`}
                onChange={(label) => update({ ...block, filters: block.filters.map((other, at) => (at === index ? { ...other, label: label.slice(0, 40) || filter.label } : other)) })}
              />
              <Button variant="quiet" iconOnly icon="x" label={`Remove Every ${filter.label.toLowerCase()}`} onClick={() => update({ ...block, filters: block.filters.filter((_, at) => at !== index) })} />
            </div>
          ))}
          {block.filters.length < 4 && free.length ? (
            <MenuButton
              variant="quiet"
              icon="plus"
              label="Add a filter"
              items={free.map((option) => ({
                key: option.column,
                label: option.label,
                onSelect: () => update({ ...block, filters: [...block.filters, { column: option.column, label: option.label.toLowerCase() }] }),
              }))}
            >
              Add a filter
            </MenuButton>
          ) : null}
          {free.length === 0 && block.filters.length === 0 ? <p className="rb-note">Its questions read no column to filter by yet.</p> : null}
        </div>
      </>
    );
  }
  const display = block.display;
  const hidden = new Set(display.type === "table" ? (display.hidden ?? []) : []);
  const money = columns.filter((column) => column.kind === "money" && !hidden.has(column.key));
  return (
    <>
      <TextField label="Title" value={block.title ?? ""} placeholder="A title shows above it" onChange={(title) => update({ ...block, title: title || undefined })} />
      <Choice
        label="Rows from"
        value={block.name}
        options={[[block.name, `${questionName(block.name)}${rows !== null ? `, ${rows.toLocaleString("en-US")} ${rows === 1 ? "row" : "rows"}` : ""}`]]}
        onChange={() => undefined}
        help="Its question, in the shelf below."
      />
      <TextField
        label="Name"
        value={block.name}
        help="Other questions read its rows by this name."
        onChange={(name) => update({ ...block, name: name.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 40) })}
      />
      {display.type === "table" ? (
        <>
          <div className="pl">
            <div className="pl-h">Columns</div>
            {columns.map((column) => (
              <label className="prow" key={column.key}>
                <span className="check">
                  <input
                    type="checkbox"
                    aria-label={`Show ${column.label}`}
                    checked={!hidden.has(column.key)}
                    onChange={(event) => {
                      const next = new Set(hidden);
                      if (event.target.checked) next.delete(column.key);
                      else next.add(column.key);
                      update({ ...block, display: { type: "table", ...(next.size ? { hidden: [...next] } : {}) } });
                    }}
                  />
                  {column.label}
                </span>
                <span>{kindWords(column.kind)}</span>
              </label>
            ))}
            <Button variant="quiet" icon="plus" onClick={onWriteSql}>
              Add a column
            </Button>
          </div>
          <Choice
            label="At the foot"
            value="count"
            options={[["count", money.length ? `Count, and the sum of ${money.map((column) => column.label).join(" and ")}` : "Count"]]}
            onChange={() => undefined}
          />
        </>
      ) : null}
    </>
  );
}

function LookSettings({ block, update, columns }: { block: CustomBlock; update: (next: CustomBlock) => void; columns: ReportColumn[] }) {
  const half = (
    <SwitchRow label="Half width" help="Sits beside the next block." checked={Boolean(block.half)} onChange={(on) => update({ ...block, half: on || undefined })} />
  );
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
        {half}
      </>
    );
  }
  if (block.type === "text" || block.type === "sentence" || block.type === "controls") return half;

  const display = block.display;
  const setDisplay = (next: BlockDisplay) => update({ ...block, display: next });
  return (
    <>
      <Choice
        label="Show as"
        value={kindOf(block)}
        options={(["table", "bars", "trend", "figures", "breakdown"] as ReportBlockKind[]).map((id) => [id, REPORT_KINDS[id].label])}
        onChange={(value) => setDisplay(redisplay(value as ReportBlockKind, display, columns))}
      />
      {display.type === "chart" ? (
        <>
          <Choice
            label={display.form === "trend" ? "Over" : "One bar for each"}
            value={display.by}
            options={chartColumns(columns, display.form).by.map((column) => [column.key, column.label])}
            onChange={(by) => setDisplay({ ...display, by })}
          />
          <Choice
            label="Measure"
            value={display.measure ? `${display.measure.fn}:${display.measure.column}` : ROWS}
            options={measureOptions(columns)}
            onChange={(value) => {
              if (value === ROWS) {
                setDisplay({ type: "chart", form: display.form, by: display.by, ...(display.limit ? { limit: display.limit } : {}) });
                return;
              }
              const [fn, ...rest] = value.split(":");
              if (AGGREGATES.includes(fn as Aggregate)) setDisplay({ ...display, measure: { fn: fn as Measure["fn"], column: rest.join(":") } });
            }}
          />
          {display.form === "bars" ? (
            <Choice
              label="Show at most"
              value={String(display.limit ?? 8)}
              options={[5, 8, 10, 15].map((n): [string, string] => [String(n), `${n} bars, the rest as Other`])}
              onChange={(value) => setDisplay({ ...display, limit: Number(value) })}
            />
          ) : null}
        </>
      ) : null}
      {display.type === "breakdown" ? (
        <Choice
          label="One line for each"
          value={display.by ?? "auto"}
          options={[["auto", "Its first grouping"], ...chartColumns(columns, "bars").by.map((column): [string, string] => [column.key, column.label])]}
          onChange={(value) => setDisplay(value === "auto" ? { type: "breakdown" } : { ...display, by: value })}
        />
      ) : null}
      {half}
      {display.type === "chart" ? <p className="rb-note">Charts have one colour and no legend, on screen and in the PDF.</p> : null}
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Sources
   ────────────────────────────────────────────────────────────────────────── */

function Sources({ sources, onCopy }: { sources: readonly ReportSource[]; onCopy?: (text: string) => void }) {
  const [open, setOpen] = React.useState<string | null>(null);
  const [shown, setShown] = React.useState(false);
  if (!sources.length) return null;
  return (
    <nav className="rb-sources" aria-label="Sources your questions can read">
      <button type="button" className="pg-h" style={{ width: "100%" }} aria-expanded={shown} onClick={() => setShown(!shown)}>
        <Icon name={shown ? "down" : "chev"} />
        Sources your questions can read
      </button>
      {shown ? (
        <ul>
          {sources.map((source) => (
            <li key={source.key}>
              <button
                type="button"
                className="rb-src"
                aria-expanded={open === source.key}
                title={`Click to see its columns; ${sqlName(source.key)} in a question`}
                onClick={() => {
                  setOpen(open === source.key ? null : source.key);
                  onCopy?.(sqlName(source.key));
                }}
              >
                <span className="truncate">{source.title}</span>
                <code>{sqlName(source.key)}</code>
              </button>
              {open === source.key ? (
                <ul className="rb-srccols">
                  {source.columns.map((column) => (
                    <li key={column.key}>
                      <button type="button" className="rb-src" onClick={() => onCopy?.(sqlName(column.key))} title={`Copy ${sqlName(column.key)}`}>
                        <span className="truncate">{column.label}</span>
                        <code>{sqlName(column.key)}</code>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </nav>
  );
}
