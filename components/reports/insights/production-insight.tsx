"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { ButtonLink, Kit } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { PageChrome } from "@/components/layout/page-chrome";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  dayTable,
  goldColumns,
  grams,
  hoursWords,
  productionFigures,
  productionFinding,
  shiftTable,
  siteBars,
  siteTable,
  worstSite,
} from "@/lib/reports/insight-production";
import type { ReportParam, ReportRow } from "@/lib/reports/types";
import { addDays, daysBetween, todayIn } from "@/lib/workspace/format";

import {
  Columns,
  HBars,
  InsightAside,
  InsightBlock,
  InsightEmpty,
  InsightError,
  InsightFrame,
  InsightLoading,
  InsightPage,
  InsightTables,
  PeriodTools,
  widerPeriod,
  type Days,
  type InsightCard,
} from "../insight-page";
import { useInsightAddress } from "./use-period";

const PERIODS = [
  { value: "week", label: "This week" },
  { value: "30d", label: "30 days" },
  { value: "quarter", label: "This quarter" },
] as const;
type Period = (typeof PERIODS)[number]["value"];

type ReportAnswer = { rows: ReportRow[]; report: { params: ReportParam[] } };

/** The days a period covers, ending today: the week from Monday, the quarter from its first day. */
function periodDays(period: Period, today = todayIn()): Days {
  if (period === "week") {
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
    return { from: addDays(today, -((weekday + 6) % 7)), to: today };
  }
  if (period === "quarter") {
    const month = Number(today.slice(5, 7));
    const first = Math.floor((month - 1) / 3) * 3 + 1;
    return { from: `${today.slice(0, 4)}-${String(first).padStart(2, "0")}-01`, to: today };
  }
  return { from: addDays(today, -29), to: today };
}

const rowsOf = (key: string, days: Days, site: string) =>
  fetchJson<ReportAnswer>(`/api/v2/reports/${key}?${new URLSearchParams({ from: days.from, to: days.to, ...(site ? { site } : {}) }).toString()}`);

/**
 * Reports → Insights → Production (PageMineProduction): what the production
 * dashboard (`/dashboard`) showed, over the Plant reports, Downtime and Shift
 * reports reports. The period and the site are in the address.
 */
