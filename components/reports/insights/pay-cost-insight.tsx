"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { ButtonLink, Kit } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { PageChrome } from "@/components/layout/page-chrome";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  departmentBars,
  departments,
  departmentTable,
  gradeTable,
  grades,
  inMonths,
  itemTable,
  monthColumns,
  monthsOf,
  monthWords,
  payFigures,
  payFinding,
} from "@/lib/reports/insight-pay-cost";
import type { ReportRow } from "@/lib/reports/types";
import { todayIn } from "@/lib/workspace/format";

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
  type InsightCard,
} from "../insight-page";
import { useInsightAddress } from "./use-period";

const PERIODS = [
  { value: "month", label: "This month" },
  { value: "3m", label: "3 months" },
  { value: "year", label: "This year" },
] as const;
type Period = (typeof PERIODS)[number]["value"];

const monthKey = (day: string) => day.slice(0, 7);
/** The month `n` months before `key` ("2026-10", 1 → "2026-09"). */
function monthBefore(key: string, n: number): string {
  const [year, month] = key.split("-").map(Number) as [number, number];
  const at = new Date(Date.UTC(year, month - 1 - n, 1));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
}
function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let key = from; key <= to && out.length < 120; key = monthBefore(key, -1)) out.push(key);
  return out;
}

const rowsOf = (key: string, from: string, to: string) =>
  fetchJson<{ rows: ReportRow[] }>(`/api/v2/reports/${key}?${new URLSearchParams({ from, to }).toString()}`);

/**
 * Reports → Insights → Pay cost (PagePayCost): what each run costs the
 * employer, where it goes and what moved, over the Pay by employee, Statutory
 * and Employees reports. The period and the department are in the address.
 */
