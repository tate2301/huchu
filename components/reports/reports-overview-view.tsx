import Link from "next/link";

import { Empty, Finding, Icon, Pill, Status, type IconName } from "@/components/core";
import type { HealthRow, OverviewKpi, ReportsOverview } from "@/lib/reports/overview";

import styles from "./reports-overview.module.css";

/**
 * A vertical's Reports overview, drawn (PageRetailReports, PageSchoolReports,
 * PageMineReports, PagePayReports, PageShopReports): the finding, a tile for
 * each insight, the reports opened most and how each module is doing. Pure:
 * every vertical hands it its own figures.
 */

const HEALTH_ICONS: Record<HealthRow["icon"], IconName> = {
  money: "money",
  book: "books",
  people: "users",
  stock: "store",
  floor: "takings",
  gold: "measure",
  safety: "incidents",
  wrench: "inspections",
  fees: "invoice",
};

const TONE_COLOUR = {
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
  muted: "var(--color-muted)",
} as const;

/** Tiles in rows of up to four, the last rows as wide as the first: 7 is 4 then 3. */
export function tileSpans(count: number): number[] {
  if (count === 0) return [];
  const rows = Math.ceil(count / 4);
  const base = Math.floor(count / rows);
  const extra = count % rows;
  return Array.from({ length: rows }, (_, row) => (row < extra ? base + 1 : base)).flatMap((inRow) =>
    Array.from({ length: inRow }, () => 12 / inRow),
  );
}

function Tile({ kpi, span }: { kpi: OverviewKpi; span: number }) {
  const top = Math.max(1, ...kpi.bars);
  return (
    <Link href={kpi.href} className={`kpi ${styles.tile}`} data-span={span}>
      <span className="kpi-l">{kpi.label}</span>
      <span className="kpi-v">{kpi.value}</span>
      {kpi.change || kpi.note ? (
        <span className="kpi-n">
          {kpi.change ? (
            <span className="num" style={{ color: TONE_COLOUR[kpi.change.tone] }}>
              {kpi.change.text}
            </span>
          ) : null}
          {kpi.change && kpi.note ? " " : null}
          {kpi.note}
        </span>
      ) : null}
      {kpi.bars.length > 1 ? (
        <span className="kpi-b" aria-hidden="true">
          {kpi.bars.map((bar, index) => (
            <i
              key={index}
              style={{
                height: `${Math.max(4, (bar / top) * 100)}%`,
                background: index === kpi.bars.length - 1 ? "var(--color-ink-2)" : "var(--color-rule)",
              }}
            />
          ))}
        </span>
      ) : null}
    </Link>
  );
}

export function ReportsOverviewView({ overview }: { overview: ReportsOverview }) {
  const spans = tileSpans(overview.kpis.length);
  return (
    <div className="kbody">
      {overview.finding ? <Finding fact={overview.finding.fact} rest={overview.finding.rest} /> : null}
      <div className={`kgrid ${styles.grid}`}>
        {overview.kpis.map((kpi, index) => (
          <Tile key={kpi.label} kpi={kpi} span={spans[index] ?? 3} />
        ))}
        <section className={`kpanel ${styles.wide}`} aria-labelledby="opened-most">
          <div className="kpanel-h">
            <h2 id="opened-most">Opened most</h2>
            <Pill tone="n">{overview.opened.length}</Pill>
          </div>
          {overview.opened.length === 0 ? (
            <Empty icon="reports" title="No reports here yet">
              Build a report, or open one from Corelith: the ones opened most are listed here.
            </Empty>
          ) : (
            <div className="wt" style={{ flex: "none", overflowX: "auto" }}>
              <table className="table">
                <colgroup>
                  <col style={{ width: "50%" }} />
                  <col style={{ width: "50%" }} />
                  <col />
                  <col />
                  <col />
                  <col />
                </colgroup>
                <thead>
                  <tr>
                    <th>Template</th>
                    <th>Area</th>
                    <th>Made by</th>
                    <th>Seen by</th>
                    <th>Last opened</th>
                    <th className="num">Opens, 30 days</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.opened.map((row) => (
                    <tr key={row.id}>
                      <td className="fill">
                        <Link href={row.href} className="link truncate">
                          {row.title}
                        </Link>
                      </td>
                      <td className="fill muted">
                        <span className="truncate">{row.area ?? "—"}</span>
                      </td>
                      <td>{row.madeBy ? <span className="truncate">{row.madeBy}</span> : <Status tone="info">Corelith</Status>}</td>
                      <td>
                        <Status>{row.seenBy}</Status>
                      </td>
                      <td className="muted">{row.lastOpened ?? "—"}</td>
                      <td className="num">{overview.opensCounted ? row.opens : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className={`kpanel ${styles.side}`} aria-labelledby="module-health">
          <div className="kpanel-h">
            <h2 id="module-health">How each module is doing</h2>
            <Pill tone="n">{overview.health.length}</Pill>
          </div>
          {overview.health.length === 0 ? (
            <p className="hrow-s" style={{ padding: 16 }}>
              Nothing to report yet: the books, pay and people show here once they are kept in this workspace.
            </p>
          ) : (
            overview.health.map((row) => (
              <div key={row.module} className="hrow">
                <span className="hrow-m">
                  <Icon name={HEALTH_ICONS[row.icon]} />
                  {row.module}
                </span>
                <Pill tone={row.state === "Healthy" ? "ok" : "warn"}>{row.state}</Pill>
                <span className="hrow-s">{row.line}</span>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}

/** Loading: the page's shape in grey. */
export function ReportsOverviewLoading() {
  return (
    <div className="kbody" aria-busy="true" aria-label="Loading">
      <div className="finding">
        <div className="skeleton" style={{ height: 28, width: "70%" }} />
        <div className="skeleton" style={{ height: 28, width: "50%", marginTop: 8 }} />
      </div>
      <div className={`kgrid ${styles.grid}`}>
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className={`skeleton ${styles.tile}`} data-span={3} style={{ height: 132, borderRadius: 12 }} />
        ))}
        <div className={`skeleton ${styles.wide}`} style={{ height: 320, borderRadius: 12 }} />
        <div className={`skeleton ${styles.side}`} style={{ height: 320, borderRadius: 12 }} />
      </div>
    </div>
  );
}
