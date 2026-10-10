"use client";

import * as React from "react";

import { ChartTip } from "./chart-tip";

const W = 520;
const H = 72;

export type SparkPoint = {
  /** The x position's name in the tooltip ("11:00"). */
  label: string;
  /** This period's value; null past now. */
  now: number | null;
  /** The comparison's value at the same point; null when there is none. */
  before: number | null;
};

function line(values: Array<number | null>, max: number) {
  return values
    .map((value, index) =>
      value === null ? null : `${((index * W) / Math.max(values.length - 1, 1)).toFixed(1)},${(H - 2 - (value / max) * (H - 6)).toFixed(1)}`,
    )
    .filter((point): point is string => point !== null);
}

/**
 * A 72px area sparkline: this period as a 2px `--data` line over a 10% fill,
 * the period before as a 1.5px dashed `--data-compare` line. Hovering shows
 * a crosshair and both values at that point.
 */
export function AreaSparkline({
  points,
  format,
  nowLabel,
  beforeLabel,
  label,
}: {
  points: ReadonlyArray<SparkPoint>;
  format: (value: number) => string;
  nowLabel: string;
  beforeLabel: string;
  /** What the chart shows, for assistive tech. */
  label: string;
}) {
  const [hover, setHover] = React.useState<number | null>(null);
  const max = Math.max(1, ...points.flatMap((point) => [point.now ?? 0, point.before ?? 0]));
  const now = line(
    points.map((point) => point.now),
    max,
  );
  const before = line(
    points.map((point) => point.before),
    max,
  );
  const lastNow = now.length > 0 ? now[now.length - 1].split(",")[0] : null;
  const area = lastNow !== null ? `0,${H} ${now.join(" ")} ${lastNow},${H}` : null;

  const onMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0 || points.length === 0) return;
    const index = Math.round(((event.clientX - box.left) / box.width) * (points.length - 1));
    setHover(Math.min(Math.max(index, 0), points.length - 1));
  };
  const point = hover === null ? null : points[hover];
  const left = hover === null ? "0" : `${((hover / Math.max(points.length - 1, 1)) * 100).toFixed(2)}%`;

  return (
    <div className="cx-df-spark" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
        {before.length > 1 ? (
          <polyline
            points={before.join(" ")}
            fill="none"
            stroke="var(--data-compare)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
            data-series="before"
          />
        ) : null}
        {area ? <polygon points={area} fill="var(--data)" fillOpacity={0.1} data-series="area" /> : null}
        {now.length > 1 ? (
          <polyline
            points={now.join(" ")}
            fill="none"
            stroke="var(--data)"
            strokeWidth={2}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            data-series="now"
          />
        ) : null}
      </svg>
      {point ? (
        <>
          <span
            aria-hidden="true"
            style={{ position: "absolute", top: 0, bottom: 0, left, borderLeft: "1px dashed var(--line-strong)" }}
          />
          <ChartTip
            left={left}
            top="-6px"
            label={point.label}
            value={point.now === null ? "—" : format(point.now)}
            sub={point.before === null ? null : `${beforeLabel} ${format(point.before)}`}
          />
        </>
      ) : null}
      <span className="cx-df-sr">
        {nowLabel}: {points.filter((entry) => entry.now !== null).map((entry) => `${entry.label} ${format(entry.now ?? 0)}`).join(", ")}
      </span>
    </div>
  );
}
