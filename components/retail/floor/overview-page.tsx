"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { ActionList } from "@/components/dashboard-frame/action-list";
import { BarChart } from "@/components/dashboard-frame/bar-chart";
import { DashboardFrame, DashSkeleton } from "@/components/dashboard-frame/dashboard-frame";
import { HeroKpi } from "@/components/dashboard-frame/hero-kpi";
import { KpiTile } from "@/components/dashboard-frame/kpi-tile";
import { Panel } from "@/components/dashboard-frame/panel";
import { PeriodToolbar } from "@/components/dashboard-frame/period-toolbar";
import { RankList } from "@/components/dashboard-frame/rank-list";
import { ShareBar } from "@/components/dashboard-frame/share-bar";
import { StatusList } from "@/components/dashboard-frame/status-list";
import type { DashTone, SeriesColor } from "@/components/dashboard-frame/types";
import { PageChrome, type PagePrimary } from "@/components/layout/page-chrome";
import { useHomeLink } from "@/components/layout/role-refusal";
import { LoadError, Refusal } from "@/components/list-frame/list-states";
import type { StateTone } from "@/components/workspace/state-badge";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { OverviewPeriod, OverviewResponse, PaidKey, TillNow } from "@/lib/retail/floor/overview";
import { formatMoney, formatSigned } from "@/lib/workspace/format";

/**
 * Overview (50-floor W-51, FLR-08; board Floor): the owner's morning look.
 * Takings against the same time last week, sales, basket and margin; what
 * needs somebody; the tills as they stand; the last 30 days; how people
 * paid; and the three rank lists. Period and site live in the address
 * (`?period=week&site=<id>|all`); the figures refresh every minute.
 */

const PERIODS: ReadonlyArray<{ value: OverviewPeriod; label: string }> = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
];

const PAID_COLORS: Record<PaidKey, SeriesColor> = { cash: "s1", ecocash: "s2", card: "s3", zig: "s4", other: "muted" };
const TILL_TONES: Record<TillNow["state"], StateTone> = { OPEN: "info", STALE: "warn", OFFLINE: "neutral", CLOSED: "hollow" };

const money = (value: string | number) => formatMoney(Number(value));
const tone = (value: number | null, goodWhenUp = true): DashTone | null =>
  value === null || value === 0 ? null : value > 0 === goodWhenUp ? "ok" : "bad";
const NOTHING = "Nothing to compare with yet";

/** "+11", "−4": a count's change. */
function signedCount(value: number) {
  return value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "0";
}

