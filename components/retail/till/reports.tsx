"use client";

/**
 * Reports: my sales today or over seven days, the chart and what sold most on
 * the left, the figures in the sale column's place; for whoever keeps the
 * cash, the till's end-of-day report, frozen when taken. One report a till a
 * day, in the shop's base currency: ZiG cash is counted at each sale's rate,
 * and bottle deposits are held apart from the takings.
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { fetchJson } from "@/lib/api-client";
import { ChartBar, Clock, Coins, Package, Printer, Receipt, Recycle, Tag, Tray, UserCheck, Vault } from "@/lib/icons";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { SHOP_TIME_ZONE } from "@/lib/retail/shop-profile-rules";
import type { RetailZReportPayload } from "@/lib/retail/z-report";
import { count, hhmm, qty, TENDER_LABEL, usd, weekdayDayMonth, whole } from "./format";
import { Empty, LoadFailed } from "./parts";
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

type Tab = "mine" | "day";
type Period = "today" | "week";

/** The finding counts shifts in words: "Two shifts". */
const SHIFT_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];

function shopDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SHOP_TIME_ZONE }).format(date);
}

export function ReportsScreen() {
  const { data: session } = useSession();
  // The end-of-day report is cash control's: the same right the report itself asks for.
  const keepsCash = canRetailRoleDo(session?.user?.role, "retail.cash-control", "view");
  const [tab, setTab] = React.useState<Tab>("mine");
  const [period, setPeriod] = React.useState<Period>("today");
  const day = tab === "day" && keepsCash;

  const pills = (
    <>
      {keepsCash ? (
        <div className="hx-pills" role="radiogroup" aria-label="Report">
          {[
            { value: "mine" as const, label: "My sales" },
            { value: "day" as const, label: "End of day" },
          ].map((option) => (
            <button key={option.value} type="button" role="radio" className="hx-pill" aria-checked={tab === option.value} onClick={() => setTab(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      {day ? null : (
        <div className={`hx-pills is-quiet${keepsCash ? "" : " is-first"}`} role="radiogroup" aria-label="Period">
          {[
            { value: "today" as const, label: "Today" },
            { value: "week" as const, label: "Last 7 days" },
          ].map((option) => (
            <button key={option.value} type="button" role="radio" className="hx-pill is-quiet" aria-checked={period === option.value} onClick={() => setPeriod(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
      )}
    </>
  );

  return day ? <EndOfDay pills={pills} /> : <MySales period={period} pills={pills} />;
}

function MySales({ period, pills }: { period: Period; pills: React.ReactNode }) {
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
  const busiest = peak && peak.value > 0 ? (period === "today" ? `${peak.label} to ${String(Number(peak.key) + 1).padStart(2, "0")}:00` : peak.label) : null;

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
  const items = sales.reduce((sum, sale) => sum + (sale.lines ?? []).reduce((lines, line) => lines + Number(line.quantity), 0), 0);

  return (
    <div className="bench hx cu cu-rep">
      <main className="main hx-main" aria-label="My sales">
        <div className="hx-head">
          <h1>My sales</h1>
          {query.isPending ? null : <span className="hx-sub">{period === "today" ? "Today" : "Last 7 days"} · {count(sales.length, "sale")}</span>}
        </div>
        {pills}
        {query.isPending ? (
          <div className="hx-list" aria-busy="true">
            <span className="skeleton cu-chart-skeleton" />
          </div>
        ) : query.isError ? (
          <LoadFailed icon={ChartBar} title="Your sales did not load" error={query.error} onRetry={() => void query.refetch()} />
        ) : !sales.length ? (
          <Empty icon={ChartBar} title={period === "today" ? "No sales yet today" : "No sales this week"} />
        ) : (
          <div className="hx-list cu-list">
            <section className="cu-chart" aria-label={period === "today" ? "By the hour" : "By the day"}>
              <h2 className="cu-label">{period === "today" ? "By the hour" : "By the day"}</h2>
              <div role="img" aria-label={`Sales ${period === "today" ? "by hour" : "by day"}. ${peak.label} was busiest at ${usd(peak.value)}.`}>
                <div className="cols">
                  {buckets.map((bucket) => (
                    <div key={bucket.key} className={`col${bucket.key === peak.key ? " is-now" : ""}`}>
                      {bucket.key === peak.key ? <span className="v num">{usd(bucket.value)}</span> : null}
                      <i style={{ height: `${(bucket.value / max) * 90}%` }} />
                    </div>
                  ))}
                </div>
                <div className="cols-x num">
                  {buckets.map((bucket) => (
                    <span key={bucket.key} className={bucket.key === peak.key ? "is-now" : undefined}>
                      {bucket.label}
                    </span>
                  ))}
                </div>
              </div>
            </section>
            {sold.length ? (
              <section aria-label="Sold most">
                <h2 className="cu-label">Sold most</h2>
                {sold.map(([name, entry]) => (
                  <div key={name} className="hx-item">
                    <div className="hx-row is-static">
                      <span className="hx-glyph">
                        <Package className="ic" />
                      </span>
                      <span className="hx-text">
                        <span className="hx-t">
                          <span className="truncate">{name}</span>
                        </span>
                        <span className="hx-s">
                          <span className="num">{qty(Number(entry.quantity.toFixed(3)))}</span> sold
                        </span>
                      </span>
                      <span className="hx-v num">{usd(entry.amount)}</span>
                    </div>
                  </div>
                ))}
              </section>
            ) : null}
          </div>
        )}
      </main>
      <aside className="bench-side hx-side" aria-label="The figures">
        <div className="bar sale-head">
          <h1>{period === "today" ? "Today" : "Last 7 days"}</h1>
        </div>
        <div className="hx-scroll">
          <div className="cu-total">
            <span className="paid-k">Sold</span>
            <span className="paid-v">{usd(total)}</span>
          </div>
          <dl className="facts hx-facts">
            <div className="fact">
              <Receipt className="ic" />
              <dt>Sales</dt>
              <dd>{whole(sales.length)}</dd>
            </div>
            <div className="fact">
              <Package className="ic" />
              <dt>Items</dt>
              <dd>{qty(Number(items.toFixed(3)))}</dd>
            </div>
            {busiest ? (
              <div className="fact">
                <Clock className="ic" />
                <dt>Busiest</dt>
                <dd>{busiest}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </aside>
    </div>
  );
}

function EndOfDay({ pills }: { pills: React.ReactNode }) {
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
  const loading = dayQuery.isLoading || reportQuery.isLoading;

  let left: React.ReactNode;
  if (loading) {
    left = (
      <div className="hx-list" aria-busy="true">
        <span className="skeleton cu-chart-skeleton" />
      </div>
    );
  } else if (dayQuery.isError) {
    left = <LoadFailed icon={Receipt} title="The end-of-day report did not load" error={dayQuery.error} onRetry={() => void dayQuery.refetch()} />;
  } else if (!report) {
    left = <Empty icon={Receipt} title={`${context?.till.name ?? "This till"}’s end-of-day report is not taken yet`} />;
  }

  if (!report || left) {
    return (
      <div className="bench hx cu cu-rep">
        <main className="main hx-main" aria-label="End of day">
          <div className="hx-head">
            <h1>End of day</h1>
          </div>
          {pills}
          {left}
        </main>
        <aside className="bench-side hx-side" aria-label="The figures" />
      </div>
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
    <div className="bench hx cu cu-rep">
      <main className="main hx-main" aria-label="End of day">
        <div className="hx-head">
          <h1>End of day</h1>
          <span className="hx-sub">
            {report.registerName} · {weekdayDayMonth(`${report.businessDate.slice(0, 10)}T12:00:00Z`)}
          </span>
        </div>
        {pills}
        <div className="hx-list cu-list">
          <p className="cu-finding">{finding}</p>
          <section className="cu-chart" aria-label="How people paid">
            <h2 className="cu-label">How people paid</h2>
            {report.tenderBreakdown.map((line) => (
              <div key={line.tenderType} className="share">
                <TenderMark tender={line.tenderType} single />
                <span className="cu-share">
                  <span>{TENDER_LABEL[line.tenderType] ?? line.tenderType}</span>
                  <span className="cu-share-bar">
                    <i aria-hidden="true" style={{ width: `${(Number(line.amount) / maxShare) * 100}%` }} />
                  </span>
                </span>
                <span className="num pct">{Math.round(Number(line.share))}%</span>
                <span className="num">{usd(Number(line.amount))}</span>
              </div>
            ))}
          </section>
          <section aria-label="The drawers">
            <h2 className="cu-label">The drawers</h2>
            {report.shifts.map((shift) => {
              const variance = Number(shift.variance ?? 0);
              const off = variance < -0.004 ? "Short" : variance > 0.004 ? "Over" : null;
              return (
                <div key={shift.shiftId} className="hx-item">
                  <div className="hx-row is-static">
                    <span className="hx-glyph">
                      <Tray className="ic" />
                    </span>
                    <span className="hx-text">
                      <span className="hx-t">
                        <span className="truncate">{shift.cashierName}</span>
                        <span className={`hx-tag${variance < -0.004 ? " is-bad" : ""}`}>{off ?? "Balanced"}</span>
                      </span>
                      <span className="hx-s">
                        <span className="num">{shift.shiftNo}</span> · <span className="num">{hhmm(shift.openedAt)}</span> to{" "}
                        <span className="num">{shift.closedAt ? hhmm(shift.closedAt) : "now"}</span>
                      </span>
                    </span>
                    <span className="hx-v num">{usd(variance)}</span>
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      </main>
      <aside className="bench-side hx-side" aria-label="The figures">
        <div className="bar sale-head">
          <h1>{report.registerName}</h1>
          <span className="hx-code num">
            {report.reportNo} · {hhmm(report.generatedAt)}
          </span>
        </div>
        <div className="hx-scroll">
          <div className="cu-total">
            <span className="paid-k">Takings</span>
            <span className="paid-v">{usd(report.grossTakings + report.depositTotal)}</span>
          </div>
          <dl className="facts hx-facts">
            {report.generatedByName ? (
              <div className="fact">
                <UserCheck className="ic" />
                <dt>Taken by {report.generatedByName}</dt>
                <dd>{hhmm(report.generatedAt)}</dd>
              </div>
            ) : null}
            <div className="fact">
              <Tag className="ic" />
              <dt>Before discounts</dt>
              <dd>{usd(report.grossSales)}</dd>
            </div>
            <div className="fact">
              <Tag className="ic" />
              <dt>Discounts{report.approvedDiscountCount ? `, ${report.approvedDiscountCount} approved` : ""}</dt>
              <dd>{usd(report.discountTotal)}</dd>
            </div>
            <div className="fact">
              <Receipt className="ic" />
              <dt>VAT at {report.taxRatePercent}%</dt>
              <dd>{usd(report.taxTotal)}</dd>
            </div>
            {report.depositTotal ? (
              <div className="fact">
                <Recycle className="ic" />
                <dt>Deposits held</dt>
                <dd>{usd(report.depositTotal)}</dd>
              </div>
            ) : null}
            <div className="fact">
              <Receipt className="ic" />
              <dt>Refunds, {report.refundCount}</dt>
              <dd>{usd(report.refundTotal)}</dd>
            </div>
            <div className="fact">
              <Receipt className="ic" />
              <dt>Voids, {report.voidCount}</dt>
              <dd>{usd(report.voidTotal)}</dd>
            </div>
          </dl>
          <dl className="facts hx-facts">
            <div className="fact">
              <Coins className="ic" />
              <dt>Floats</dt>
              <dd>{usd(report.openingFloat)}</dd>
            </div>
            <div className="fact">
              <Vault className="ic" />
              <dt>To the safe</dt>
              <dd>{usd(report.cashDropTotal)}</dd>
            </div>
            <div className="fact">
              <Coins className="ic" />
              <dt>Paid out</dt>
              <dd>{usd(report.cashPayoutTotal)}</dd>
            </div>
            <div className="fact">
              <Tray className="ic" />
              <dt>Counted</dt>
              <dd>{usd(report.countedCash)}</dd>
            </div>
          </dl>
        </div>
        <div className="hx-keys">
          <a className="hx-key" href={`/api/v2/retail/z-reports/${report.id}?format=csv`}>
            <Receipt className="ic" />
            Spreadsheet
          </a>
          <button type="button" className="take-key" onClick={() => window.print()}>
            <Printer className="ic" />
            Print the report
          </button>
        </div>
      </aside>
    </div>
  );
}
