import type { Measure } from "@/lib/reports/layout";
import type { ReportColumn, ReportRow } from "@/lib/reports/types";
import { aggregate } from "@/lib/reports/view";

/**
 * Charts, as data and as SVG.
 *
 * Pure strings, so the page and the PDF draw the same picture: the screen
 * passes its CSS variables as colours, the PDF passes the tenant's brand hex.
 * Two forms only, one series each — bars to compare groups, a line to follow a
 * date — which is what a report's figures ask for. One hue, no legend (the
 * title names the series), values only where they are read: at a bar's tip and
 * at the line's end. Every mark carries its label and value for the hover.
 */

export type ChartPoint = { label: string; value: number | null };

/* ──────────────────────────────────────────────────────────────────────────
   The numbers
   ────────────────────────────────────────────────────────────────────────── */

function measureOf(rows: ReportRow[], measure: Measure | undefined, columns: ReportColumn[]): number | null {
  if (!measure) return rows.length;
  const column = columns.find((candidate) => candidate.key === measure.column);
  if (!column) return rows.length;
  const value = aggregate(rows, column, measure.fn);
  return typeof value === "number" ? value : null;
}

/**
 * One bar per group, largest first; past `limit`, the rest fold into one
 * "Other" bar measured over its own rows — an average of averages is not the
 * average, and a ninth colour is never the answer.
 */
export function seriesBy(
  rows: ReportRow[],
  by: ReportColumn,
  measure: Measure | undefined,
  columns: ReportColumn[],
  limit: number,
  name: (value: ReportRow[string]) => string,
): ChartPoint[] {
  const groups = new Map<string, { label: string; rows: ReportRow[] }>();
  for (const row of rows) {
    const value = row[by.key];
    const label = value === null || value === undefined || value === "" ? "None" : name(value);
    const group = groups.get(label) ?? { label, rows: [] };
    group.rows.push(row);
    groups.set(label, group);
  }
  const points = [...groups.values()]
    .map((group) => ({ ...group, value: measureOf(group.rows, measure, columns) }))
    .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  if (points.length <= limit) return points.map(({ label, value }) => ({ label, value }));
  const kept = points.slice(0, limit - 1);
  const rest = points.slice(limit - 1);
  return [
    ...kept.map(({ label, value }) => ({ label, value })),
    { label: `Other (${rest.length})`, value: measureOf(rest.flatMap((group) => group.rows), measure, columns) },
  ];
}

export type Bucket = "day" | "week" | "month";

const DAY = 86_400_000;

/** Days for a short span, weeks for a season, months for anything longer. */
export function bucketFor(from: string, to: string): Bucket {
  const span = (Date.parse(to) - Date.parse(from)) / DAY;
  if (span <= 45) return "day";
  if (span <= 190) return "week";
  return "month";
}

function bucketStart(iso: string, bucket: Bucket): string {
  if (bucket === "day") return iso.slice(0, 10);
  if (bucket === "month") return `${iso.slice(0, 7)}-01`;
  // Weeks start on Monday.
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - offset * DAY).toISOString().slice(0, 10);
}

function nextBucket(iso: string, bucket: Bucket): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (bucket === "day") return new Date(date.getTime() + DAY).toISOString().slice(0, 10);
  if (bucket === "week") return new Date(date.getTime() + 7 * DAY).toISOString().slice(0, 10);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function bucketLabel(iso: string, bucket: Bucket): string {
  const month = MONTHS[Number(iso.slice(5, 7)) - 1];
  if (bucket === "month") return `${month} ${iso.slice(0, 4)}`;
  return `${Number(iso.slice(8, 10))} ${month}`;
}

/**
 * The measure per day, week or month across the dates present. Empty buckets
 * in between are drawn — as nothing for a total or a count, as a gap for an
 * average — so a quiet week reads as quiet rather than being skipped.
 */
