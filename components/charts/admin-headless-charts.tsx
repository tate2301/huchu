"use client";

import { type ReactNode, useMemo, useState } from "react";
import { localPoint } from "@visx/event";
import { ParentSize } from "@visx/responsive";
import { scaleBand, scaleLinear } from "@visx/scale";
import { AreaClosed, Bar, LinePath, Pie } from "@visx/shape";
import { curveMonotoneX } from "@visx/curve";

export type ChartTone = "default" | "warning" | "danger" | "success";

export type DistributionRow = {
  id: string;
  label: string;
  value: number;
  secondary?: string;
  tone?: ChartTone;
  color?: string;
};

export type TrendChartRow = {
  label: string;
  tooltipLabel?: string;
  [key: string]: string | number | undefined;
};

export type AdminChartSeries = {
  key: string;
  label: string;
  color?: string;
  kind?: "line" | "area" | "bar" | "stacked-area" | "stacked-bar" | "waterfall";
  tone?: ChartTone;
  axis?: "left" | "right";
  dashed?: boolean;
  hiddenByDefault?: boolean;
  strokeWidth?: number;
  fillOpacity?: number;
};

export type WaterfallRow = {
  id: string;
  label: string;
  value: number;
  color?: string;
  tone?: ChartTone;
};

export type AdminChartTarget = {
  value: number;
  label: string;
  color?: string;
};

export type AdminChartAnnotation = {
  label: string;
  rowLabel: string;
  seriesKey?: string;
  value?: number;
  color?: string;
  tone?: ChartTone;
};

type TooltipItem = {
  key: string;
  label: string;
  color: string;
  value: number;
};

type TooltipState = {
  x: number;
  y: number;
  label: string;
  items: TooltipItem[];
};

type ChartFrameProps = {
  hasData: boolean;
  height?: number;
  emptyLabel?: string;
  legend?: ReactNode;
  children: (size: { width: number; height: number }) => ReactNode;
};

type BaseCartesianProps = {
  rows: TrendChartRow[];
  series: AdminChartSeries[];
  emptyLabel?: string;
  height?: number;
  xKey?: string;
  xTickFormatter?: (value: string) => string;
  yTickFormatter?: (value: number) => string;
  valueFormatter?: (value: number) => string;
  xTickInterval?: number | "preserveStartEnd";
  comparisonSeries?: AdminChartSeries[];
  target?: AdminChartTarget;
  annotations?: AdminChartAnnotation[];
};

type DistributionChartProps = {
  rows: DistributionRow[];
  emptyLabel?: string;
  height?: number;
  valueLabel?: string;
  valueFormatter?: (value: number) => string;
};

type DualSeriesRow = {
  id: string;
  label: string;
  primary: number;
  secondary: number;
};

type DualSeriesChartProps = {
  rows: DualSeriesRow[];
  emptyLabel?: string;
  height?: number;
  primaryLabel: string;
  secondaryLabel: string;
  primaryColor?: string;
  secondaryColor?: string;
  valueFormatter?: (value: number) => string;
};

type DonutChartProps = {
  rows: DistributionRow[];
  emptyLabel?: string;
  height?: number;
  valueLabel?: string;
  valueFormatter?: (value: number) => string;
};

type GroupedDistributionSection = {
  id: string;
  label: string;
  rows: DistributionRow[];
};

type GroupedDistributionChartProps = {
  sections: GroupedDistributionSection[];
  emptyLabel?: string;
  height?: number;
  valueLabel?: string;
  valueFormatter?: (value: number) => string;
};

const PALETTE = [
  "var(--primary-500)",
  "var(--accent-500)",
  "var(--info-500)",
  "var(--success-500)",
  "var(--warning-500)",
  "var(--danger-500)",
  "var(--neutral-500)",
];

const CARTESIAN_MARGIN = { top: 12, right: 16, bottom: 34, left: 52 };

function toneToColor(tone: ChartTone | undefined) {
  if (tone === "danger") return "var(--danger-500)";
  if (tone === "warning") return "var(--warning-500)";
  if (tone === "success") return "var(--success-500)";
  return "var(--primary-500)";
}

