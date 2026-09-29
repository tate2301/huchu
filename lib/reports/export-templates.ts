import { esc } from "@/lib/documents/html-renderer";
import type { DocumentMeta } from "@/lib/documents/types";
import { describeCondition, formatDate, formatTotal, formatValue, totalCaption } from "@/lib/reports/format";
import type { Aggregate, ReportColumn, ReportMeta, ReportParams, ReportRow, ReportValue, ReportView } from "@/lib/reports/types";
import {
  EXPORT_TEMPLATE_LABELS,
  type ExportTemplateId,
} from "@/lib/reports/export-layouts";
import { applyView, isNumeric, totalsFor, type AppliedView } from "@/lib/reports/view";

export { EXPORT_TEMPLATE_LABELS, EXPORT_TEMPLATE_ORIENTATION, EXPORT_TEMPLATES } from "@/lib/reports/export-layouts";
export type { ExportTemplateId } from "@/lib/reports/export-layouts";

/**
 * The ways a report can be printed.
 *
 * Every template reads the same applied view — the rows somebody filtered,
 * sorted and grouped on screen — and differs only in what it draws from it: all
 * of it, the totals by group, a pack for a meeting, or a sheet per record. They
 * print on the tenant's own paper (`renderDocumentShell`), so a report looks
 * like the same company's invoice, not like a screenshot of a web page.
 */

/** Beyond this many rows a sheet per record is a ream of paper, not a report. */
export const MAX_SHEETS = 300;

export type ExportInput = {
  meta: ReportMeta;
  params: ReportParams;
  /** Every row the view keeps, before any limit — the file is the whole view. */
  applied: AppliedView;
  view: ReportView;
  /** True when only selected rows were sent. */
  selected: boolean;
  /** When the file was made, for the header. */
  generatedAt: Date;
};

export type ExportDocument = {
  title: string;
  subtitle: string | null;
  stamp: DocumentMeta[];
  content: string;
  css: string;
};

/* ──────────────────────────────────────────────────────────────────────────
   What every template agrees on
   ────────────────────────────────────────────────────────────────────────── */

export function period(meta: ReportMeta, params: ReportParams): string | null {
  const from = meta.params.find((param) => param.type === "date" && param.key === "from");
  const to = meta.params.find((param) => param.type === "date" && param.key === "to");
  if (!from && !to) return null;
  const start = params.from ? formatDate(params.from) : null;
  const end = params.to ? formatDate(params.to) : null;
  if (start && end) return `${start} – ${end}`;
  if (start) return `From ${start}`;
  if (end) return `Up to ${end}`;
  return "Any time";
}

/** The choices the rows were narrowed by, as the reader would say them. */
function choices(meta: ReportMeta, params: ReportParams): string[] {
  return meta.params.flatMap((param) => {
    if (param.type !== "choice") return [];
    const option = param.options.find((candidate) => candidate.value === params[param.key]);
    return option && option !== param.options[0] ? [`${param.label}: ${option.label}`] : [];
  });
}

/** What narrowed the rows, in one line each — so paper says what it is a picture of. */
export function narrowing(input: ExportInput): string[] {
  const byKey = new Map(input.meta.columns.map((column) => [column.key, column]));
  return [
    ...choices(input.meta, input.params),
    ...input.view.conditions.flatMap((condition) => {
      const column = byKey.get(condition.column);
      return column ? [describeCondition(condition, column)] : [];
    }),
    ...(input.view.search ? [`Search: “${input.view.search}”`] : []),
    ...(input.selected ? ["Selected rows only"] : []),
  ];
}

function stampFor(input: ExportInput): DocumentMeta[] {
  const day = input.generatedAt.toISOString().slice(0, 10);
  return [{ label: "Generated", value: formatDate(day) }];
}

/** The column a summary is broken down by: the view's grouping, else its first state. */
export function breakdownColumn(input: Pick<ExportInput, "meta" | "view">): ReportColumn | null {
  const byKey = new Map(input.meta.columns.map((column) => [column.key, column]));
  if (input.view.groupBy && byKey.has(input.view.groupBy)) return byKey.get(input.view.groupBy)!;
  return (
    input.meta.columns.find((column) => column.kind === "status" && !column.hidden) ??
    input.meta.columns.find((column) => (column.kind === "text" || column.kind === "relation") && !column.hidden) ??
    null
  );
}