export function timeSeries(
  rows: ReportRow[],
  by: ReportColumn,
  measure: Measure | undefined,
  columns: ReportColumn[],
  range?: { from?: string; to?: string },
): { points: ChartPoint[]; bucket: Bucket } {
  const dated = rows.filter((row) => typeof row[by.key] === "string" && /^\d{4}-\d{2}-\d{2}/.test(row[by.key] as string));
  if (dated.length === 0) return { points: [], bucket: "day" };
  const days = dated.map((row) => (row[by.key] as string).slice(0, 10)).sort();
  const from = range?.from && range.from <= days[0]! ? range.from : days[0]!;
  const to = range?.to && range.to >= days[days.length - 1]! ? range.to : days[days.length - 1]!;
  const bucket = bucketFor(from, to);

  const byBucket = new Map<string, ReportRow[]>();
  for (const row of dated) {
    const key = bucketStart(row[by.key] as string, bucket);
    byBucket.set(key, [...(byBucket.get(key) ?? []), row]);
  }
  const additive = !measure || measure.fn === "sum" || measure.fn === "count";
  const points: ChartPoint[] = [];
  const last = bucketStart(to, bucket);
  for (let key = bucketStart(from, bucket); key <= last; key = nextBucket(key, bucket)) {
    const inBucket = byBucket.get(key);
    points.push({
      label: bucketLabel(key, bucket),
      value: inBucket ? measureOf(inBucket, measure, columns) : additive ? 0 : null,
    });
    // A safety stop: a report does not need more than a few years of days.
    if (points.length > 800) break;
  }
  return { points, bucket };
}

/* ──────────────────────────────────────────────────────────────────────────
   The pictures
   ────────────────────────────────────────────────────────────────────────── */

export type ChartColors = {
  /** The one series colour. */
  mark: string;
  /** Hairlines: the grid and the baseline. */
  grid: string;
  /** Values and labels. Text never wears the mark's colour. */
  text: string;
  muted: string;
  /** The page behind the chart, for the ring round the end marker. */
  surface: string;
};

function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Roughly how wide a label is, for truncating before it collides. */
function textWidth(text: string, size: number): number {
  return text.length * size * 0.56;
}

function fit(text: string, width: number, size: number): string {
  if (textWidth(text, size) <= width) return text;
  const chars = Math.max(1, Math.floor(width / (size * 0.56)) - 1);
  return `${text.slice(0, chars)}…`;
}

/** Clean axis steps: 1, 2 or 5 times a power of ten. */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0];
  const raw = max / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * power).find((candidate) => candidate >= raw) ?? raw;
  const ticks: number[] = [];
  for (let value = 0; value <= max + step * 0.001; value += step) ticks.push(Number(value.toFixed(10)));
  if (ticks[ticks.length - 1]! < max) ticks.push(Number((ticks[ticks.length - 1]! + step).toFixed(10)));
  return ticks;
}

/** A compact figure for an axis tick: 12,500 → 12.5K. */
export function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M`;
  if (abs >= 10_000) return `${Number((value / 1_000).toFixed(1))}K`;
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

const BAR = 18;
const BAR_ROW = 30;
const RADIUS = 4;

/**
 * Horizontal bars, largest at the top: long labels read across rather than
 * slanting under columns. Each bar grows from one baseline with a rounded
 * data end and a square foot, and carries its value at the tip.
 */
export function barsSvg(
  points: ChartPoint[],
  { width, colors, format }: { width: number; colors: ChartColors; format: (value: number) => string },
): string {
  const size = 11;
  const labelWidth = Math.min(width * 0.34, Math.max(...points.map((point) => textWidth(point.label, size)), 40) + 8);
  const valueWidth = Math.max(...points.map((point) => textWidth(point.value === null ? "—" : format(point.value), size)), 24) + 10;
  const plot = Math.max(40, width - labelWidth - valueWidth);
  const max = Math.max(0, ...points.map((point) => point.value ?? 0));
  const height = points.length * BAR_ROW + 4;

  const rows = points
    .map((point, index) => {
      const y = index * BAR_ROW + 2;
      const cy = y + BAR_ROW / 2;
      const value = point.value ?? 0;
      const length = max > 0 ? Math.max(0, (value / max) * plot) : 0;
      const r = Math.min(RADIUS, length / 2, BAR / 2);
      const x0 = labelWidth;
      const top = cy - BAR / 2;
      // Square at the baseline, rounded at the data end.
      const bar =
        length > 0
          ? `<path d="M${x0},${top} h${length - r} a${r},${r} 0 0 1 ${r},${r} v${BAR - 2 * r} a${r},${r} 0 0 1 ${-r},${r} h${-(length - r)} z" fill="${colors.mark}"/>`
          : "";
      const shown = point.value === null ? "—" : format(point.value);
      return `<g class="chart-mark" data-label="${xml(point.label)}" data-value="${xml(shown)}">
  <rect x="0" y="${y}" width="${width}" height="${BAR_ROW}" fill="transparent"/>
  <text x="${labelWidth - 8}" y="${cy}" dy="0.35em" text-anchor="end" font-size="${size}" fill="${colors.text}">${xml(fit(point.label, labelWidth - 8, size))}</text>
  ${bar}
  <text x="${x0 + length + 6}" y="${cy}" dy="0.35em" font-size="${size}" fill="${colors.muted}" style="font-variant-numeric:tabular-nums">${xml(shown)}</text>