function formatValue(value: number) {
  return value.toLocaleString();
}

function seriesColor(series: AdminChartSeries, index: number) {
  return series.color ?? toneToColor(series.tone) ?? PALETTE[index % PALETTE.length];
}

function numeric(value: string | number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isBarKind(kind: AdminChartSeries["kind"] | undefined) {
  return kind === "bar";
}

function isLineOnlyKind(kind: AdminChartSeries["kind"] | undefined) {
  return kind === "line";
}

function seriesStrokeWidth(series: AdminChartSeries) {
  return series.strokeWidth ?? (isBarKind(series.kind) ? 0 : 2);
}

function tickIndices(total: number, interval: number | "preserveStartEnd" | undefined) {
  if (total <= 0) return new Set<number>();
  if (interval === 0) return new Set(Array.from({ length: total }, (_, index) => index));
  if (interval === "preserveStartEnd" || interval === undefined) {
    const step = Math.max(Math.ceil(total / 6), 1);
    const indices = new Set<number>();
    for (let index = 0; index < total; index += step) indices.add(index);
    indices.add(0);
    indices.add(total - 1);
    return indices;
  }
  const step = Math.max(interval + 1, 1);
  return new Set(Array.from({ length: total }, (_, index) => index).filter((index) => index % step === 0));
}

function ChartEmptyState({ emptyLabel }: { emptyLabel: string }) {
  return (
    <div className="rounded-2xl bg-[var(--surface-subtle)] px-4 py-8 text-sm text-[var(--text-muted)]">
      {emptyLabel}
    </div>
  );
}

export function AdminLegend({
  series,
  hiddenKeys,
  onToggle,
}: {
  series: Array<AdminChartSeries & { color: string }>;
  hiddenKeys?: Set<string>;
  onToggle?: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {series.map((item) => {
        const hidden = hiddenKeys?.has(item.key) ?? false;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onToggle?.(item.key)}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] px-2.5 py-1 text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-strong)]"
            aria-pressed={!hidden}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color, opacity: hidden ? 0.35 : 1 }} />
            <span className={hidden ? "opacity-50" : undefined}>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function AdminChartTooltip({
  label,
  items,
  valueFormatter = formatValue,
}: {
  label: string;
  items: TooltipItem[];
  valueFormatter?: (value: number) => string;
}) {
  return (
    <div className="min-w-[160px] rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-base)] px-3 py-2 shadow-[var(--shadow-popover)]">
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <div className="mt-2 space-y-1.5">
        {items.map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-4 text-xs">
            <span className="inline-flex min-w-0 items-center gap-2 text-[var(--text-muted)]">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="truncate">{item.label}</span>
            </span>
            <span className="font-mono text-[var(--text-strong)]">{valueFormatter(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminChartFrame({
  hasData,
  height = 240,
  emptyLabel = "No data",
  legend,
  children,
}: ChartFrameProps) {
  if (!hasData) return <ChartEmptyState emptyLabel={emptyLabel} />;

  return (
    <div className="space-y-3">
      <div className="relative w-full" style={{ height }}>
        <ParentSize>{({ width, height: measuredHeight }) => children({ width, height: measuredHeight || height })}</ParentSize>
      </div>
      {legend}
    </div>
  );
}

function useHiddenSeries(series: AdminChartSeries[]) {
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(
    () => new Set(series.filter((item) => item.hiddenByDefault).map((item) => item.key)),
  );

  function toggle(key: string) {
    setHiddenKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return { hiddenKeys, toggle };
}

function renderCartesianGrid(width: number, ticks: number[]) {
  return ticks.map((tick) => (
    <line
      key={tick}
      x1={0}
      x2={width}
      y1={tick}
      y2={tick}
      stroke="var(--edge-subtle)"
      strokeDasharray="4 6"
    />
  ));
}

function renderCartesianTicks({
  width,
  height,
  yScale,
  yTickFormatter,
  rows,
  xScale,
  xKey,
  xTickFormatter,
  xTickInterval,
}: {
  width: number;
  height: number;
  yScale: ReturnType<typeof scaleLinear<number>>;
  yTickFormatter?: (value: number) => string;
  rows: TrendChartRow[];
  xScale: ReturnType<typeof scaleBand<string>>;
  xKey: string;
  xTickFormatter?: (value: string) => string;
  xTickInterval?: number | "preserveStartEnd";
}) {
  const yTicks = yScale.ticks(4);
  const shownTicks = tickIndices(rows.length, xTickInterval);

  return (
    <>
      {renderCartesianGrid(width, yTicks.map((tick) => yScale(tick)))}
      {yTicks.map((tick) => (
        <g key={tick} transform={`translate(0, ${yScale(tick)})`}>
          <text
            x={-10}
            y={4}
            textAnchor="end"
            fontSize={11}
            fontFamily="var(--font-mono)"
            fill="var(--text-muted)"
          >
            {yTickFormatter ? yTickFormatter(tick) : formatValue(tick)}
          </text>
        </g>
      ))}
      {rows.map((row, index) => {
        if (!shownTicks.has(index)) return null;
        const rawLabel = String(row[xKey] ?? row.label);
        const bandX = xScale(rawLabel);
        if (bandX === undefined) return null;
        return (
          <text
            key={`${rawLabel}-${index}`}
            x={bandX + xScale.bandwidth() / 2}
            y={height + 22}
            textAnchor="middle"
            fontSize={11}
            fontFamily="var(--font-mono)"
            fill="var(--text-muted)"
          >
            {xTickFormatter ? xTickFormatter(rawLabel) : rawLabel}
          </text>
        );
      })}
    </>
  );
}

function CartesianChart({
  rows,
  series,
  emptyLabel = "No data",
  height = 240,
  xKey = "label",
  xTickFormatter,
  yTickFormatter,
  valueFormatter = formatValue,
  xTickInterval = "preserveStartEnd",
  comparisonSeries = [],
  target,
  annotations = [],
  stacked = false,
  bars = false,
}: BaseCartesianProps & { stacked?: boolean; bars?: boolean }) {
  const normalizedSeries = useMemo(
    () =>
      [...series, ...comparisonSeries.map((item) => ({ ...item, dashed: item.dashed ?? true }))]
        .map((item, index) => ({ ...item, color: seriesColor(item, index) })),
    [comparisonSeries, series],
  );
  const { hiddenKeys, toggle } = useHiddenSeries(normalizedSeries);
  const activeSeries = normalizedSeries.filter((item) => !hiddenKeys.has(item.key));
  const drawableSeries = activeSeries.length > 0 ? activeSeries : normalizedSeries;
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const hasData = rows.length > 0 && normalizedSeries.length > 0;

  return (
    <AdminChartFrame
      hasData={hasData}
      height={height}
      emptyLabel={emptyLabel}
      legend={<AdminLegend series={normalizedSeries} hiddenKeys={hiddenKeys} onToggle={toggle} />}
    >
      {({ width, height: frameHeight }) => {
        const svgWidth = Math.max(width, 280);
        const svgHeight = Math.max(frameHeight, 180);
        const innerWidth = Math.max(svgWidth - CARTESIAN_MARGIN.left - CARTESIAN_MARGIN.right, 120);
        const innerHeight = Math.max(svgHeight - CARTESIAN_MARGIN.top - CARTESIAN_MARGIN.bottom, 100);
        const labels = rows.map((row) => String(row[xKey] ?? row.label));
        const xScale = scaleBand<string>({ domain: labels, range: [0, innerWidth], padding: bars ? 0.28 : 0.2 });
        const barSeries = drawableSeries.filter((item) => bars || isBarKind(item.kind));
        const nonBarSeries = bars ? [] : drawableSeries.filter((item) => !isBarKind(item.kind));

        const yMax = Math.max(
          ...rows.map((row) => {
            if (stacked) {
              return drawableSeries.reduce((sum, item) => sum + numeric(row[item.key]), 0);
            }
            return Math.max(...drawableSeries.map((item) => numeric(row[item.key])), 0);
          }),
          target?.value ?? 0,
          ...annotations.map((item) => item.value ?? 0),
          1,
        );

        const yScale = scaleLinear<number>({ domain: [0, yMax * 1.1], range: [innerHeight, 0], nice: true });

        const stackedPoints = drawableSeries.map((item, seriesIndex) => ({
          ...item,
          points: rows.map((row) => {
            const value = numeric(row[item.key]);
            const start = drawableSeries
              .slice(0, seriesIndex)
              .reduce((sum, previousItem) => sum + numeric(row[previousItem.key]), 0);

            return {
              x: (xScale(String(row[xKey] ?? row.label)) ?? 0) + xScale.bandwidth() / 2,
              y0: start,
              y1: start + value,
              value,
            };
          }),
        }));

        const linePoints = drawableSeries.map((item) => ({
          ...item,
          points: rows.map((row) => ({
            x: (xScale(String(row[xKey] ?? row.label)) ?? 0) + xScale.bandwidth() / 2,
            value: numeric(row[item.key]),
          })),
        }));

        return (
          <div className="relative h-full w-full">
            <svg width={svgWidth} height={svgHeight} role="img" aria-label="Admin chart">
              <g transform={`translate(${CARTESIAN_MARGIN.left}, ${CARTESIAN_MARGIN.top})`}>
                {renderCartesianTicks({
                  width: innerWidth,
                  height: innerHeight,
                  yScale,
                  yTickFormatter,
                  rows,
                  xScale,
                  xKey,
                  xTickFormatter,
                  xTickInterval,
                })}

                {tooltip ? (
                  <line
                    x1={tooltip.x - CARTESIAN_MARGIN.left}
                    x2={tooltip.x - CARTESIAN_MARGIN.left}
                    y1={0}
                    y2={innerHeight}
                    stroke="var(--edge-default)"
                    strokeDasharray="3 4"
                  />
                ) : null}

                {target ? (
                  <g>
                    <line
                      x1={0}
                      x2={innerWidth}
                      y1={yScale(target.value)}
                      y2={yScale(target.value)}
                      stroke={target.color ?? "var(--accent-500)"}
                      strokeDasharray="5 5"
                    />
                    <text
                      x={innerWidth}
                      y={yScale(target.value) - 6}
                      textAnchor="end"
                      fontSize={10}
                      fontFamily="var(--font-mono)"
                      fill={target.color ?? "var(--accent-500)"}
                    >
                      {target.label}
                    </text>
                  </g>
                ) : null}

                {stacked
                  ? stackedPoints.map((item) => (
                      <g key={item.key}>
                        {!bars ? (
                          <AreaClosed
                            data={item.points}
                            x={(point) => point.x}
                            yScale={yScale}
                            y0={(point) => point.y0}
                            y1={(point) => point.y1}
                            fill={item.color}
                            fillOpacity={item.fillOpacity ?? 0.14}
                            curve={curveMonotoneX}
                          />
                        ) : null}
                        {!bars ? (
                          <LinePath
                            data={item.points}
                            x={(point) => point.x}
                            y={(point) => yScale(point.y1)}
                            stroke={item.color}
                            strokeWidth={item.strokeWidth ?? 2}
                            strokeDasharray={item.dashed ? "5 4" : undefined}
                            curve={curveMonotoneX}
                          />
                        ) : null}
                      </g>
                    ))
                  : linePoints
                      .filter((item) => nonBarSeries.some((seriesItem) => seriesItem.key === item.key))
                      .map((item) => (
                        <g key={item.key}>
                          {!isLineOnlyKind(item.kind) ? (
                            <AreaClosed
                              data={item.points}
                              x={(point) => point.x}
                              yScale={yScale}
                              y0={0}
                              y1={(point) => point.value}
                              fill={item.color}
                              fillOpacity={item.fillOpacity ?? 0.12}
                              curve={curveMonotoneX}
                            />
                          ) : null}
                          <LinePath
                            data={item.points}
                            x={(point) => point.x}
                            y={(point) => yScale(point.value)}
                            stroke={item.color}
                            strokeWidth={seriesStrokeWidth(item)}
                            strokeDasharray={item.dashed ? "5 4" : undefined}
                            curve={curveMonotoneX}
                          />
                        </g>
                      ))}

                {(bars || barSeries.length > 0)
                  ? rows.map((row, rowIndex) => {
                      const bandX = xScale(String(row[xKey] ?? row.label));
                      if (bandX === undefined) return null;
                      const bandWidth = xScale.bandwidth();
                      const activeItems = bars ? drawableSeries : barSeries;
                      const barWidth = stacked ? bandWidth : Math.max(bandWidth / Math.max(activeItems.length, 1), 10);

                      return (
                        <g key={`${row.label}-${rowIndex}`}>
                          {activeItems.reduce<ReactNode[]>((nodes, item, itemIndex) => {
                            const value = numeric(row[item.key]);
                            if (value <= 0) return nodes;
                            const start = stacked
                              ? activeItems
                                  .slice(0, itemIndex)
                                  .reduce((sum, previousItem) => sum + numeric(row[previousItem.key]), 0)
                              : 0;
                            const end = stacked ? start + value : value;
                            const x = stacked ? bandX : bandX + itemIndex * barWidth;
                            const y = yScale(end);
                            const h = yScale(start) - y;

                            return [
                              ...nodes,
                              <Bar
                                key={item.key}
                                x={x}
                                y={y}
                                width={stacked ? bandWidth : Math.max(barWidth - 3, 6)}
                                height={Math.max(h, 1)}
                                fill={item.color}
                                fillOpacity={0.9}
                                rx={8}
                              />,
                            ];
                          }, [])}
                        </g>
                      );
                    })
                  : null}

                {annotations.map((item, index) => {
                  const bandX = xScale(item.rowLabel);
                  if (bandX === undefined) return null;
                  const annotationValue =
                    item.value ??
                    numeric(
                      rows.find((row) => String(row[xKey] ?? row.label) === item.rowLabel)?.[
                        item.seriesKey ?? ""
                      ],
                    );
                  const x = bandX + xScale.bandwidth() / 2;
                  const y = yScale(annotationValue);
                  const color = item.color ?? toneToColor(item.tone);

                  return (
                    <g key={`${item.rowLabel}-${item.label}-${index}`}>
                      <circle cx={x} cy={y} r={4} fill={color} stroke="var(--surface-base)" strokeWidth={2} />
                      <text
                        x={x}
                        y={Math.max(y - 10, 10)}
                        textAnchor="middle"
                        fontSize={10}
                        fontFamily="var(--font-mono)"
                        fill={color}
                      >
                        {item.label}
                      </text>
                    </g>
                  );
                })}

                {rows.map((row) => {
                  const label = String(row[xKey] ?? row.label);
                  const bandX = xScale(label);
                  if (bandX === undefined) return null;
                  return (
                    <rect
                      key={`${label}-hit`}
                      x={bandX}
                      y={0}
                      width={xScale.bandwidth()}
                      height={innerHeight}
                      fill="transparent"
                      onMouseLeave={() => setTooltip(null)}
                      onMouseMove={(event) => {
                        const point = localPoint(event) ?? { x: 0, y: 0 };
                        const items = drawableSeries.map((item) => ({
                          key: item.key,
                          label: item.label,
                          color: item.color,
                          value: numeric(row[item.key]),
                        }));
                        setTooltip({
                          x: point.x,
                          y: point.y,
                          label: String(row.tooltipLabel ?? row.label),
                          items,
                        });
                      }}
                    />
                  );
                })}
              </g>
            </svg>

            {tooltip ? (
              <div className="pointer-events-none absolute z-10" style={{ left: Math.min(tooltip.x + 12, svgWidth - 190), top: Math.max(tooltip.y - 18, 8) }}>
                <AdminChartTooltip label={tooltip.label} items={tooltip.items} valueFormatter={valueFormatter} />
              </div>
            ) : null}
          </div>
        );
      }}
    </AdminChartFrame>
  );
}

export function AdminTrendChart(props: BaseCartesianProps) {
  return <CartesianChart {...props} />;
}

export function AdminStackedAreaChart(props: BaseCartesianProps) {
  return <CartesianChart {...props} stacked />;
}

export function AdminStackedBarChart(props: BaseCartesianProps) {
  return <CartesianChart {...props} stacked bars />;
}

export function AdminDistributionChart({
  rows,
  emptyLabel = "No data",
  height = 230,
  valueLabel = "Value",
  valueFormatter = formatValue,
}: DistributionChartProps) {
  const hasData = rows.length > 0;

  return (
    <AdminChartFrame hasData={hasData} height={height} emptyLabel={emptyLabel}>
      {({ width, height: frameHeight }) => {
        const svgWidth = Math.max(width, 280);
        const svgHeight = Math.max(frameHeight, 180);
        const margin = { top: 8, right: 56, bottom: 12, left: 120 };
        const innerWidth = Math.max(svgWidth - margin.left - margin.right, 120);
        const rowGap = 10;
        const barHeight = Math.max((svgHeight - margin.top - margin.bottom - rowGap * Math.max(rows.length - 1, 0)) / Math.max(rows.length, 1), 14);
        const yStep = barHeight + rowGap;
        const maxValue = Math.max(...rows.map((row) => row.value), 1);
        const xScale = scaleLinear<number>({ domain: [0, maxValue], range: [0, innerWidth], nice: true });

        return (
          <svg width={svgWidth} height={svgHeight} role="img" aria-label={valueLabel}>
            <g transform={`translate(${margin.left}, ${margin.top})`}>
              {rows.map((row, index) => {
                const y = index * yStep;
                return (
                  <g key={row.id}>
                    <text x={-12} y={y + barHeight / 2 + 4} textAnchor="end" fontSize={11} fill="var(--text-muted)">
                      {row.label}
                    </text>
                    <rect x={0} y={y} width={innerWidth} height={barHeight} rx={10} fill="var(--surface-subtle)" />
                    <rect
                      x={0}
                      y={y}
                      width={Math.max(xScale(row.value), 2)}
                      height={barHeight}
                      rx={10}
                      fill={row.color ?? toneToColor(row.tone)}
                    />
                    <text x={innerWidth + 10} y={y + barHeight / 2 + 4} fontSize={11} fontFamily="var(--font-mono)" fill="var(--text-strong)">
                      {valueFormatter(row.value)}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        );
      }}
    </AdminChartFrame>
  );
}

export function AdminCategoryBarChart({
  rows,
  emptyLabel = "No data",
  height = 230,
  valueLabel = "Value",
  valueFormatter = formatValue,
}: DistributionChartProps) {
  const trendRows = rows.map((row) => ({ label: row.label, value: row.value }));
  return (
    <AdminStackedBarChart
      rows={trendRows}
      series={[{ key: "value", label: valueLabel, color: "var(--primary-500)" }]}
      emptyLabel={emptyLabel}
      height={height}
      valueFormatter={valueFormatter}
      yTickFormatter={valueFormatter}
      xTickInterval={0}
    />
  );
}

export function AdminDualBarChart({
  rows,
  emptyLabel = "No data",
  height = 220,
  primaryLabel,
  secondaryLabel,
  primaryColor = "var(--primary-500)",
  secondaryColor = "var(--accent-500)",
  valueFormatter = formatValue,
}: DualSeriesChartProps) {
  const chartRows = rows.map((row) => ({
    label: row.label,
    primary: row.primary,
    secondary: row.secondary,
  }));

  return (
    <CartesianChart
      rows={chartRows}
      series={[
        { key: "primary", label: primaryLabel, color: primaryColor, kind: "bar" },
        { key: "secondary", label: secondaryLabel, color: secondaryColor, kind: "bar" },
      ]}
      emptyLabel={emptyLabel}
      height={height}
      valueFormatter={valueFormatter}
      yTickFormatter={valueFormatter}
      bars
      xTickInterval={0}
    />
  );
}

export function AdminGroupedDistributionChart({
  sections,
  emptyLabel = "No data",
  height = 320,
  valueLabel = "Value",
  valueFormatter = formatValue,
}: GroupedDistributionChartProps) {
  const rows = sections.flatMap((section) =>
    section.rows.map((row) => ({
      id: `${section.id}-${row.id}`,
      label: `${section.label}: ${row.label}`,
      value: row.value,
      tone: row.tone,
    })),
  );

  return (
    <AdminDistributionChart
      rows={rows}
      emptyLabel={emptyLabel}
      height={height}
      valueLabel={valueLabel}
      valueFormatter={valueFormatter}
    />
  );
}

export function AdminDonutChart({
  rows,
  emptyLabel = "No data",
  height = 260,
  valueLabel = "Value",
  valueFormatter = formatValue,
}: DonutChartProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const chartRows = useMemo(
    () =>
      rows.map((row, index) => ({
        ...row,
        color: row.color ?? (row.tone ? toneToColor(row.tone) : PALETTE[index % PALETTE.length]),
      })),
    [rows],
  );
  const total = chartRows.reduce((sum, row) => sum + row.value, 0);

  return (
    <AdminChartFrame
      hasData={chartRows.length > 0}
      height={height}
      emptyLabel={emptyLabel}
      legend={
        <div className="grid gap-1.5">
          <p className="text-xs font-medium text-[var(--text-muted)]">Total {valueLabel.toLowerCase()}</p>
          <p className="font-mono text-sm font-semibold text-[var(--text-strong)]">{valueFormatter(total)}</p>
          {chartRows.slice(0, 6).map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-3 text-[11px]">
              <span className="inline-flex min-w-0 items-center gap-2 text-[var(--text-muted)]">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                <span className="truncate">{row.label}</span>
              </span>
              <span className="font-mono text-[var(--text-strong)]">{valueFormatter(row.value)}</span>
            </div>
          ))}
        </div>
      }
    >
      {({ width, height: frameHeight }) => {
        const svgWidth = Math.max(width, 280);
        const svgHeight = Math.max(frameHeight, 220);
        const radius = Math.min(svgWidth, svgHeight) / 2 - 18;
        return (
          <div className="relative h-full w-full">
            <svg width={svgWidth} height={svgHeight} role="img" aria-label={valueLabel}>
              <g transform={`translate(${svgWidth / 2}, ${svgHeight / 2})`}>
                <Pie
                  data={chartRows}
                  innerRadius={Math.max(radius * 0.58, 34)}
                  outerRadius={Math.max(radius, 48)}
                  cornerRadius={4}
                  padAngle={0.02}
                  pieValue={(datum) => datum.value}
                >
                  {({ arcs, path }) =>
                    arcs.map((arc) => (
                      <path
                        key={arc.data.id}
                        d={path(arc) ?? undefined}
                        fill={arc.data.color}
                        stroke="var(--surface-base)"
                        strokeWidth={2}
                        onMouseLeave={() => setTooltip(null)}
                        onMouseMove={(event) => {
                          const point = localPoint(event) ?? { x: 0, y: 0 };
                          setTooltip({
                            x: point.x,
                            y: point.y,
                            label: arc.data.label,
                            items: [{ key: arc.data.id, label: valueLabel, color: arc.data.color, value: arc.data.value }],
                          });
                        }}
                      />
                    ))
                  }
                </Pie>
              </g>
            </svg>
            {tooltip ? (
              <div className="pointer-events-none absolute z-10" style={{ left: Math.min(tooltip.x + 12, svgWidth - 190), top: Math.max(tooltip.y - 16, 8) }}>
                <AdminChartTooltip label={tooltip.label} items={tooltip.items} valueFormatter={valueFormatter} />
              </div>
            ) : null}
          </div>
        );
      }}
    </AdminChartFrame>
  );
}

export function AdminWaterfallChart({
  rows,
  emptyLabel = "No data",
  height = 240,
  valueFormatter = formatValue,
  yTickFormatter,
}: {
  rows: WaterfallRow[];
  emptyLabel?: string;
  height?: number;
  valueFormatter?: (value: number) => string;
  yTickFormatter?: (value: number) => string;
}) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const bars = useMemo(() => {
    const result = rows.reduce(
      (acc, row, index) => {
        const start = acc.running;
        const end = start + row.value;
        return {
          running: end,
          items: [
            ...acc.items,
            {
              ...row,
              color: row.color ?? toneToColor(row.tone) ?? PALETTE[index % PALETTE.length],
              start,
              end,
            },
          ],
        };
      },
      { running: 0, items: [] as Array<WaterfallRow & { color: string; start: number; end: number }> },
    );

    const items = [...result.items];
    items.push({
      id: "total",
      label: "Total",
      value: result.running,
      color: "var(--primary-700)",
      tone: "default" as ChartTone,
      start: 0,
      end: result.running,
    });
    return items;
  }, [rows]);

  return (
    <AdminChartFrame hasData={rows.length > 0} height={height} emptyLabel={emptyLabel}>
      {({ width, height: frameHeight }) => {
        const svgWidth = Math.max(width, 280);
        const svgHeight = Math.max(frameHeight, 180);
        const innerWidth = Math.max(svgWidth - CARTESIAN_MARGIN.left - CARTESIAN_MARGIN.right, 120);
        const innerHeight = Math.max(svgHeight - CARTESIAN_MARGIN.top - CARTESIAN_MARGIN.bottom, 100);
        const xScale = scaleBand<string>({ domain: bars.map((row) => row.label), range: [0, innerWidth], padding: 0.28 });
        const minValue = Math.min(...bars.map((row) => Math.min(row.start, row.end)), 0);
        const maxValue = Math.max(...bars.map((row) => Math.max(row.start, row.end)), 1);
        const yScale = scaleLinear<number>({ domain: [minValue, maxValue * 1.1], range: [innerHeight, 0], nice: true });
        const yTicks = yScale.ticks(4);

        return (
          <div className="relative h-full w-full">
            <svg width={svgWidth} height={svgHeight} role="img" aria-label="Waterfall chart">
              <g transform={`translate(${CARTESIAN_MARGIN.left}, ${CARTESIAN_MARGIN.top})`}>
                {renderCartesianGrid(innerWidth, yTicks.map((tick) => yScale(tick)))}
                {yTicks.map((tick) => (
                  <text key={tick} x={-10} y={yScale(tick) + 4} textAnchor="end" fontSize={11} fontFamily="var(--font-mono)" fill="var(--text-muted)">
                    {yTickFormatter ? yTickFormatter(tick) : valueFormatter(tick)}
                  </text>
                ))}
                {bars.map((row, index) => {
                  const x = xScale(row.label);
                  if (x === undefined) return null;
                  const top = yScale(Math.max(row.start, row.end));
                  const bottom = yScale(Math.min(row.start, row.end));
                  const y = top;
                  const h = Math.max(bottom - top, 2);
                  const bandCenter = x + xScale.bandwidth() / 2;
                  const next = bars[index + 1];
                  return (
                    <g key={row.id}>
                      <Bar
                        x={x}
                        y={y}
                        width={xScale.bandwidth()}
                        height={h}
                        rx={8}
                        fill={row.color}
                        fillOpacity={row.id === "total" ? 0.95 : 0.82}
                        onMouseLeave={() => setTooltip(null)}
                        onMouseMove={(event) => {
                          const point = localPoint(event) ?? { x: 0, y: 0 };
                          setTooltip({
                            x: point.x,
                            y: point.y,
                            label: row.label,
                            items: [{ key: row.id, label: "Value", color: row.color, value: row.value }],
                          });
                        }}
                      />
                      <text x={bandCenter} y={innerHeight + 22} textAnchor="middle" fontSize={11} fontFamily="var(--font-mono)" fill="var(--text-muted)">
                        {row.label}
                      </text>
                      {next ? (
                        <line
                          x1={bandCenter + xScale.bandwidth() / 2}
                          x2={(xScale(next.label) ?? 0) + xScale.bandwidth() / 2 - xScale.bandwidth() / 2}
                          y1={yScale(row.end)}
                          y2={yScale(row.end)}
                          stroke="var(--edge-default)"
                          strokeDasharray="3 3"
                        />
                      ) : null}
                    </g>
                  );
                })}
              </g>
            </svg>
            {tooltip ? (
              <div className="pointer-events-none absolute z-10" style={{ left: Math.min(tooltip.x + 12, svgWidth - 190), top: Math.max(tooltip.y - 18, 8) }}>
                <AdminChartTooltip label={tooltip.label} items={tooltip.items} valueFormatter={valueFormatter} />
              </div>
            ) : null}
          </div>
        );
      }}
    </AdminChartFrame>
  );
}
