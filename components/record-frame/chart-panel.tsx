"use client";

import * as React from "react";
import Link from "next/link";

import "@/components/dashboard-frame/dashboard-frame.css";
import { BarChart } from "@/components/dashboard-frame/bar-chart";
import type { RecordChart } from "@/lib/retail/record-kinds/types";

/**
 * The chart panel (5.6.5 item 2): a 48px head on `--ground` with the title,
 * its unit or chip and, at the right, a sentence; a 150px bar plot with its
 * dashed grid and hover tooltip; an optional footer with a sentence and a
 * link. No range control unless the kind has one (decision 10).
 */
export function ChartPanel({ chart }: { chart: RecordChart }) {
  const id = React.useId();
  const empty = chart.bars.every((bar) => bar.value === 0);
  // The gap narrows as the bars multiply, so no bar is ever squeezed to nothing.
  const count = chart.bars.length;
  const gap = count <= 8 ? 16 : count <= 16 ? 8 : 3;
  return (
    <section className="cx-rf-panel" aria-labelledby={id} style={{ "--rf-bar-gap": `${gap}px` } as React.CSSProperties}>
      <div className="cx-rf-panel__head">
        <h2 id={id} className="cx-rf-panel__title">
          {chart.title}
        </h2>
        {chart.unit ? <span className="cx-rf-panel__unit">{chart.unit}</span> : null}
        {chart.chip ? <span className={`cx-rf-chip cx-rf-chip--${chart.chip.tone}`}>{chart.chip.label}</span> : null}
        <span className="cx-rf-panel__spacer" />
        {chart.aside ? <span className="cx-rf-panel__aside">{chart.aside}</span> : null}
      </div>
      {chart.bars.length === 0 ? (
        <p className="cx-rf-panel__empty">Nothing to draw yet.</p>
      ) : (
        <BarChart
          bars={chart.bars}
          xLabels={chart.bars.map((bar) => bar.tick ?? bar.label)}
          label={`${chart.title}${empty ? ": nothing yet" : ""}`}
          tick={chart.tick}
          evenX
          steps={2}
        />
      )}
      {chart.footer ? (
        <div className="cx-rf-panel__foot">
          <span>{chart.footer.text}</span>
          <span className="cx-rf-panel__spacer" />
          {chart.footer.link ? (
            <Link href={chart.footer.link.href} className="cx-rf-link">
              {chart.footer.link.label}
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