export function ProductionInsight() {
  const address = useInsightAddress(
    PERIODS.map((entry) => entry.value),
    "30d",
  );
  const site = address.get("site") ?? "";
  const days = address.days ?? periodDays((address.period ?? "30d") as Period);
  const length = daysBetween(days.from, days.to) + 1;
  const prior = { from: addDays(days.from, -length), to: addDays(days.from, -1) };

  const plant = useQuery({ queryKey: ["insight-production", "plant", days, site], queryFn: () => rowsOf("plant", days, site), placeholderData: (previous) => previous });
  const before = useQuery({ queryKey: ["insight-production", "before", prior, site], queryFn: () => rowsOf("plant", prior, site) });
  const downtime = useQuery({ queryKey: ["insight-production", "downtime", days, site], queryFn: () => rowsOf("downtime", days, site) });
  const shifts = useQuery({ queryKey: ["insight-production", "shift", days, site], queryFn: () => rowsOf("shift", days, site) });
  const chain = useQuery({
    queryKey: ["insight-production", "gold-chain"],
    queryFn: () => rowsOf("gold-chain", { from: addDays(todayIn(), -364), to: todayIn() }, ""),
  });

  const chrome = (
    <PageChrome title="Production">
      <Kit contents>
        <ButtonLink href="/reports/plant" icon="reports">
          Open Plant reports
        </ButtonLink>
      </Kit>
    </PageChrome>
  );

  const siteParam = plant.data?.report.params.find((param) => param.key === "site");
  const siteOptions = siteParam?.type === "choice" ? siteParam.options.filter((option) => option.value !== "all") : [];
  const siteName = siteOptions.find((option) => option.value === site)?.label ?? null;
  const tools = (
    <>
      <PeriodTools
        periods={PERIODS}
        period={address.period as Period | null}
        onPeriod={address.setPeriod}
        days={address.days}
        onDays={address.setDays}
        onClearDays={address.clearDays}
      />
      <MenuButton
        className={site ? "chipsel is-set" : "chipsel"}
        icon="filter"
        label="Site"
        items={[
          { key: "all", label: "Every site", checked: !site, onSelect: () => address.set({ site: null }) },
          ...siteOptions.map((option) => ({ key: option.value, label: option.label, checked: option.value === site, onSelect: () => address.set({ site: option.value }) })),
        ]}
      >
        {siteName ?? "Every site"}
      </MenuButton>
    </>
  );

  if (plant.isPending) {
    return (
      <>
        {chrome}
        <InsightFrame>
          <InsightLoading />
        </InsightFrame>
      </>
    );
  }
  if (plant.isError || !plant.data) {
    return (
      <>
        {chrome}
        <InsightFrame>
          <InsightPage tools={tools}>
            <InsightError
              message={`${getApiErrorMessage(plant.error, "Check the connection and try again.")} Production is for whoever can open the plant reports; a manager can tell you who that is.`}
              onRetry={() => void plant.refetch()}
            />
          </InsightPage>
        </InsightFrame>
      </>
    );
  }

  const facts = { plant: plant.data.rows, before: before.data?.rows ?? null, downtime: downtime.data?.rows ?? [], shifts: shifts.data?.rows ?? [] };
  const gold = goldColumns(facts.plant, days.from, days.to);
  const siteId = (name: string) => siteOptions.find((option) => option.label === name)?.value ?? null;
  const tables = [
    siteTable(facts.plant, (name) => {
      const id = siteId(name);
      return `/reports/plant?${new URLSearchParams({ from: days.from, to: days.to, ...(id ? { site: id } : {}) }).toString()}`;
    }),
    shiftTable(facts.shifts, facts.downtime),
    dayTable(facts.plant),
  ];

  const cards: InsightCard[] = [];
  const worst = worstSite(facts.downtime);
  if (worst) {
    const id = siteId(worst.site);
    cards.push({
      key: "down",
      title: `${worst.site} lost ${hoursWords(worst.hours)} hours`,
      body: worst.cause ? `${worst.cause} ${hoursWords(worst.causeHours)} hours of it, ${worst.stops === 1 ? "once" : `${worst.stops} times`}.` : null,
      action: { label: "Open Downtime", icon: "reports", href: `/reports/downtime?${new URLSearchParams({ from: days.from, to: days.to, ...(id ? { site: id } : {}) }).toString()}` },
    });
  }
  const waiting = facts.plant.filter((row) => row.status === "Submitted");
  if (waiting.length) {
    cards.push({
      key: "approve",
      title: `${waiting.length} plant ${waiting.length === 1 ? "report waits" : "reports wait"} for approval`,
      body: "Approved, their gold and hours count on the gold chain and in the books.",
      action: { label: "See the plant reports", icon: "list", href: "/plant-report" },
    });
  }
  const unsold = (chain.data?.rows ?? []).filter((row) => row.stage !== "Settled");
  if (unsold.length) {
    const held = unsold.reduce((total, row) => total + (typeof row.grams === "number" ? row.grams : 0), 0);
    cards.push({
      key: "unsold",
      title: `${unsold.length} ${unsold.length === 1 ? "bar is" : "bars are"} not sold`,
      body: `${grams(held)} between them.`,
      action: { label: "Open the gold chain", icon: "reports", href: "/reports/gold-chain" },
    });
  }

  const view = address.get("view") ?? "site";
  const aside = <InsightAside cards={cards} send={{ words: "Plant reports, the report under this page, as a PDF or a spreadsheet, on the days you choose.", href: "/reports/plant?send=1" }} />;
  if (facts.plant.length === 0) {
    const empty = productionFinding(facts);
    const wider = widerPeriod(PERIODS, (address.period ?? "30d") as Period, Boolean(address.days));
    return (
      <>
        {chrome}
        <InsightFrame>
          <InsightPage tools={tools} aside={aside}>
            <InsightEmpty icon="reports" title={empty.fact} wider={wider ? { label: wider.label, onShow: () => address.setPeriod(wider.value) } : null}>
              {empty.rest}
            </InsightEmpty>
          </InsightPage>
        </InsightFrame>
      </>
    );
  }
  return (
    <>
      {chrome}
      <InsightFrame>
        <InsightPage
          tools={tools}
          finding={productionFinding(facts)}
          figures={productionFigures(facts)}
          aside={aside}
        >
          <div className={plant.isFetching ? "rp-blocks is-fetching" : "rp-blocks"}>
            <div className="rp-grid2">
              <div>
                <InsightBlock title={gold.title} sum="grams">
                  <Columns
                    columns={gold.columns.map((column) => ({ label: column.label, parts: [{ value: column.value, color: "var(--color-accent)", title: `${column.label}, ${grams(column.value)}` }] }))}
                    labels={gold.columns.map((column) => column.label)}
                    empty="No gold was recovered in these dates."
                  />
                </InsightBlock>
              </div>
              <div>
                <InsightBlock title="Where is the gold coming from?" sum="gold recovered, by site">
                  <HBars rows={siteBars(facts.plant)} empty="No plant report in these dates." />
                </InsightBlock>
              </div>
            </div>
            <InsightTables tables={tables} value={view} onChange={(next) => address.set({ view: next === "site" ? null : next })} />
          </div>
        </InsightPage>
      </InsightFrame>
    </>
  );
}
