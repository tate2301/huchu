/**
 * Reports → Insights → Sales: the sales report (`/api/v2/crm/reports`), the
 * rep scorecard and the lead channels, shaped into the insight page — what
 * `/crm/insights` and `/crm/reports` showed, in one page.
 *
 * Pure: the page fetches, this words and arranges.
 */
import { biggestLeak, formatRate, type FunnelStage, type GroupedPerformance } from "@/lib/crm/reports";

export type SalesReport = {
  scope: "TEAM" | "MINE";
  funnel: Array<FunnelStage & { medianDaysInStage?: number | null }>;
  counts: { won: number; lost: number; open: number };
  winRate: number;
  medianCycleDays: number | null;
  forecast: { weighted: number; unweighted: number; count: number; estimated: number };
  byOwner: GroupedPerformance[];
  bySource: GroupedPerformance[];
  trend: { granularity: "day" | "week"; won: Array<{ period: string; count: number; value: number }> };
  activity: Array<{ period: string; count: number }>;
  leads: { created: number; converted: number };
};

export type RepRow = {
  repId: string;
  name: string;
  leads: number;
  quotes: number;
  won: number;
  winRate: number;
  invoicedAmount: number;
  collectedAmount: number;
  avgResponseHours: number | null;
};

export type ChannelRow = { channel: string; leads: number; won: number; conversionRate: number };

type Money = (value: number) => string;

const plural = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;

/** The stage the most deals drop out before, when any do. */
export function leakOf(funnel: FunnelStage[]): FunnelStage | null {
  const leak = biggestLeak(funnel);
  return leak && leak.droppedFromPrevious > 0 ? leak : null;
}

/** The stage before one in the funnel. */
function stageBefore(funnel: FunnelStage[], stage: FunnelStage): FunnelStage | null {
  const at = funnel.findIndex((candidate) => candidate.key === stage.key);
  return at > 0 ? funnel[at - 1]! : null;
}

/** Nothing opened and nothing decided in the dates: the page says so instead. */
export function salesIsEmpty(report: SalesReport): boolean {
  return report.counts.won + report.counts.lost + report.counts.open === 0;
}

/** The finding: how many were won of those decided, then where the rest fall out. */
export function salesFinding(report: SalesReport, money: Money): { fact: string; rest: string } {
  const decided = report.counts.won + report.counts.lost;
  const fact =
    decided === 0
      ? `${plural(report.counts.open, "deal")} open and none decided yet.`
      : `${report.counts.won.toLocaleString("en-US")} of ${plural(decided, "decided deal")} won, ${formatRate(report.winRate)}.`;
  const leak = leakOf(report.funnel);
  const before = leak ? stageBefore(report.funnel, leak) : null;
  const rest =
    leak && before
      ? `Most stop before ${leak.label}: ${leak.droppedFromPrevious.toLocaleString("en-US")} of the ${before.reached.toLocaleString("en-US")} that reached ${before.label} have not got there.`
      : `${money(report.forecast.weighted)} is likely to land from ${plural(report.counts.open, "open deal")}.`;
  return { fact, rest };
}

/** The four figures: win rate, forecast, time to close, leads converted. */
export function salesFigures(report: SalesReport, money: Money) {
  const decided = report.counts.won + report.counts.lost;
  const converted = report.leads.created === 0 ? null : report.leads.converted / report.leads.created;
  return [
    {
      label: "Win rate",
      value: decided === 0 ? "—" : formatRate(report.winRate),
      note: decided === 0 ? "nothing decided" : `${report.counts.won} of ${decided}`,
      tone: decided > 0 && report.winRate >= 0.5 ? ("success" as const) : undefined,
    },
    {
      label: "Weighted forecast",
      value: money(report.forecast.weighted),
      note: `of ${money(report.forecast.unweighted)} open`,
    },
    {
      label: "Time to close",
      value: report.medianCycleDays === null ? "—" : plural(Math.round(report.medianCycleDays), "day"),
      note: "typical",
    },
    {
      label: "Leads converted",
      value: converted === null ? "—" : formatRate(converted),
      note: `${report.leads.converted} of ${report.leads.created}`,
    },
  ];
}

/** Where deals fall out: each stage, as a share of every deal opened. The leak is marked. */
export function funnelBars(funnel: FunnelStage[]) {
  const leak = leakOf(funnel);
  return funnel.map((stage) => ({
    id: stage.key,
    label: stage.label,
    share: stage.shareOfTotal,
    text: `${formatRate(stage.shareOfTotal)}`,
    tone: leak?.key === stage.key ? ("warning" as const) : null,
  }));
}

