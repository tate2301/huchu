import * as React from "react";

import { Check } from "@/lib/icons";
import type { RecordChip, RecordFigure, RecordStep } from "@/lib/retail/record-kinds/types";

/**
 * The strip (5.6.4): where the record has got to, its chips, and its
 * headline figure at the right. The current step is solid ink (G1).
 */
export function RecordStrip({
  title,
  steps,
  chips,
  figure,
}: {
  title: string;
  steps: RecordStep[];
  chips: RecordChip[];
  figure: RecordFigure | null;
}) {
  if (steps.length === 0 && chips.length === 0 && !figure) return null;
  return (
    <div role="toolbar" aria-label={title} className="cx-rf-strip">
      {steps.length ? (
        <ol aria-label="Where it has got to" className="cx-rf-steps">
          {steps.map((step) => (
            <li
              key={step.label}
              className={`cx-rf-step cx-rf-step--${step.state}`}
              aria-current={step.state === "now" ? "step" : undefined}
            >
              <span className="cx-rf-step__pill">
                <span className="cx-rf-step__dot" aria-hidden="true">
                  {step.state === "done" ? <Check weight="bold" /> : null}
                </span>
                {step.label}
                {step.state === "done" ? <span className="cx-rf-sr"> (done)</span> : null}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      {chips.map((chip) => (
        <span key={`${chip.tone}-${chip.label}`} className={`cx-rf-chip cx-rf-chip--${chip.tone}`}>
          {chip.label}
        </span>
      ))}
      <span className="cx-rf-strip__spacer" />
      {figure ? (
        <span className="cx-rf-figure">
          <span className="cx-rf-figure__label">{figure.label}</span>
          <span className={`cx-rf-figure__value${figure.tone === "warn" ? " cx-rf-figure__value--warn" : ""}`}>
            {figure.value}
          </span>
        </span>
      ) : null}
    </div>
  );
}