/** The figure a report is about: its first summed money, else its first summed number. */
export function leadFigure(input: Pick<ExportInput, "meta" | "view">): ReportColumn | null {
  const byKey = new Map(input.meta.columns.map((column) => [column.key, column]));
  const summed = Object.entries(input.view.totals)
    .filter(([, fn]) => fn === "sum")
    .map(([key]) => byKey.get(key))
    .filter((column): column is ReportColumn => Boolean(column));
  return summed.find((column) => column.kind === "money") ?? summed.find((column) => isNumeric(column.kind)) ?? null;
}

function totalColumns(input: ExportInput): Array<{ column: ReportColumn; fn: Aggregate }> {
  const byKey = new Map(input.meta.columns.map((column) => [column.key, column]));
  return Object.entries(input.view.totals)
    .map(([key, fn]) => ({ column: byKey.get(key)!, fn }))
    .filter((entry) => Boolean(entry.column));
}

/** A reference this long may break at its hyphens rather than push the table off the page. */
const LONG_REFERENCE = 14;

function cellClass(column: ReportColumn, value?: ReportValue): string {
  const figure = isNumeric(column.kind);
  const mono = figure || column.kind === "date" || column.kind === "code" || column.kind === "phone";
  // A date or a figure broken over two lines is two wrong values; so is a
  // short reference. A long one breaks at its hyphens, or it prints off the page.
  const keep = mono && !(column.kind === "code" && String(value ?? "").length > LONG_REFERENCE);
  return `${figure ? "align-right" : "align-left"}${mono ? " mono" : ""}${keep ? " rp-keep" : ""}`;
}

function groupName(value: ReportValue, column: ReportColumn | null): string {
  if (value === null || value === undefined || value === "") return "None";
  return column ? formatValue(value, column) : String(value);
}

/** Headline figures: how many rows, then every total the view asks for. */
function keyFigures(input: ExportInput): string {
  const figures = [
    { label: "Rows", value: input.applied.rows.length.toLocaleString("en-US") },
    ...totalColumns(input)
      // A figure with nothing behind it — an average of no assays — is left
      // out rather than printed as a dash in a box.
      .filter(({ column }) => {
        const value = input.applied.totals[column.key];
        return value !== null && value !== undefined;
      })
      .map(({ column, fn }) => ({
        label: `${column.label} · ${totalCaption(fn).toLowerCase()}`,
        value: formatTotal(input.applied.totals[column.key], column, fn),
      })),
  ];
  return `<section class="rp-figures">${figures
    .map(
      (figure) =>
        `<div class="rp-figure"><div class="rp-figure-label">${esc(figure.label)}</div><div class="rp-figure-value mono">${esc(figure.value)}</div></div>`,
    )
    .join("")}</section>`;
}

function narrowingBlock(input: ExportInput): string {
  const lines = narrowing(input);
  if (lines.length === 0) return "";
  return `<section class="rp-narrowing"><span class="rp-caption">Showing</span>${lines
    .map((line) => `<span class="rp-chip">${esc(line)}</span>`)
    .join("")}</section>`;
}

function heading(text: string, count?: number): string {
  return `<h2 class="rp-heading">${esc(text)}${
    count === undefined ? "" : ` <span class="rp-count mono">${count.toLocaleString("en-US")}</span>`
  }</h2>`;
}

/* ──────────────────────────────────────────────────────────────────────────
   Register: every row
   ────────────────────────────────────────────────────────────────────────── */

