"use client";

import * as React from "react";

import { ChartTip } from "./chart-tip";

/** A cell's fill: `--data` from 8% for the quietest to 100% for the busiest. */
export function heatFill(value: number, max: number) {
  const strength = max > 0 ? 8 + (92 * Math.max(value, 0)) / max : 8;
  return `color-mix(in srgb, var(--data) ${strength.toFixed(1)}%, transparent)`;
}

/**
 * Heat grid (When do we sell?): a row a day, a column a trading hour, cells
 * 30px high with 3px gaps, in the one `--data` hue from 8% to 100% by value;
 * an hour the shop is shut is a `--tray` cell. Every cell has a tooltip
 * ("Fri 18:00" over "US$412.00", or "Closed") and the scale reads "Quieter →
 * Busier". The day labels stay put when the grid scrolls on a phone.
 */
export function HeatGrid({
  rows,
  columns,
  values,
  format,
  label,
}: {
  rows: ReadonlyArray<string>;
  /** Two-digit hours ("08" … "21"). */
  columns: ReadonlyArray<string>;
  /** `null` is a shut hour. */
  values: ReadonlyArray<ReadonlyArray<number | null>>;
  format: (value: number) => string;
  label: string;
}) {
  const [hover, setHover] = React.useState<{ row: number; column: number } | null>(null);
  const max = Math.max(0, ...values.flat().map((value) => value ?? 0));
  const template = `44px repeat(${columns.length}, minmax(0, 1fr))`;
  const hovered = hover ? values[hover.row]?.[hover.column] : undefined;

  return (
    <div className="cx-df-heat">
      <div className="cx-df-heat__scroll">
      <div role="img" aria-label={label} className="cx-df-heat__grid" style={{ gridTemplateColumns: template }}>
        <span />
        {columns.map((column) => (
          <span key={column} className="cx-df-heat__x">
            {column}
          </span>
        ))}
        {rows.map((row, rowIndex) => (
          <React.Fragment key={row}>
            <span className="cx-df-heat__y">{row}</span>
            {columns.map((column, columnIndex) => {
              const value = values[rowIndex]?.[columnIndex] ?? null;
              return (
                <span
                  key={column}
                  data-cell=""
                  data-closed={value === null || undefined}
                  className={value === null ? "cx-df-heat__cell cx-df-heat__cell--closed" : "cx-df-heat__cell"}
                  style={value === null ? undefined : { background: heatFill(value, max) }}
                  onMouseEnter={() => setHover({ row: rowIndex, column: columnIndex })}
                  onMouseLeave={() => setHover(null)}
                />
              );
            })}
          </React.Fragment>
        ))}
      </div>
      </div>
      {hover ? (
        <ChartTip
          left={`calc(44px + (100% - 44px) * ${((hover.column + 0.5) / columns.length).toFixed(4)})`}
          top={`${18 + hover.row * 33}px`}
          label={`${rows[hover.row]} ${columns[hover.column]}:00`}
          value={hovered === null || hovered === undefined ? "Closed" : format(hovered)}
        />
      ) : null}
      <div className="cx-df-heat__scale">
        Quieter
        <span className="cx-df-heat__ramp" aria-hidden="true" />
        Busier
      </div>
      <table className="cx-df-sr">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            {columns.map((column) => (
              <th key={column} scope="col">{`${column}:00`}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row}>
              <th scope="row">{row}</th>
              {columns.map((column, columnIndex) => {
                const value = values[rowIndex]?.[columnIndex] ?? null;
                return <td key={column}>{value === null ? "Closed" : format(value)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
