import * as React from "react";

import { cn } from "@/lib/utils";

import { AreaSparkline, type SparkPoint } from "./area-sparkline";
import type { Delta } from "./types";

/**
 * Hero KPI (span 6): the day's one number large, its change in a pill with
 * what it is compared with, a 72px sparkline of today against the day it is
 * compared with, hour labels and a legend ("Today" solid, "Last Saturday"
 * dashed).
 */
export function HeroKpi({
  label,
  value,
  delta,
  comparison,
  points,
  format,
  axis,
  nowLabel,
  beforeLabel,
  chartLabel,
  empty,
  span = 6,
}: {
  label: string;
  value: string;
  delta?: Delta | null;
  /** "on last Saturday by this hour (US$1,187.20)". */
  comparison?: string | null;
  points: ReadonlyArray<SparkPoint>;
  format: (value: number) => string;
  /** Hour labels under the chart ("07:00" … "19:00"). */
  axis: ReadonlyArray<string>;
  nowLabel: string;
  beforeLabel: string;
  chartLabel: string;
  /** Shown instead of the figures when there is nothing yet. */
  empty?: string | null;
  span?: number;
}) {
  const id = React.useId();
  return (
    <section aria-labelledby={id} className={cn("cx-df-tile cx-df-hero", `cx-df-span-${span}`)}>
      <h2 id={id} className="cx-df-tile__label">
        {label}
        {empty ? null : <span className="cx-df-tile__value">{value}</span>}
      </h2>
      {empty ? (
        <p className="cx-df-empty">{empty}</p>
      ) : (
        <>
          {delta || comparison ? (
            <span className="cx-df-hero__line">
              {delta ? <span className={cn("cx-df-pill", delta.tone && `cx-df-pill--${delta.tone}`)}>{delta.text}</span> : null}
              {comparison ? <span>{comparison}</span> : null}
            </span>
          ) : null}
          <AreaSparkline points={points} format={format} nowLabel={nowLabel} beforeLabel={beforeLabel} label={chartLabel} />
          <div className="cx-df-axis" aria-hidden="true">
            {axis.map((tick) => (
              <span key={tick}>{tick}</span>
            ))}
          </div>
          <div className="cx-df-legend">
            <span className="cx-df-legend__item">
              <span className="cx-df-legend__line" aria-hidden="true" />
              {nowLabel}
            </span>
            <span className="cx-df-legend__item">
              <span className="cx-df-legend__line cx-df-legend__line--compare" aria-hidden="true" />
              {beforeLabel}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