/** "+8.2%", "−3.1%". */
function signedPct(value: number) {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(1)}%`;
}

export function OverviewPage() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const requested = searchParams.get("period");
  const period = PERIODS.find((entry) => entry.value === requested)?.value ?? "today";
  const site = searchParams.get("site");
  const home = useHomeLink();

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value === null) next.delete(key);
    else next.set(key, value);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const query = useQuery({
    queryKey: ["retail-overview", period, site],
    queryFn: async () => {
      const params = new URLSearchParams({ period });
      if (site) params.set("siteId", site);
      return (await fetchJson<{ data: OverviewResponse }>(`/api/v2/retail/overview?${params.toString()}`)).data;
    },
    refetchInterval: 60_000,
    placeholderData: (previous) => previous,
    retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
  });
  const view = query.data;

  const primary = React.useMemo<PagePrimary | null>(
    () => (view?.can.openShift ? { label: "Open shift", icon: "plus", sheet: "shift-open" } : null),
    [view?.can.openShift],
  );

  if (query.isError && !view) {
    const error = query.error;
    const refused = error instanceof ApiError && error.status === 403;
    return (
      <>
        <PageChrome title="Overview" />
        {refused ? (
          <Refusal noun="the overview" sentence={getApiErrorMessage(error).replace(/\.$/, "")} back={home} />
        ) : (
          <LoadError noun="overview" message={getApiErrorMessage(error)} onRetry={() => void query.refetch()} />
        )}
      </>
    );
  }

  const toolbar = (
    <PeriodToolbar
      wrap
      periods={PERIODS}
      period={period}
      onPeriodChange={(value) => setParam("period", value === "today" ? null : value)}
      site={
        view && view.sites.length > 1
          ? {
              value: view.site?.id ?? "all",
              label: view.site?.name ?? "All sites",
              options: [...view.sites.map((entry) => ({ value: entry.id, label: entry.name })), { value: "all", label: "All sites" }],
              onChange: (value: string) => setParam("site", value),
            }
          : null
      }
      live={view?.updatedAt ?? null}
    />
  );

  return (
    <>
      <PageChrome title="Overview" primary={primary} />
      <DashboardFrame variant="overview" label="Overview" toolbar={toolbar}>
        {view ? <Tiles view={view} /> : <Loading />}
      </DashboardFrame>
    </>
  );
}

function Loading() {
  return (
    <>
      <div className="cx-df-span-6">
        <DashSkeleton height={250} />
      </div>
      {[0, 1, 2].map((index) => (
        <div key={index} className="cx-df-span-2">
          <DashSkeleton height={250} />
        </div>
      ))}
      <div className="cx-df-span-7">
        <DashSkeleton height={320} />
      </div>
      <div className="cx-df-span-5">
        <DashSkeleton height={320} />
      </div>
    </>
  );
}

function Tiles({ view }: { view: OverviewResponse }) {
  const { tiles } = view;
  const words = view.period === "today" ? "today" : view.period === "week" ? "this week" : "this month";
  const takings = tiles.takings;
  const delta = takings.against.deltaPct;
  const kpiSpan = tiles.margin ? 2 : 3;
  const sevenDays = tiles.byDay.days.slice(-7).map((day) => day.label);
  const lastDay = tiles.byDay.days.length - 1;
  const empty = `Nothing yet ${words}.`;

  return (
    <>
      <HeroKpi
        label={takings.label}
        value={money(takings.value)}
        delta={delta === null ? null : { text: signedPct(delta), tone: tone(delta) }}
        comparison={delta === null ? NOTHING : `${takings.against.label} (${money(takings.against.value)})`}
        points={takings.labels.map((label, index) => ({ label, now: takings.series[index] ?? null, before: takings.compare[index] ?? null }))}
        format={(value) => formatMoney(value)}
        axis={takings.axis}
        nowLabel={takings.legend[0]}
        beforeLabel={takings.legend[1]}
        chartLabel={`${takings.label} by ${view.period === "today" ? "hour" : "day"}, against ${takings.legend[1].toLowerCase()}`}
      />
      <KpiTile
        span={kpiSpan}
        label="Sales"
        value={tiles.sales.value.toLocaleString("en-US")}
        delta={tiles.sales.delta === null ? null : { text: signedCount(tiles.sales.delta), tone: tone(tiles.sales.delta) }}
        note={tiles.sales.delta === null ? NOTHING : tiles.sales.deltaLabel}
        bars={tiles.sales.bars}
        barLabels={tiles.sales.bars.map((bar, index) => `${sevenDays[index]} · ${bar}`)}
      />
      <KpiTile
        span={kpiSpan}
        label="Average basket"
        value={money(tiles.basket.value)}
        delta={tiles.basket.delta === null ? null : { text: formatSigned(Number(tiles.basket.delta)), tone: tone(Number(tiles.basket.delta)) }}
        note={tiles.basket.delta === null ? NOTHING : tiles.basket.deltaLabel}
        bars={tiles.basket.bars}
        barLabels={tiles.basket.bars.map((bar, index) => `${sevenDays[index]} · ${formatMoney(bar)}`)}
      />
      {tiles.margin ? (
        <KpiTile
          span={kpiSpan}
          label="Gross margin"
          value={`${tiles.margin.valuePct.toFixed(1)}%`}
          delta={
            tiles.margin.deltaPts === null
              ? null
              : {
                  text: `${tiles.margin.deltaPts > 0 ? "+" : tiles.margin.deltaPts < 0 ? "−" : ""}${Math.abs(tiles.margin.deltaPts).toFixed(1)} pts`,
                  tone: tone(tiles.margin.deltaPts),
                }
          }
          note={tiles.margin.deltaPts === null ? NOTHING : tiles.margin.deltaLabel}
          bars={tiles.margin.bars}
          barLabels={tiles.margin.bars.map((bar, index) => `${sevenDays[index]} · ${bar.toFixed(1)}%`)}
        />
      ) : null}

      <Panel
        span={7}
        title="Needs action"
        count={tiles.needsAction.length > 0 ? { value: tiles.needsAction.length, tone: "bad" } : null}
        empty={tiles.needsAction.length === 0 ? "Nothing needs you right now." : null}
      >
        <ActionList
          items={tiles.needsAction.map((row) => ({
            id: row.key + row.href,
            href: row.href,
            title: row.title,
            meta: row.meta,
            figure: row.figure,
            figureTone: row.figureTone === "ink" ? null : row.figureTone,
            dot: row.tone,
          }))}
        />
      </Panel>
      <Panel
        span={5}
        title="Tills now"
        count={{ value: tiles.tillsNow.length }}
        link={{ href: "/retail/shifts", label: "Shifts" }}
        empty={tiles.tillsNow.length === 0 ? "No till has opened today." : null}
      >
        <StatusList
          items={tiles.tillsNow.map((till) => ({
            id: till.id,
            href: till.href,
            name: till.name,
            state: { tone: TILL_TONES[till.state], label: till.stateLabel },
            figure: money(till.takings),
            meta: till.meta,
            sub: `${till.sales.toLocaleString("en-US")} ${till.sales === 1 ? "sale" : "sales"}`,
          }))}
        />
      </Panel>

      <Panel span={8} title="Takings by day" qualifier="last 30 days" figure={money(tiles.byDay.total)}>
        <BarChart
            label="Takings by day, last 30 days"
            bars={tiles.byDay.days.map((day, index) => ({
              label: index === lastDay ? `${day.label} · so far` : day.label,
              value: Number(day.value),
              text: money(day.value),
              sub: `${day.sales.toLocaleString("en-US")} ${day.sales === 1 ? "sale" : "sales"}`,
            }))}
            xLabels={[0, 7, 14, 21, lastDay].map((index) => tiles.byDay.days[index]?.label.replace(/^\w+ /, "") ?? "")}
          />
      </Panel>
      <Panel
        span={4}
        title={`How people paid ${words}`}
        empty={tiles.paid.every((part) => Number(part.value) === 0) ? empty : null}
      >
        <ShareBar
            parts={tiles.paid.map((part) => ({
              key: part.key,
              label: part.name,
              value: money(part.value),
              share: part.share / 100,
              color: PAID_COLORS[part.key],
            }))}
          />
      </Panel>

      <Panel
        span={4}
        title="Top products"
        qualifier={words}
        link={{ href: "/retail/sales", label: "Sales" }}
        empty={tiles.topProducts.length === 0 ? empty : null}
      >
        <RankList
          head={["Product", "Takings"]}
          rows={tiles.topProducts.map((row) => ({
            id: row.productId || row.name,
            name: row.name,
            href: row.productId ? `/retail/products/${row.productId}` : undefined,
            value: money(row.takings),
            share: row.pct,
            meta: row.qtyLabel,
          }))}
        />
      </Panel>
      {tiles.toReorder ? (
        <Panel
          span={4}
          title="Stock to reorder"
          qualifier="below level"
          link={{ href: "/retail/stock?tab=below", label: "Stock" }}
          empty={tiles.toReorder.length === 0 ? "Nothing is low." : null}
        >
          <RankList
            head={["Product", "On hand"]}
            rows={tiles.toReorder.map((row) => ({
              id: row.productId,
              name: row.name,
              href: `/retail/products/${row.productId}`,
              value: row.onHandLabel,
              share: row.pct,
              barTone: row.low ? "warn" : null,
              meta: row.meta,
            }))}
          />
        </Panel>
      ) : null}
      <Panel
        span={tiles.toReorder ? 4 : 8}
        title="Cashiers"
        qualifier="this week"
        link={{ href: "/retail/shifts", label: "Shifts" }}
        empty={tiles.cashiers.length === 0 ? "Nothing yet this week." : null}
      >
        <RankList
          head={["Cashier", "Takings"]}
          rows={tiles.cashiers.map((row) => ({
            id: row.userId,
            name: row.name,
            value: money(row.takings),
            share: row.pct,
            meta: row.meta,
          }))}
        />
      </Panel>
    </>
  );
}
