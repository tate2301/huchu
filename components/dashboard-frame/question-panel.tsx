import * as React from "react";

import { cn } from "@/lib/utils";

import { seriesClass } from "./bar-chart";
import type { SeriesColor } from "./types";

/**
 * The question panel: the question the page answers ("When do we sell?")
 * over its unit line, an optional legend on the right, then the chart that
 * answers it — or, when the window has no trade, a line saying so.
 */
export function QuestionPanel({
  question,
  unit,
  legend,
  empty,
  children,
}: {
  question: string;
  unit: string;
  legend?: ReadonlyArray<{ label: string; color: SeriesColor }> | null;
  empty?: string | null;
  children: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <section aria-labelledby={id} className="cx-df-question">
      <div className="cx-df-question__head">
        <div className="cx-df-question__titles">
          <h2 id={id}>{question}</h2>
          <span className="cx-df-question__unit">{unit}</span>
        </div>
        {legend && legend.length > 0 ? (
          <span className="cx-df-question__legend">
            {legend.map((entry) => (
              <span key={entry.label} className="cx-df-legend__item">
                <span className={cn("cx-df-legend__swatch", seriesClass(entry.color))} aria-hidden="true" />
                {entry.label}
              </span>
            ))}
          </span>
        ) : null}
      </div>
      <div className="cx-df-question__body">{empty ? <p className="cx-df-question__empty">{empty}</p> : children}</div>
    </section>
  );
}