export function PayCostInsight() {
  const address = useInsightAddress(
    PERIODS.map((entry) => entry.value),
    "month",
  );
  const department = address.get("department") ?? "";
  const today = todayIn();
  const thisMonth = monthKey(today);
  const months = address.days
    ? monthsBetween(monthKey(address.days.from), monthKey(address.days.to))
    : address.period === "3m"
      ? monthsBetween(monthBefore(thisMonth, 2), thisMonth)
      : address.period === "year"
        ? monthsBetween(`${thisMonth.slice(0, 4)}-01`, thisMonth)
        : [thisMonth];
  const priorMonths = address.period === "year" && !address.days ? [] : months.map((month) => monthBefore(month, months.length));
  const earliest = [monthBefore(thisMonth, 12), ...priorMonths, ...months].sort()[0]!;
  const from = `${earliest}-01`;

  const pay = useQuery({ queryKey: ["insight-pay-cost", "pay", from, today], queryFn: () => rowsOf("payroll-pay", from, today), placeholderData: (previous) => previous });
  const statutory = useQuery({ queryKey: ["insight-pay-cost", "statutory", from, today], queryFn: () => rowsOf("payroll-statutory", from, today) });
  const people = useQuery({ queryKey: ["insight-pay-cost", "people"], queryFn: () => fetchJson<{ rows: ReportRow[] }>("/api/v2/reports/people-register") });

  const chrome = (
    <PageChrome title="Pay cost">
      <Kit contents>
        <ButtonLink href="/reports/payroll-pay" icon="reports">
          Open Pay by employee
        </ButtonLink>
      </Kit>
    </PageChrome>
  );

  const all = pay.data?.rows ?? [];
  const departmentNames = [...new Set(all.map((row) => (typeof row.department === "string" ? row.department : null)).filter((name): name is string => Boolean(name)))].sort();
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
        className={department ? "chipsel is-set" : "chipsel"}
        icon="filter"
        label="Department"
        items={[
          { key: "", label: "Every department", checked: !department, onSelect: () => address.set({ department: null }) },
          ...departmentNames.map((name) => ({ key: name, label: name, checked: name === department, onSelect: () => address.set({ department: name }) })),
        ]}
      >
        {department || "Every department"}
      </MenuButton>
    </>
  );

  if (pay.isPending) {
    return (
      <>
        {chrome}
        <InsightFrame>
          <InsightLoading />
        </InsightFrame>
      </>
    );
  }
  if (pay.isError || !pay.data) {
    return (
      <>
        {chrome}
        <InsightFrame>
          <InsightPage tools={tools}>
            <InsightError
              message={`${getApiErrorMessage(pay.error, "Check the connection and try again.")} Pay cost is for whoever can open the pay runs; a manager can tell you who that is.`}
              onRetry={() => void pay.refetch()}
            />
          </InsightPage>
        </InsightFrame>
      </>
    );
  }

  const scoped = department ? all.filter((row) => row.department === department) : all;
  const now = inMonths(scoped, months);
  const before = priorMonths.length ? inMonths(scoped, priorMonths) : null;
  const stat = inMonths((statutory.data?.rows ?? []).filter((row) => !department || row.department === department), months);
  const label = months.length === 1 ? monthWords(months[0]!) : `${monthWords(months[0]!)} to ${monthWords(months[months.length - 1]!)}`;
  const against = priorMonths.length === 1 ? monthWords(priorMonths[0]!) : null;
  const due = `due 10 ${monthWords(monthBefore(months[months.length - 1]!, -1))}`;
  const byDepartment = departments(now, before);
  const chartMonths = monthsOf(scoped).slice(-6);

  const tables = [
    departmentTable(byDepartment, against, (name) => `/reports/payroll-pay?department=${encodeURIComponent(name)}`),
    gradeTable(grades(now, before), against),
    itemTable(stat),
  ];

  const cards: InsightCard[] = [];
  const staff = people.data?.rows ?? [];
  const firstDay = `${months[0]}-01`;
  const joined = staff.filter((row) => typeof row.hired === "string" && row.hired >= firstDay && (!department || row.department === department));
  if (joined.length) {
    const places = [...new Set(joined.map((row) => row.department ?? "no department"))];
    cards.push({
      key: "joined",
      title: `${joined.length} ${joined.length === 1 ? "person" : "people"} joined${places.length === 1 ? ` ${places[0]}` : ""}`,
      body: "Their first pay is in the run for the month they joined.",
      action: { label: "Open the run", icon: "run", href: "/payroll/runs" },
    });
  }
  const noNssa = staff.filter((row) => row.nssa === "Missing" && (!department || row.department === department));
  if (noNssa.length) {
    cards.push({
      key: "nssa",
      title: `${noNssa.length} ${noNssa.length === 1 ? "person has" : "people have"} no NSSA number`,
      body: "The NSSA schedule cannot list them until they do.",
      action: { label: "See who", icon: "users", href: "/reports/people-register" },
    });
  }

  const view = address.get("view") ?? "department";
  const aside = <InsightAside cards={cards} send={{ words: "Pay by employee, the report under this page, as a PDF or a spreadsheet, on the days you choose.", href: "/reports/payroll-pay?send=1" }} />;
  if (now.length === 0) {
    const empty = payFinding(now, before, label);
    const wider = widerPeriod(PERIODS, (address.period ?? "month") as Period, Boolean(address.days));
    return (
      <>
        {chrome}
        <InsightFrame>
          <InsightPage tools={tools} aside={aside}>
            <InsightEmpty icon="payments" title={empty.fact} wider={wider ? { label: wider.label, onShow: () => address.setPeriod(wider.value) } : null}>
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
          finding={payFinding(now, before, label)}
          figures={payFigures(now, before, stat, due)}
          aside={aside}
        >
          <div className={pay.isFetching ? "rp-blocks is-fetching" : "rp-blocks"}>
            <div className="rp-grid2">
              <div>
                <InsightBlock title="Employer cost, by month" sum="$ thousands">
                  <Columns columns={monthColumns(scoped, chartMonths)} labels={chartMonths.map((month) => monthWords(month).slice(0, 3))} empty="No pay run yet." />
                </InsightBlock>
              </div>
              <div>
                <InsightBlock title="Where does it go?" sum="employer cost, by department">
                  <HBars rows={departmentBars(byDepartment)} empty="No pay run in these dates." />
                </InsightBlock>
              </div>
            </div>
            <InsightTables tables={tables} value={view} onChange={(next) => address.set({ view: next === "department" ? null : next })} />
          </div>
        </InsightPage>
      </InsightFrame>
    </>
  );
}

