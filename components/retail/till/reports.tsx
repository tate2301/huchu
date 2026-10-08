"use client";

/**
 * Reports: my sales today, the finding first and one chart; for whoever keeps
 * the cash, the till's end-of-day report, frozen when taken. One report a till
 * a day, in the shop's base currency: ZiG cash is counted at each sale's rate,
 * and bottle deposits are held apart from the takings.
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ChartBar, Printer, Receipt } from "@/lib/icons";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { SHOP_TIME_ZONE } from "@/lib/retail/shop-profile-rules";
import type { RetailZReportPayload } from "@/lib/retail/z-report";
import { count, hhmm, TENDER_LABEL, usd, weekdayDayMonth, whole } from "./format";
import { Empty, ErrorLine, Segmented } from "./parts";
import { useTill } from "./state";
import { TenderMark } from "./pay-tray";

type SaleWithLines = {
  id: string;
  saleType: string;
  status: string;
  postedAt: string;
  totalAmount: number;
  lines?: Array<{ itemName: string; quantity: number | string; lineTotal: number | string }>;
};

type ZDay = {
  /** The trading day as the server keys it: today's report is found by this, not by the till's clock. */
  data: { businessDate: string };
  /** The reports taken, newest first. */
  recent: Array<{ id: string; registerCode: string; businessDate: string }>;
};

/** The finding counts shifts in words: "Two shifts". */
const SHIFT_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];

function shopDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SHOP_TIME_ZONE }).format(date);
}

export function ReportsScreen() {
  const { data: session } = useSession();
  // The end-of-day report is cash control's: the same right the report itself asks for.
  const keepsCash = canRetailRoleDo(session?.user?.role, "retail.cash-control", "view");
  const [tab, setTab] = React.useState<"mine" | "day">("mine");
  return (
    <div className="main is-scroll">
      {keepsCash ? (
        <div className="tools is-tabs-row">
          <div
            className="tabs is-flat"
            role="tablist"
            aria-label="Reports"
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              const next = tab === "mine" ? "day" : "mine";
              setTab(next);
              (event.currentTarget.querySelector(`[data-tab="${next}"]`) as HTMLButtonElement | null)?.focus();
            }}
          >
            <button type="button" className="tab" role="tab" data-tab="mine" aria-selected={tab === "mine"} tabIndex={tab === "mine" ? 0 : -1} onClick={() => setTab("mine")}>
              My sales
            </button>
            <button type="button" className="tab" role="tab" data-tab="day" aria-selected={tab === "day"} tabIndex={tab === "day" ? 0 : -1} onClick={() => setTab("day")}>
              End of day
            </button>
          </div>
        </div>
      ) : null}
      {tab === "day" && keepsCash ? <EndOfDay /> : <MySales />}
    </div>
  );
}

