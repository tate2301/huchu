"use client";

import { formatFigure } from "@/components/retail/insights/format";
import type { Format } from "@/lib/retail/insights";

/**
 * Takings by day and hour as a grid of cells, darker for more.
 *
 * One hue, light to dark, so the busy hours read at a glance; every cell
 * carries its figure as a title and the grid is a table to assistive tech.
 */
export function HeatGrid({
  rows,
  columns,
  values,
  format,
}: {
  rows: string[];
  columns: string[];
  values: number[][];
  format: Format;
}) {
  const max = Math.max(1, ...values.flat());
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate" style={{ borderSpacing: 3 }} aria-label="Takings by day and hour">
        <thead>
          <tr>
            <th scope="col" className="w-10" />
            {columns.map((column) => (
              <th key={column} scope="col" className="text-center font-mono text-[11px] font-normal text-[var(--text-muted)]">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row}>
              <th scope="row" className="pr-2 text-left text-xs font-normal text-[var(--text-muted)]">
                {row}
              </th>
              {columns.map((column, columnIndex) => {
                const value = values[rowIndex]?.[columnIndex] ?? 0;
                const strength = value / max;
                return (
                  <td
                    key={column}
                    title={`${row} ${column}:00 — ${formatFigure(value, format)}`}
                    className="h-7 min-w-7 rounded-[4px]"
                    style={{
                      background:
                        value === 0
                          ? "var(--surface-muted)"
                          : `color-mix(in srgb, var(--action-primary-bg) ${Math.round(12 + strength * 80)}%, var(--surface-base))`,
                    }}
                  >
                    <span className="sr-only">{formatFigure(value, format)}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