function registerTable(input: ExportInput, rowsLimit?: number): string {
  const { applied, view } = input;
  const columns = applied.columns;
  const grouped = view.groupBy ? input.meta.columns.find((column) => column.key === view.groupBy) ?? null : null;
  const hasTotals = Object.keys(view.totals).length > 0;

  const head = `<thead><tr>${columns
    .map((column) => `<th class="${isNumeric(column.kind) ? "align-right" : "align-left"}">${esc(column.label)}</th>`)
    .join("")}</tr></thead>`;

  const row = (entry: ReportRow) =>
    `<tr>${columns.map((column) => `<td class="${cellClass(column, entry[column.key])}">${esc(formatValue(entry[column.key], column))}</td>`).join("")}</tr>`;

  const totalRow = (totals: AppliedView["totals"], caption: string, className: string) =>
    `<tr class="${className}">${columns
      .map((column, index) => {
        const fn = view.totals[column.key];
        if (fn) return `<td class="${cellClass(column)}">${esc(formatTotal(totals[column.key], column, fn))}</td>`;
        return `<td>${index === 0 ? esc(caption) : ""}</td>`;
      })
      .join("")}</tr>`;

  let left = rowsLimit ?? Number.POSITIVE_INFINITY;
  const take = (rows: ReportRow[]) => {
    const slice = rows.slice(0, Math.max(0, left));
    left -= slice.length;
    return slice;
  };

  const body = applied.groups
    ? applied.groups
        .map((group) => {
          const name = groupName(group.value, grouped);
          return [
            `<tr class="rp-group"><td colspan="${columns.length}">${esc(name)} <span class="rp-count mono">${group.rows.length}</span></td></tr>`,
            ...take(group.rows).map(row),
            hasTotals ? totalRow(group.totals, `${name} total`, "rp-subtotal") : "",
          ].join("");
        })
        .join("")
    : take(applied.rows).map(row).join("");

  const foot = hasTotals ? `<tfoot>${totalRow(applied.totals, "Total", "rp-total")}</tfoot>` : "";
  return `<table class="rp-table">${head}<tbody>${body}</tbody>${foot}</table>`;
}

function register(input: ExportInput): string {
  return [narrowingBlock(input), registerTable(input)].join("");
}

/* ──────────────────────────────────────────────────────────────────────────
   Summary: the totals by group
   ────────────────────────────────────────────────────────────────────────── */

export type BreakdownLine = { name: string; count: number; totals: Record<string, ReportValue> };
type Line = BreakdownLine;

export function breakdown(input: ExportInput, by: ReportColumn, cap?: number): Line[] {
  // Regrouped here rather than read off the screen's grouping: a summary is
  // by something even when the table was not grouped.
  const regrouped = applyView(input.applied.rows, input.meta.columns, {
    ...input.view,
    conditions: [],
    search: "",
    groupBy: by.key,
  });
  const figure = leadFigure(input);
  const lines: Line[] = (regrouped.groups ?? []).map((group) => ({
    name: groupName(group.value, by),
    count: group.rows.length,
    totals: group.totals,
  }));
  // Largest first by the figure the report is about, else by how many rows.
  lines.sort((a, b) =>
    figure
      ? Number(b.totals[figure.key] ?? 0) - Number(a.totals[figure.key] ?? 0)
      : b.count - a.count,
  );
  if (!cap || lines.length <= cap) return lines;
  // The tail folded into one line, totalled from its rows rather than added up
  // from its lines — an average of averages is not the average.
  const kept = lines.slice(0, cap - 1);
  const keptNames = new Set(kept.map((line) => line.name));
  const rest = (regrouped.groups ?? []).filter((group) => !keptNames.has(groupName(group.value, by)));
  const restRows = rest.flatMap((group) => group.rows);
  return [
    ...kept,
    {
      name: `${rest.length} others`,
      count: restRows.length,
      totals: totalsFor(restRows, input.meta.columns, input.view),
    },
  ];
}

function breakdownTable(input: ExportInput, by: ReportColumn, cap?: number): string {
  const lines = breakdown(input, by, cap);
  const totals = totalColumns(input);
  const figure = leadFigure(input);
  const whole = figure ? Number(input.applied.totals[figure.key] ?? 0) : input.applied.rows.length;

  const head = `<thead><tr><th class="align-left">${esc(by.label)}</th><th class="align-right">Rows</th>${totals
    .map(({ column, fn }) => `<th class="align-right">${esc(column.label)}${fn === "sum" ? "" : ` · ${esc(totalCaption(fn).toLowerCase())}`}</th>`)
    .join("")}<th class="align-left rp-share-head">Share</th></tr></thead>`;

  const body = lines
    .map((line) => {
      const part = figure ? Number(line.totals[figure.key] ?? 0) : line.count;
      const share = whole > 0 ? Math.max(0, Math.min(1, part / whole)) : 0;
      return `<tr><td class="align-left rp-name">${esc(line.name)}</td><td class="align-right mono">${line.count.toLocaleString("en-US")}</td>${totals
        .map(({ column, fn }) => `<td class="align-right mono">${esc(formatTotal(line.totals[column.key], column, fn))}</td>`)
        .join("")}<td class="rp-share"><span class="rp-bar"><span style="width:${(share * 100).toFixed(1)}%"></span></span><span class="mono">${(share * 100).toFixed(1)}%</span></td></tr>`;
    })
    .join("");

  const foot = `<tfoot><tr class="rp-total"><td>Total</td><td class="align-right mono">${input.applied.rows.length.toLocaleString("en-US")}</td>${totals
    .map(({ column, fn }) => `<td class="align-right mono">${esc(formatTotal(input.applied.totals[column.key], column, fn))}</td>`)
    .join("")}<td></td></tr></tfoot>`;

  return `<table class="rp-table rp-breakdown">${head}<tbody>${body}</tbody>${foot}</table>`;
}

