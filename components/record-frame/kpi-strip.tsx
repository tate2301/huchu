import * as React from "react";

import type { RecordKpi } from "@/lib/retail/record-kinds/types";

/** The KPI strip (5.6.5 item 1): four or five equal tiles in one bordered row. */
export function KpiStrip({ kpis }: { kpis: RecordKpi[] }) {
  if (kpis.length === 0) return null;
  return (
    <section aria-label="Summary" className="cx-rf-kpis" style={{ gridTemplateColumns: `repeat(${kpis.length}, minmax(0, 1fr))` }}>
      {kpis.map((kpi) => (
        <div key={kpi.label} className="cx-rf-kpi" title={`${kpi.label}: ${kpi.value}`}>
          <span className="cx-rf-kpi__label">{kpi.label}</span>
          <span className="cx-rf-kpi__value">{kpi.value}</span>
          <span className="cx-rf-kpi__note">
            {kpi.lead ? <span className={`cx-rf-kpi__lead cx-rf-kpi__lead--${kpi.leadTone ?? "plain"}`}>{kpi.lead}</span> : null}
            {kpi.lead ? " " : null}
            {kpi.note}
          </span>
        </div>
      ))}
    </section>
  );
}
