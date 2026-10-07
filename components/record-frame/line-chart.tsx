"use client";

import * as React from "react";

import { niceScale } from "@/components/dashboard-frame/bar-chart";
import { ChartTip } from "@/components/dashboard-frame/chart-tip";
import type { RecordLine, RecordLinePoint } from "@/lib/retail/record-kinds/types";

/**
 * The record's line chart (When it runs out): a 150px plot with three y
 * labels (0, half, top) on a dashed grid; the line solid to today and dashed
 * on to the day it runs out; the reference level as a dashed amber line with
 * its words at the right; a green dot and its words on each day something
 * came in; today to the end shaded, with "today" over it. Hovering a day
 * shows its tooltip.
 */
export function LineChart({ line, label }: { line: RecordLine; label: string }) {
  const [hover, setHover] = React.useState<number | null>(null);
  // Every day drawn: the solid days, then the projection's after today.
  const all: RecordLinePoint[] = [...line.points, ...line.projection.slice(1)];
  const count = all.length;
  const indexOf = new Map(all.map((point, index) => [point.date, index]));
  const x = (index: number) => (count <= 1 ? 0 : (index / (count - 1)) * 100);
  const scale = niceScale(Math.max(1, ...all.map((point) => point.value), line.reference?.value ?? 0), 2);
  const y = (value: number) => 100 - (Math.max(0, value) / scale.top) * 100;
  const path = (points: RecordLinePoint[], offset: number) =>
    points.map((point, index) => `${x(offset + index).toFixed(2)},${y(point.value).toFixed(2)}`).join(" ");
  const today = indexOf.get(line.todayFrom) ?? line.points.length - 1;
  const tip = hover === null ? null : all[hover];

  const onMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0 || count === 0) return;
    const index = Math.round(((event.clientX - box.left) / box.width) * (count - 1));
    setHover(Math.min(Math.max(index, 0), count - 1));
  };

  return (
    <div className="cx-rf-line">
      <div className="cx-rf-line__grid" aria-hidden="true">
        {scale.ticks.map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>
      <div className="cx-rf-line__plot" role="img" aria-label={label} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <span className="cx-rf-line__today" style={{ left: `${x(today)}%` }} aria-hidden="true">
          <span>today</span>
        </span>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {line.reference ? (
            <line
              x1="0"
              x2="100"
              y1={y(line.reference.value)}
              y2={y(line.reference.value)}
              className="cx-rf-line__reference"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {line.points.length > 1 ? (
            <polyline points={path(line.points, 0)} className="cx-rf-line__now" vectorEffect="non-scaling-stroke" />
          ) : null}
          {line.projection.length > 1 ? (
            <polyline
              points={path(line.projection, line.points.length - 1)}
              className="cx-rf-line__ahead"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>
        {line.reference ? (
          <span className="cx-rf-line__label cx-rf-line__label--warn" style={{ right: 0, top: `${y(line.reference.value)}%` }}>
            {line.reference.label}
          </span>
        ) : null}
        {line.markers.map((marker) => {
          const index = indexOf.get(marker.date);
          if (index === undefined) return null;
          const point = all[index]!;
          return (
            <React.Fragment key={marker.date}>
              <span className="cx-rf-line__dot" style={{ left: `${x(index)}%`, top: `${y(point.value)}%` }} aria-hidden="true" />
              <span className="cx-rf-line__label cx-rf-line__label--ok" style={{ left: `${x(index)}%`, top: `${y(point.value)}%` }}>
                {marker.label}
              </span>
            </React.Fragment>
          );
        })}
        {tip && hover !== null ? (
          <>
            <span className="cx-rf-line__cross" style={{ left: `${x(hover)}%` }} aria-hidden="true" />
            <ChartTip left={`${x(hover)}%`} top="-8px" label={tip.tip.label} value={tip.tip.value} sub={tip.tip.sub} />
          </>
        ) : null}
      </div>
      <div className="cx-rf-line__x" aria-hidden="true">
        {line.ticks.map((tick) => {
          const index = indexOf.get(tick.date);
          return index === undefined ? null : (
            <span key={tick.date} style={{ left: `${x(index)}%` }}>
              {tick.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