function summary(input: ExportInput): string {
  const by = breakdownColumn(input);
  return [
    keyFigures(input),
    narrowingBlock(input),
    by ? heading(`By ${by.label.toLowerCase()}`) + breakdownTable(input, by) : registerTable(input),
  ].join("");
}

/* ──────────────────────────────────────────────────────────────────────────
   Management pack: the figures, the breakdown, the largest, then everything
   ────────────────────────────────────────────────────────────────────────── */

/** Groups a pack shows before folding the rest into one line. */
const PACK_GROUPS = 12;
/** Rows in the "largest" list. */
const PACK_LARGEST = 10;

function pack(input: ExportInput): string {
  const by = breakdownColumn(input);
  const figure = leadFigure(input);
  const sections = [keyFigures(input), narrowingBlock(input)];

  if (by) sections.push(heading(`By ${by.label.toLowerCase()}`) + breakdownTable(input, by, PACK_GROUPS));

  if (figure) {
    const largest = [...input.applied.rows]
      .sort((a, b) => Number(b[figure.key] ?? 0) - Number(a[figure.key] ?? 0))
      .slice(0, PACK_LARGEST);
    const columns = input.applied.columns;
    sections.push(
      heading(`Largest by ${figure.label.toLowerCase()}`) +
        `<table class="rp-table"><thead><tr>${columns
          .map((column) => `<th class="${isNumeric(column.kind) ? "align-right" : "align-left"}">${esc(column.label)}</th>`)
          .join("")}</tr></thead><tbody>${largest
          .map(
            (row) =>
              `<tr>${columns.map((column) => `<td class="${cellClass(column, row[column.key])}">${esc(formatValue(row[column.key], column))}</td>`).join("")}</tr>`,
          )
          .join("")}</tbody></table>`,
    );
  }

  sections.push(
    `<div class="rp-break"></div>${heading("Every row", input.applied.rows.length)}${registerTable(input)}`,
  );
  return sections.join("");
}

/* ──────────────────────────────────────────────────────────────────────────
   Record sheets: one block per row, every field
   ────────────────────────────────────────────────────────────────────────── */

function sheets(input: ExportInput): string {
  const { meta, applied } = input;
  const shown = applied.columns;
  // Every field the report has, not only the ones on screen: a sheet is the
  // record on paper, and a column hidden to keep the table narrow still
  // belongs on it. Shown columns first, in the view's order.
  const hidden = meta.columns.filter((column) => !shown.some((candidate) => candidate.key === column.key));
  const fields = [...shown, ...hidden];
  // A sheet is headed by what the report leads with — the bar, the pupil —
  // unless that is a reference number followed by a name, as a lead's or a
  // deal's is, in which case the name heads it and the number sits opposite.
  const [first, second] = shown.length ? shown : fields;
  const namedAfter = first!.kind === "code" && second && (second.kind === "text" || second.kind === "relation");
  const title = namedAfter ? second : first!;
  const reference = namedAfter ? first : undefined;
  const rows = (applied.groups ? applied.groups.flatMap((group) => group.rows) : applied.rows).slice(0, MAX_SHEETS);

  const sheet = (row: ReportRow) => {
    const pairs = fields
      .filter((column) => column.key !== title.key && column.key !== reference?.key)
      .map(
        (column) =>
          `<div class="rp-pair"><div class="rp-pair-label">${esc(column.label)}</div><div class="rp-pair-value ${cellClass(column).includes("mono") ? "mono" : ""}">${esc(formatValue(row[column.key], column))}</div></div>`,
      )
      .join("");
    return `<article class="rp-sheet"><header class="rp-sheet-head"><div class="rp-sheet-title">${esc(
      formatValue(row[title.key], title),
    )}</div>${reference ? `<div class="rp-sheet-ref mono">${esc(formatValue(row[reference.key], reference))}</div>` : ""}</header><div class="rp-pairs">${pairs}</div></article>`;
  };

  const over = applied.rows.length > MAX_SHEETS
    ? `<p class="rp-note">The first ${MAX_SHEETS} of ${applied.rows.length.toLocaleString("en-US")} rows. Narrow the report to print the rest.</p>`
    : "";
  return [narrowingBlock(input), over, rows.map(sheet).join("")].join("");
}