</g>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" role="img" style="display:block;max-width:${width}px">
  <line x1="${labelWidth}" x2="${labelWidth}" y1="0" y2="${height}" stroke="${colors.grid}" stroke-width="1"/>
  ${rows}
</svg>`;
}

/**
 * A single line over time with a light wash under it, hairline gridlines at
 * clean steps, and the latest value labelled at the end — the one number the
 * line is read for.
 */
export function trendSvg(
  points: ChartPoint[],
  { width, height = 200, colors, format }: { width: number; height?: number; colors: ChartColors; format: (value: number) => string },
): string {
  const size = 11;
  const values = points.map((point) => point.value).filter((value): value is number => value !== null);
  const ticks = niceTicks(Math.max(0, ...values));
  const top = ticks[ticks.length - 1] || 1;
  const left = Math.max(...ticks.map((tick) => textWidth(compact(tick), size))) + 10;
  const last = [...points].reverse().find((point) => point.value !== null);
  const right = last ? textWidth(format(last.value!), size) + 14 : 10;
  const bottom = 22;
  const plotW = Math.max(40, width - left - right);
  const plotH = height - bottom - 8;
  const x = (index: number) => left + (points.length <= 1 ? plotW / 2 : (index / (points.length - 1)) * plotW);
  const y = (value: number) => 8 + plotH - (value / top) * plotH;

  const grid = ticks
    .map(
      (tick) =>
        `<line x1="${left}" x2="${left + plotW}" y1="${y(tick)}" y2="${y(tick)}" stroke="${colors.grid}" stroke-width="1"/><text x="${left - 8}" y="${y(tick)}" dy="0.35em" text-anchor="end" font-size="${size}" fill="${colors.muted}" style="font-variant-numeric:tabular-nums">${xml(compact(tick))}</text>`,
    )
    .join("");

  // Segments break at gaps rather than drawing through a missing average.
  const segments: Array<Array<[number, number]>> = [];
  let current: Array<[number, number]> = [];
  points.forEach((point, index) => {
    if (point.value === null) {
      if (current.length) segments.push(current);
      current = [];
    } else current.push([x(index), y(point.value)]);
  });
  if (current.length) segments.push(current);

  const line = segments
    .map((segment) => {
      const d = segment.map(([px, py], index) => `${index ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
      const base = y(0).toFixed(1);
      const area = `${d} L${segment[segment.length - 1]![0].toFixed(1)},${base} L${segment[0]![0].toFixed(1)},${base} Z`;
      return `<path d="${area}" fill="${colors.mark}" fill-opacity="0.1"/><path d="${d}" fill="none" stroke="${colors.mark}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    })
    .join("");

  // A few dates along the foot: the first, the last, and evenly between.
  const every = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(plotW / 70))));
  // The last date is always shown; a regular one too close to it gives way
  // rather than printing over it.
  const labels = points
    .map((point, index) =>
      (index % every === 0 && (index === points.length - 1 || points.length - 1 - index >= every * 0.75)) ||
      index === points.length - 1
        ? `<text x="${x(index)}" y="${height - 6}" text-anchor="${index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}" font-size="${size}" fill="${colors.muted}">${xml(point.label)}</text>`
        : "",
    )
    .join("");

  const hits = points
    .map((point, index) => {
      const w = points.length <= 1 ? plotW : plotW / (points.length - 1);
      return `<rect class="chart-mark" data-label="${xml(point.label)}" data-value="${xml(point.value === null ? "—" : format(point.value))}" x="${x(index) - w / 2}" y="0" width="${w}" height="${height - bottom}" fill="transparent"/>`;
    })
    .join("");

  const lastIndex = last ? points.lastIndexOf(last) : -1;
  const end = last
    ? `<circle cx="${x(lastIndex)}" cy="${y(last.value!)}" r="4" fill="${colors.mark}" stroke="${colors.surface}" stroke-width="2"/><text x="${x(lastIndex) + 8}" y="${y(last.value!)}" dy="0.35em" font-size="${size}" font-weight="600" fill="${colors.text}" style="font-variant-numeric:tabular-nums">${xml(format(last.value!))}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" role="img" style="display:block;max-width:${width}px">
  ${grid}${line}${labels}${end}${hits}
</svg>`;
}