function MySales() {
  const [period, setPeriod] = React.useState<"today" | "week">("today");
  const from = React.useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    if (period === "week") start.setDate(start.getDate() - 6);
    return start.toISOString();
  }, [period]);
  const query = useQuery({
    queryKey: ["retail-pos-sales", "mine-report", period],
    queryFn: () => fetchJson<{ data: SaleWithLines[] }>(`/api/v2/retail/pos/sales?scope=mine&limit=200&from=${encodeURIComponent(from)}`),
  });
  const sales = React.useMemo(
    () => (query.data?.data ?? []).filter((sale) => sale.saleType === "SALE" && sale.status !== "VOIDED"),
    [query.data],
  );
  const total = sales.reduce((sum, sale) => sum + sale.totalAmount, 0);

  const buckets = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const sale of sales) {
      const key = period === "today" ? hhmm(sale.postedAt).slice(0, 2) : shopDay(new Date(sale.postedAt));
      map.set(key, (map.get(key) ?? 0) + sale.totalAmount);
    }
    if (period === "today") {
      const hours = [...map.keys()].map(Number);
      const first = Math.min(8, ...hours);
      const last = Math.max(first + 6, ...hours);
      return Array.from({ length: last - first + 1 }, (_, index) => {
        const hour = String(first + index).padStart(2, "0");
        return { key: hour, label: `${hour}:00`, value: map.get(hour) ?? 0 };
      });
    }
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date();
      day.setDate(day.getDate() - (6 - index));
      const key = shopDay(day);
      return { key, label: new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(day), value: map.get(key) ?? 0 };
    });
  }, [sales, period]);
  const peak = buckets.reduce((best, bucket) => (bucket.value > best.value ? bucket : best), buckets[0] ?? { key: "", label: "", value: 0 });
  const max = Math.max(peak?.value ?? 0, 1);

  const sold = React.useMemo(() => {
    const map = new Map<string, { quantity: number; amount: number }>();
    for (const sale of sales) {
      for (const line of sale.lines ?? []) {
        const entry = map.get(line.itemName) ?? { quantity: 0, amount: 0 };
        entry.quantity += Number(line.quantity);
        entry.amount += Number(line.lineTotal);
        map.set(line.itemName, entry);
      }
    }
    return [...map.entries()].sort((a, b) => b[1].amount - a[1].amount).slice(0, 5);
  }, [sales]);

  return (
    <>
      <div className="bar">
        <h1>{period === "today" ? "My sales today" : "My sales this week"}</h1>
        <div className="end">
          <Segmented
            label="Period"
            value={period}
            options={[
              { value: "today", label: "Today" },
              { value: "week", label: "Last 7 days" },
            ]}
            onChange={setPeriod}
          />
        </div>
      </div>
      {query.isLoading ? (
        <div className="finding" aria-busy="true">
          <span className="skeleton is-lede" />
        </div>
      ) : query.isError ? (
        <Empty icon={ChartBar} title="Your sales did not load">
          {getApiErrorMessage(query.error)}
        </Empty>
      ) : !sales.length ? (
        <Empty icon={ChartBar} title={period === "today" ? "No sales yet today" : "No sales this week"}>
          What you sell shows here, by the hour.
        </Empty>
      ) : (
        <section className="report-body">
          <p className="lede-figure">
            <span className="num">{usd(total)}</span> from your {count(sales.length, "sale")} {period === "today" ? "today" : "this week"}.{" "}
            {peak && peak.value > 0 ? (
              <span className="q">
                {period === "today" ? `Busiest between ${peak.label} and ${String(Number(peak.key) + 1).padStart(2, "0")}:00.` : `Busiest on ${peak.label}.`}
              </span>
            ) : null}
          </p>
          <div>
            <h2 className="sec-title">{period === "today" ? "By the hour" : "By the day"}</h2>
            <div role="img" aria-label={`Sales ${period === "today" ? "by hour" : "by day"}. ${peak.label} was busiest at ${usd(peak.value)}.`}>
              <div className="cols">
                {buckets.map((bucket) => (
                  <div key={bucket.key} className={`col${bucket.key === peak.key ? " is-now" : ""}`}>
                    {bucket.key === peak.key ? (
                      <span className="v">
                        {usd(bucket.value)}
                      </span>
                    ) : null}
                    <i style={{ height: `${(bucket.value / max) * 90}%` }} />
                  </div>
                ))}
              </div>
              <div className="cols-x">
                {buckets.map((bucket) => (
                  <span key={bucket.key} className={bucket.key === peak.key ? "is-now" : undefined}>
                    {bucket.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
          {sold.length ? (
            <div>
              <h2 className="sec-title">Sold most</h2>
              <div className="list">
                {sold.map(([name, entry]) => (
                  <div key={name} className="row is-split">
                    <span className="grow">{name}</span>
                    <span className="muted num">{Number(entry.quantity.toFixed(3))} sold</span>
                    <span className="num ink width-96">
                      {usd(entry.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      )}
    </>
  );
}

function EndOfDay() {
  const { context } = useTill();
  // The reports already taken, with today's trading day as the server keys it, so the till and the report agree
  // on what "today" is. A till's report is taken when a manager closes the day (End of day, FLR-07).
  const dayQuery = useQuery({
    queryKey: ["retail-z-report-day"],
    queryFn: () => fetchJson<ZDay>("/api/v2/retail/z-reports"),
  });
  const taken =
    (dayQuery.data?.recent ?? []).find((entry) => entry.registerCode === context?.till.code && entry.businessDate === dayQuery.data?.data.businessDate) ?? null;
  const reportQuery = useQuery({
    queryKey: ["retail-z-report", taken?.id ?? null],
    enabled: Boolean(taken),
    queryFn: async () => (await fetchJson<{ data: RetailZReportPayload }>(`/api/v2/retail/z-reports/${taken?.id}`)).data,
  });
  const report = reportQuery.data;

  if (dayQuery.isLoading || reportQuery.isLoading) {
    return (
      <div className="finding" aria-busy="true">
        <span className="skeleton is-lede" />
      </div>
    );
  }
  if (dayQuery.isError) {
    return <ErrorLine>{getApiErrorMessage(dayQuery.error)}</ErrorLine>;
  }
  if (!report) {
    return (
      <Empty icon={Receipt} title={`${context?.till.name ?? "This till"}’s end-of-day report is not taken yet`}>
        It is taken when a manager closes the day in End of day, once every drawer is counted and closed.
      </Empty>
    );
  }

  const short = report.shifts.filter((shift) => Number(shift.variance ?? 0) < -0.004);
  const shiftsLead = `${report.shiftCount < SHIFT_WORDS.length ? SHIFT_WORDS[report.shiftCount] : whole(report.shiftCount)} shifts`;
  const finding =
    report.shiftCount === 1
      ? short.length
        ? `The drawer was ${usd(-Number(short[0].variance))} short.`
        : "The drawer balanced."
      : short.length
        ? `${shiftsLead}; ${short.map((shift) => `${shift.cashierName.split(" ")[0]}’s drawer was ${usd(-Number(shift.variance))} short`).join(", ")}.`
        : `${shiftsLead}, every drawer balanced.`;
  const maxShare = Math.max(...report.tenderBreakdown.map((line) => Number(line.amount)), 1);

  return (
    <>
      <div className="bar">
        <h1>End of day</h1>
        <span className="note muted">
          {report.registerName} · {weekdayDayMonth(`${report.businessDate.slice(0, 10)}T12:00:00Z`)} · <span className="num">{report.reportNo}</span>
        </span>
        <div className="end">
          <span className="note muted">
            Taken at {hhmm(report.generatedAt)}
            {report.generatedByName ? ` by ${report.generatedByName}` : ""}
          </span>
          <a className="btn" href={`/api/v2/retail/z-reports/${report.id}?format=csv`}>
            <Receipt className="ic" />
            Save as a spreadsheet
          </a>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            <Printer className="ic" />
            Print the report
          </button>
        </div>
      </div>
      <div className="with-rail">
        <section className="report-body">
          <p className="lede-figure">
            <span className="num">{usd(report.grossTakings + report.depositTotal)}</span> taken on {report.registerName}. <span className="q">{finding}</span>
          </p>
          <div>
            <h2 className="sec-title">How people paid</h2>
            {report.tenderBreakdown.map((line) => (
              <div key={line.tenderType} className="share">
                <TenderMark tender={line.tenderType} single />
                <span className="who-head">
                  <span className="width-112">{TENDER_LABEL[line.tenderType] ?? line.tenderType}</span>
                  <span className="grow">
                    <span className="bar" aria-hidden="true" style={{ width: `${(Number(line.amount) / maxShare) * 100}%` }} />
                  </span>
                </span>
                <span className="num pct">{Math.round(Number(line.share))}%</span>
                <span className="num">{usd(Number(line.amount))}</span>
              </div>
            ))}
            {context?.zig ? <p className="help">Cash includes ZiG notes, at the rate on each sale.</p> : null}
          </div>
          <div>
            <h2 className="sec-title">The drawers</h2>
            <div className="list">
              {report.shifts.map((shift) => {
                const variance = Number(shift.variance ?? 0);
                return (
                  <div key={shift.shiftId} className="row is-shift-line">
                    <span className="code num text-left">
                      {shift.shiftNo}
                    </span>
                    <span className="truncate ink">
                      {shift.cashierName}, {hhmm(shift.openedAt)} to {shift.closedAt ? hhmm(shift.closedAt) : "now"}
                    </span>
                    <span className={`status${variance < -0.004 ? " status-danger" : variance > 0.004 ? " status-warning" : ""}`}>
                      {variance < -0.004 ? "Short" : variance > 0.004 ? "Over" : "Balanced"}
                    </span>
                    <span className="num ink">
                      {usd(variance)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
        <aside className="rail" aria-label="The figures">
          <section>
            <div className="sec-title">Takings</div>
            <dl className="attrs">
              <dt>Before discounts</dt>
              <dd className="num text-left">
                {usd(report.grossSales)}
              </dd>
              <dt>Discounts</dt>
              <dd className="num text-left">
                {usd(report.discountTotal)}
                {report.approvedDiscountCount ? `, ${report.approvedDiscountCount} approved` : ""}
              </dd>
              <dt>VAT at {report.taxRatePercent}%</dt>
              <dd className="num text-left">
                {usd(report.taxTotal)}
              </dd>
              {report.depositTotal ? (
                <>
                  <dt>Deposits held</dt>
                  <dd className="num text-left">
                    {usd(report.depositTotal)}
                  </dd>
                </>
              ) : null}
              <dt>Refunds</dt>
              <dd className="num text-left">
                {usd(report.refundTotal)}, {report.refundCount}
              </dd>
              <dt>Voids</dt>
              <dd className="num text-left">
                {usd(report.voidTotal)}, {report.voidCount}
              </dd>
            </dl>
          </section>
          <section>
            <div className="sec-title">Cash</div>
            <dl className="attrs">
              <dt>Floats</dt>
              <dd className="num text-left">
                {usd(report.openingFloat)}
              </dd>
              <dt>To the safe</dt>
              <dd className="num text-left">
                {usd(report.cashDropTotal)}
              </dd>
              <dt>Paid out</dt>
              <dd className="num text-left">
                {usd(report.cashPayoutTotal)}
              </dd>
              <dt>Counted</dt>
              <dd className="num text-left">
                {usd(report.countedCash)}
              </dd>
            </dl>
            <p className="help">One report a till a day, taken when the day closes.</p>
          </section>
        </aside>
      </div>
    </>
  );
}