/** A day or a week's bucket, as its column is labelled: "12 Oct". */
export function bucketLabel(period: string): string {
  return new Date(`${period}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

type Cell = { text: string; tone?: "success" | "danger" | "warning" | "muted" | null; href?: string | null };

/** By owner or by source: the same columns and the same sums. */
export function groupTable(id: "owner" | "source", rows: GroupedPerformance[], money: Money) {
  const first = id === "owner" ? "Owner" : "Source";
  const sum = (pick: (row: GroupedPerformance) => number) => rows.reduce((total, row) => total + pick(row), 0);
  const won = sum((row) => row.won);
  const lost = sum((row) => row.lost);
  return {
    id,
    label: id === "owner" ? "By owner" : "By source",
    columns: [
      { id: "name", label: first },
      { id: "open", label: "Open", num: true },
      { id: "won", label: "Won", num: true },
      { id: "lost", label: "Lost", num: true },
      { id: "rate", label: "Win rate", num: true },
      { id: "wonValue", label: "Won value", num: true },
      { id: "openValue", label: "Open value", num: true },
    ],
    rows: rows.map((row) => ({
      id: row.key,
      cells: {
        name: { text: row.label },
        open: { text: String(row.open) },
        won: { text: String(row.won) },
        lost: { text: String(row.lost) },
        rate: { text: row.won + row.lost === 0 ? "—" : formatRate(row.winRate) },
        wonValue: { text: money(row.wonValue) },
        openValue: { text: money(row.openValue) },
      } satisfies Record<string, Cell>,
    })),
    total:
      rows.length > 1
        ? {
            label: "Total",
            cells: {
              open: { text: String(sum((row) => row.open)) },
              won: { text: String(won) },
              lost: { text: String(lost) },
              rate: { text: won + lost === 0 ? "—" : formatRate(won / (won + lost)) },
              wonValue: { text: money(sum((row) => row.wonValue)) },
              openValue: { text: money(sum((row) => row.openValue)) },
            } satisfies Record<string, Cell>,
          }
        : null,
    empty: `Nothing to break down by ${first.toLowerCase()} in these dates.`,
  };
}

/** The rep scorecard: what each rep brought in and how fast they answer. */
export function repTable(rows: RepRow[], money: Money) {
  return {
    id: "rep",
    label: "By rep",
    columns: [
      { id: "name", label: "Rep" },
      { id: "leads", label: "Leads", num: true },
      { id: "quotes", label: "Quotes", num: true },
      { id: "rate", label: "Win rate", num: true },
      { id: "invoiced", label: "Invoiced", num: true },
      { id: "collected", label: "Collected", num: true },
      { id: "response", label: "Answers in", num: true },
    ],
    rows: rows.map((row) => ({
      id: row.repId,
      cells: {
        name: { text: row.name, href: `/crm/reps/${row.repId}` },
        leads: { text: String(row.leads) },
        quotes: { text: String(row.quotes) },
        rate: { text: `${row.winRate}%` },
        invoiced: { text: money(row.invoicedAmount) },
        collected: { text: money(row.collectedAmount) },
        response: { text: row.avgResponseHours === null ? "—" : `${row.avgResponseHours}h` },
      } satisfies Record<string, Cell>,
    })),
    total: null,
    empty: "No rep has worked a lead in these dates.",
  };
}

/** Where leads come from, and how many of each became a won deal. */
export function channelTable(rows: ChannelRow[], labels: Record<string, string>, hrefOf: (channel: string) => string) {
  return {
    id: "channel",
    label: "By channel",
    columns: [
      { id: "name", label: "Channel" },
      { id: "leads", label: "Leads", num: true },
      { id: "won", label: "Won", num: true },
      { id: "rate", label: "Converted", num: true },
    ],
    rows: rows.map((row) => ({
      id: row.channel,
      cells: {
        name: { text: labels[row.channel] ?? row.channel, href: hrefOf(row.channel) },
        leads: { text: String(row.leads) },
        won: { text: String(row.won) },
        rate: { text: `${row.conversionRate}%` },
      } satisfies Record<string, Cell>,
    })),
    total: null,
    empty: "No lead channels recorded in these dates.",
  };
}

/** Do something about it: the leak, the deals with no likelihood, the leads nobody turned into a deal. */
export function salesCards(report: SalesReport) {
  const cards: Array<{ key: string; title: string; body: string; action: { label: string; href: string; icon: "pipeline" | "list" | "person" } }> = [];
  const leak = leakOf(report.funnel);
  const before = leak ? stageBefore(report.funnel, leak) : null;
  if (leak && before) {
    cards.push({
      key: "leak",
      title: `Deals stop before ${leak.label}`,
      body: `${formatRate(leak.conversionFromPrevious)} of the deals that reached ${before.label} got there; ${leak.droppedFromPrevious} are still short of it or were lost.`,
      action: { label: "Open the deals", href: "/crm/deals", icon: "pipeline" },
    });
  }
  if (report.forecast.estimated > 0) {
    cards.push({
      key: "likelihood",
      title: `${plural(report.forecast.estimated, "open deal")} with no likelihood`,
      body: `The forecast counts ${report.forecast.estimated === 1 ? "it" : "them"} at the stage’s default until someone sets one.`,
      action: { label: "Set the likelihood", href: "/crm/deals", icon: "list" },
    });
  }
  const unconverted = report.leads.created - report.leads.converted;
  if (unconverted > 0) {
    cards.push({
      key: "leads",
      title: `${plural(unconverted, "lead")} not turned into a deal`,
      body: `Of ${plural(report.leads.created, "lead")} that came in, ${report.leads.converted} became a deal.`,
      action: { label: "Open the leads", href: "/crm/leads", icon: "person" },
    });
  }
  return cards;
}
