import * as React from "react";

/**
 * The hover tooltip every chart carries: a label in `--ink-3` over the value
 * in mono 600, on `--surface` with the float shadow. Placed by the chart, in
 * its own coordinates, above the point it describes.
 */
export function ChartTip({
  left,
  top,
  label,
  value,
  sub,
}: {
  left: string;
  top: string;
  label: string;
  value: string;
  sub?: React.ReactNode;
}) {
  return (
    <div role="status" className="cx-df-tip" style={{ left, top }}>
      <span className="cx-df-tip__label">{label}</span>
      <span className="cx-df-tip__value">{value}</span>
      {sub ? <span className="cx-df-tip__label">{sub}</span> : null}
    </div>
  );
}
