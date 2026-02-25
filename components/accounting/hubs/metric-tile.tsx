"use client";

import { NumberChart } from "@rtcamp/frappe-ui-react";
import { buildNumberMetricConfig } from "@/lib/charts/frappe-config-builders";

type MetricTileProps = {
  title: string;
  value: number;
  valueLabel: string;
  detail?: string;
  negativeIsBetter?: boolean;
};

export function MetricTile({
  title,
  value,
  valueLabel,
  detail,
  negativeIsBetter = false,
}: MetricTileProps) {
  return (
    <div className="rounded-md border border-border/60 bg-card/70">
      <NumberChart
        config={buildNumberMetricConfig({
          title,
          value,
          negativeIsBetter,
        })}
        subtitle={() => (
          <div className="flex flex-col gap-1">
            <div className="font-mono text-[24px] font-semibold leading-8 text-ink-gray-6 tabular-nums">
              {valueLabel}
            </div>
            {detail ? <div className="text-xs text-muted-foreground">{detail}</div> : null}
          </div>
        )}
      />
    </div>
  );
}