/* ──────────────────────────────────────────────────────────────────────────
   The stylesheet all four share, under the shell's own tokens
   ────────────────────────────────────────────────────────────────────────── */

const REPORT_CSS = `
  .rp-heading { margin: 28px 0 0; font-size: 12.5px; font-weight: 700; color: var(--ink); break-after: avoid; }
  .rp-count { font-size: 10px; font-weight: 500; color: var(--ink-muted); }
  .rp-caption { font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-muted); font-weight: 700; margin-right: 4px; }
  .rp-narrowing { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 18px; }
  .rp-chip { border: 1px solid var(--rule); border-radius: 999px; padding: 1px 9px; font-size: 10px; color: var(--ink-soft); }
  .rp-note { margin: 14px 0 0; font-size: 10px; color: var(--ink-muted); }

  .rp-figures { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 0 24px; margin-top: 24px; }
  .rp-figure { border-top: 2px solid var(--accent); padding: 8px 0 4px; break-inside: avoid; }
  .rp-figure-label { font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-muted); font-weight: 700; }
  .rp-figure-value { margin-top: 3px; font-size: 17px; font-weight: 600; color: var(--ink); letter-spacing: -0.01em; }

  table.rp-table { margin-top: 12px; font-size: 10px; }
  table.rp-table th { padding: 0 8px 7px; }
  table.rp-table td { padding: 5px 8px; }
  table.rp-table th:first-child, table.rp-table td:first-child { padding-left: 0; }
  table.rp-table th:last-child, table.rp-table td:last-child { padding-right: 0; }
  table.rp-table thead { display: table-header-group; }
  table.rp-table tr { break-inside: avoid; }
  tr.rp-group td { padding-top: 14px; font-weight: 700; color: var(--ink); border-bottom: 1px solid var(--ink-muted); }
  tr.rp-subtotal td { font-weight: 600; color: var(--ink); background: var(--accent-wash); }
  tr.rp-total td { font-weight: 700; color: var(--ink); border-top: 2px solid var(--ink); border-bottom: 0; padding-top: 7px; }
  .rp-name { color: var(--ink); font-weight: 500; }
  .rp-keep { white-space: nowrap; }
  .rp-share-head { width: 150px; }
  td.rp-share { white-space: nowrap; }
  .rp-bar { display: inline-block; vertical-align: middle; width: 90px; height: 6px; margin-right: 8px; background: var(--rule); border-radius: 3px; overflow: hidden; }
  .rp-bar span { display: block; height: 100%; background: var(--accent); }
  .rp-break { break-before: page; }

  .rp-sheet { margin-top: 16px; padding: 12px 0 4px; border-top: 1px solid var(--ink); break-inside: avoid; }
  .rp-sheet-head { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; }
  .rp-sheet-title { font-size: 12.5px; font-weight: 700; color: var(--ink); }
  .rp-sheet-ref { font-size: 10px; color: var(--ink-muted); }
  .rp-pairs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px 32px; margin-top: 8px; }
  .rp-pair { display: grid; grid-template-columns: 120px 1fr; gap: 10px; padding: 3px 0; border-bottom: 1px solid var(--rule); }
  .rp-pair-label { color: var(--ink-muted); }
  .rp-pair-value { color: var(--ink); font-weight: 500; overflow-wrap: anywhere; }
`;

const RENDERERS: Record<ExportTemplateId, (input: ExportInput) => string> = {
  register,
  summary,
  pack,
  sheets,
};

export function exportDocument(template: ExportTemplateId, input: ExportInput): ExportDocument {
  const when = period(input.meta, input.params);
  return {
    title: template === "register" || template === "sheets" ? input.meta.title : `${input.meta.title} · ${EXPORT_TEMPLATE_LABELS[template].toLowerCase()}`,
    subtitle: when,
    stamp: stampFor(input),
    content: RENDERERS[template](input),
    css: REPORT_CSS,
  };
}
