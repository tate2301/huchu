"use client";

/**
 * Insights — the tills' sales, shifts and low stock, read as reports.
 *
 * Drawn as the overview and the CRM's finance page are, with the management
 * contract's pieces (`components/management/ui`): each tab opens on its
 * figures, plain and mono with a sentence-case label; the charts sit under
 * section headings rather than in cards; and the sales and shifts behind them
 * are `ColumnList`s, each row a link to its record. The one verb is Export, in
 * the app bar, carrying whatever the open tab shows.
 */

import { useMemo, useState, type ReactNode } from "react";
import { Alert, Button, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@corelithzw/react";
import { useQuery } from "@tanstack/react-query";
import {
  AdminTrendChart,
  AdminDonutChart,
  AdminDualBarChart,
  AdminDistributionChart,
} from "@/components/charts/admin-headless-charts";
import { ListSearch } from "@/components/crm/records/list-search";
import {
  ColumnFigure,
  ColumnList,
  ColumnName,
  ColumnText,
  SectionHeading,
  StatusDot,
} from "@/components/management/ui";
import { RetailShell } from "@/components/retail/retail-shell";
import { ReportExportButton } from "@/components/retail/reports/report-export-button";
import { saleExceptionLabel } from "@/components/retail/sale-detail";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { formatRetailDateTime, formatSignedMoney, shiftStatusLabel, tenderLabel } from "@/lib/retail/words";

type SaleRow = {
  id: string;
  saleNo: string;
  saleType: string;
  status: string;
  cashierName: string | null;
  customerName: string | null;
  postedAt: string;
  totalAmount: number;
  itemCount: number;
  tenderTypes: string[];
};

type ShiftRow = {
  id: string;
  shiftNo: string;
  registerName: string;
  site: { name: string } | null;
  cashierName: string;
  openingFloat: number;
  expectedCash: number;
  countedCash: number | null;
  variance: number | null;
  status: string;
  openedAt: string;
  salesValue: number;
  saleCount: number;
};

type StockItem = {
  id: string;
  itemCode: string;
  name: string;
  currentStock: number;
  minStock: number;
  unit: string;
};

const TABS = [
  { id: "operations", label: "The day" },
  { id: "pos-policy", label: "Sales by type" },
  { id: "reports", label: "Trading" },
  { id: "stock", label: "Stock" },
  { id: "sales", label: "Sales" },
  { id: "shifts", label: "Shifts" },
] as const;

/** The measure the lists and their headings share; the charts take it too. */
const WIDE = 960;

/** How many rows a list draws before "Show more". */
const PAGE = 50;

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function count(value: number) {
  return value.toString();
}

function dateLabel(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function RetailReportsHubPage() {
  const [activeTab, setActiveTab] = useState<string>("operations");

  const salesQuery = useQuery({
    queryKey: ["retail-reports-sales"],
    queryFn: () =>
      fetchJson<{ data: SaleRow[]; summary: Record<string, number> }>(
        "/api/v2/retail/pos/sales?limit=200",
      ),
  });
  const shiftsQuery = useQuery({
    queryKey: ["retail-reports-shifts"],
    queryFn: () => fetchJson<{ data: ShiftRow[] }>("/api/v2/retail/shifts"),
  });
  const stockQuery = useQuery({
    queryKey: ["retail-reports-stock"],
    queryFn: () =>
      fetchJson<{ summary: { lowStockCount: number }; lowStock: StockItem[] }>("/api/v2/retail"),
  });

  const sales = useMemo(() => salesQuery.data?.data ?? [], [salesQuery.data?.data]);
  const shifts = useMemo(() => shiftsQuery.data?.data ?? [], [shiftsQuery.data?.data]);
  const stockItems = useMemo(() => stockQuery.data?.lowStock ?? [], [stockQuery.data?.lowStock]);

  const salesTrend = useMemo(() => {
    const buckets = new Map<
      string,
      { label: string; sales: number; refunds: number; voids: number; tickets: number }
    >();
    for (const s of sales) {
      const key = s.postedAt.slice(0, 10);
      const label = dateLabel(s.postedAt);
      const cur = buckets.get(key) ?? { label, sales: 0, refunds: 0, voids: 0, tickets: 0 };
      cur.tickets++;
      if (s.saleType === "REFUND") cur.refunds += Math.abs(s.totalAmount);
      else if (s.saleType === "VOID" || s.status === "VOIDED") cur.voids += Math.abs(s.totalAmount);
      else cur.sales += s.totalAmount;
      buckets.set(key, cur);
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, v]) => ({
        id,
        label: v.label,
        sales: v.sales,
        refunds: v.refunds,
        voids: v.voids,
        tickets: v.tickets,
      }));
  }, [sales]);

  const tenderMix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sales) {
      for (const t of s.tenderTypes) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries()).map(([label, value]) => ({ id: label, label: tenderLabel(label), value }));
  }, [sales]);

  const typeMix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sales) {
      const key = s.saleType === "SALE" ? "Sales" : s.saleType === "REFUND" ? "Refunds" : "Voids";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([label, value]) => ({
      id: label,
      label,
      value,
      tone:
        label === "Sales"
          ? ("success" as const)
          : label === "Refunds"
            ? ("warning" as const)
            : ("danger" as const),
    }));
  }, [sales]);

  const shiftTrend = useMemo(() => {
    const buckets = new Map<string, { label: string; sales: number; variance: number; count: number }>();
    for (const s of shifts) {
      const key = s.openedAt.slice(0, 10);
      const label = dateLabel(s.openedAt);
      const cur = buckets.get(key) ?? { label, sales: 0, variance: 0, count: 0 };
      cur.sales += s.salesValue;
      cur.variance += Math.abs(s.variance ?? 0);
      cur.count++;
      buckets.set(key, cur);
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, v]) => ({ id, label: v.label, sales: v.sales, variance: v.variance, count: v.count }));
  }, [shifts]);

  const shiftStatus = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of shifts) counts.set(s.status, (counts.get(s.status) ?? 0) + 1);
    return Array.from(counts.entries()).map(([label, value]) => ({
      id: label,
      label: shiftStatusLabel(label),
      value,
      tone: label === "OPEN" ? ("success" as const) : ("default" as const),
    }));
  }, [shifts]);

  const topCashiers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sales)
      counts.set(s.cashierName ?? "Unknown", (counts.get(s.cashierName ?? "Unknown") ?? 0) + 1);
    return Array.from(counts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([label, value]) => ({ id: label, label, value }));
  }, [sales]);

  const topTickets = useMemo(
    () =>
      sales
        .slice()
        .sort((a, b) => b.totalAmount - a.totalAmount)
        .slice(0, 8)
        .map((s) => ({ id: s.id, label: s.saleNo, primary: s.totalAmount, secondary: s.itemCount })),
    [sales],
  );

  const stockHealth = useMemo(
    () => [
      {
        id: "ok",
        label: "Enough",
        value: stockItems.filter((i) => i.currentStock > i.minStock).length,
        tone: "success" as const,
      },
      {
        id: "low",
        label: "Low",
        value: stockItems.filter((i) => i.currentStock > 0 && i.currentStock <= i.minStock).length,
        tone: "warning" as const,
      },
      {
        id: "critical",
        label: "Critical",
        value: stockItems.filter((i) => i.currentStock <= 0).length,
        tone: "danger" as const,
      },
    ],
    [stockItems],
  );

  const stockGap = useMemo(
    () =>
      stockItems
        .slice()
        .sort((a, b) => b.minStock - b.currentStock - (a.minStock - a.currentStock))
        .slice(0, 8)
        .map((i) => ({
          id: i.id,
          label: i.name,
          value: Math.max(i.minStock - i.currentStock, 0),
          tone: "warning" as const,
        })),
    [stockItems],
  );

  const netSales = salesQuery.data?.summary.netSales ?? 0;
  const grossSales = salesQuery.data?.summary.grossSales ?? 0;
  const openShifts = shifts.filter((s) => s.status === "OPEN").length;
  const exceptionCount = sales.filter((s) => s.saleType !== "SALE").length;
  const averageTicket = sales.length
    ? sales.reduce((total, row) => total + row.totalAmount, 0) / sales.length
    : 0;

  const isPending = salesQuery.isPending || shiftsQuery.isPending || stockQuery.isPending;
  const failure = salesQuery.error ?? shiftsQuery.error ?? stockQuery.error;

  // One export, on the page header, carrying whatever the open tab is showing.
  // It replaced six copies of a filter bar whose Export button was wired to a
  // no-op and whose filter rules were never read by anything.
  const exportRows = activeTab === "shifts" ? shifts : activeTab === "stock" ? stockItems : sales;
  const exportName =
    activeTab === "shifts"
      ? "retail-shifts.csv"
      : activeTab === "stock"
        ? "retail-low-stock.csv"
        : "retail-transactions.csv";

  const actions = <ReportExportButton data={exportRows} filename={exportName} />;

  if (isPending) {
    return (
      <RetailShell title="Insights" actions={undefined}>
        <div aria-busy="true" className="space-y-3" style={{ maxWidth: WIDE }}>
          <Skeleton height={44} />
          <Skeleton height={104} />
          <Skeleton height={280} />
        </div>
      </RetailShell>
    );
  }

  if (failure) {
    return (
      <RetailShell title="Insights" actions={undefined}>
        <Alert tone="danger" title="The reports would not load">
          {getApiErrorMessage(failure)}
        </Alert>
      </RetailShell>
    );
  }

  const noSales = <Muted>No sales yet.</Muted>;

  return (
    <RetailShell title="Insights" actions={actions}>
      <Tabs value={activeTab} onValueChange={setActiveTab} variant="segmented">
        <TabsList aria-label="Report areas">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="operations">
          {sales.length === 0 ? (
            noSales
          ) : (
            <div className="pb-10">
              <Figures
                items={[
                  { label: "Net sales", value: money(netSales) },
                  { label: "Gross sales", value: money(grossSales) },
                  { label: "Sales", value: count(sales.length) },
                ]}
              />
              <ChartPair
                wide={
                  <Chart heading="Sales, refunds and voids">
                    <AdminTrendChart
                      rows={salesTrend}
                      series={[
                        { key: "sales", label: "Sales", kind: "area", tone: "success", fillOpacity: 0.12 },
                        { key: "refunds", label: "Refunds", kind: "line", tone: "warning", dashed: true },
                        { key: "voids", label: "Voids", kind: "line", tone: "danger", dashed: true },
                      ]}
                      height={280}
                      valueFormatter={money}
                      yTickFormatter={money}
                    />
                  </Chart>
                }
                narrow={
                  <Chart heading="Sales by type">
                    <AdminDonutChart rows={typeMix} valueLabel="Sales" valueFormatter={count} height={280} />
                  </Chart>
                }
              />
              <ChartPair
                wide={
                  <Chart heading="Tenders">
                    <AdminDistributionChart
                      rows={tenderMix}
                      valueLabel="Sales"
                      valueFormatter={count}
                      height={260}
                    />
                  </Chart>
                }
                narrow={
                  <Chart heading="Top cashiers">
                    <AdminDistributionChart
                      rows={topCashiers}
                      valueLabel="Sales"
                      valueFormatter={count}
                      height={260}
                    />
                  </Chart>
                }
              />
              <SalesList sales={sales} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="pos-policy">
          {sales.length === 0 ? (
            noSales
          ) : (
            <div className="pb-10">
              <Figures
                items={[
                  { label: "Sales", value: count(sales.length) },
                  { label: "Average sale", value: money(averageTicket) },
                  { label: "Refunds and voids", value: count(exceptionCount) },
                ]}
              />
              <ChartPair
                wide={
                  <Chart heading="Sales a day">
                    <AdminTrendChart
                      rows={salesTrend}
                      series={[{ key: "tickets", label: "Sales", kind: "bar", tone: "default" }]}
                      height={280}
                      valueFormatter={count}
                    />
                  </Chart>
                }
                narrow={
                  <Chart heading="Type breakdown">
                    <AdminDonutChart rows={typeMix} valueLabel="Sales" valueFormatter={count} height={280} />
                  </Chart>
                }
              />
              <SalesList sales={sales} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="reports">
          {sales.length === 0 ? (
            noSales
          ) : (
            <div className="pb-10">
              <ChartPair
                wide={
                  <Chart heading="Sales and refunds by day">
                    <AdminTrendChart
                      rows={salesTrend}
                      series={[
                        { key: "sales", label: "Sales", kind: "area", tone: "success", fillOpacity: 0.12 },
                        { key: "refunds", label: "Refunds", kind: "line", tone: "warning", dashed: true },
                      ]}
                      height={300}
                      valueFormatter={money}
                      yTickFormatter={money}
                    />
                  </Chart>
                }
                narrow={
                  <Chart heading="Sales by type">
                    <AdminDonutChart rows={typeMix} valueLabel="Sales" valueFormatter={count} height={300} />
                  </Chart>
                }
              />
              <ChartPair
                wide={
                  <Chart heading="Largest sales">
                    <AdminDualBarChart
                      rows={topTickets}
                      primaryLabel="Amount"
                      secondaryLabel="Items"
                      height={280}
                      valueFormatter={money}
                    />
                  </Chart>
                }
                narrow={
                  <Chart heading="Tenders">
                    <AdminDistributionChart
                      rows={tenderMix}
                      valueLabel="Sales"
                      valueFormatter={count}
                      height={280}
                    />
                  </Chart>
                }
              />
              <SalesList sales={sales} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="stock">
          {stockItems.length === 0 ? (
            <Muted>Nothing is running low.</Muted>
          ) : (
            <div className="pb-10">
              <Figures
                items={[
                  { label: "Low stock", value: count(stockQuery.data?.summary.lowStockCount ?? stockItems.length) },
                  { label: "Out of stock", value: count(stockItems.filter((i) => i.currentStock <= 0).length) },
                ]}
              />
              <ChartPair
                wide={
                  <Chart heading="Short of reorder">
                    <AdminDistributionChart
                      rows={stockGap}
                      valueLabel="Shortfall"
                      valueFormatter={(v) => v.toFixed(0)}
                      height={280}
                    />
                  </Chart>
                }
                narrow={
                  <Chart heading="Stock by state">
                    <AdminDonutChart
                      rows={stockHealth}
                      valueLabel="Products"
                      valueFormatter={count}
                      height={280}
                    />
                  </Chart>
                }
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="sales">
          {sales.length === 0 ? (
            noSales
          ) : (
            <div className="pb-10">
              <Figures
                items={[
                  { label: "Gross sales", value: money(grossSales) },
                  { label: "Net sales", value: money(netSales) },
                  { label: "Sales", value: count(sales.length) },
                ]}
              />
              <ChartPair
                wide={
                  <Chart heading="Sales and refunds">
                    <AdminTrendChart
                      rows={salesTrend}
                      series={[
                        { key: "sales", label: "Sales", kind: "area", tone: "success", fillOpacity: 0.12 },
                        { key: "refunds", label: "Refunds", kind: "line", tone: "warning", dashed: true },
                      ]}
                      height={280}
                      valueFormatter={money}
                      yTickFormatter={money}
                    />
                  </Chart>
                }
                narrow={
                  <Chart heading="Largest sales">
                    <AdminDualBarChart
                      rows={topTickets.slice(0, 6)}
                      primaryLabel="Amount"
                      secondaryLabel="Items"
                      height={280}
                      valueFormatter={money}
                    />
                  </Chart>
                }
              />
              <SalesList sales={sales} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="shifts">
          {shifts.length === 0 ? (
            <Muted>No shifts yet.</Muted>
          ) : (
            <div className="pb-10">
              <Figures
                items={[
                  { label: "Open shifts", value: count(openShifts) },
                  { label: "Shifts", value: count(shifts.length) },
                  { label: "Takings", value: money(shifts.reduce((s, sh) => s + sh.salesValue, 0)) },
                ]}
              />
              <ChartPair
                wide={
                  <Chart heading="Takings and variance by shift">
                    <AdminTrendChart
                      rows={shiftTrend}
                      series={[
                        { key: "sales", label: "Takings", kind: "area", tone: "success", fillOpacity: 0.12 },
                        { key: "variance", label: "Variance", kind: "line", tone: "warning", dashed: true },
                      ]}
                      height={280}
                      valueFormatter={money}
                      yTickFormatter={money}
                    />
                  </Chart>
                }
                narrow={
                  <Chart heading="Status">
                    <AdminDonutChart rows={shiftStatus} valueLabel="Shifts" valueFormatter={count} height={280} />
                  </Chart>
                }
              />
              <ShiftsList shifts={shifts} />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </RetailShell>
  );
}

/** One sentence where a tab has nothing to show. */
function Muted({ children }: { children: ReactNode }) {
  return <p className="mt-6 text-[13px] text-[var(--text-muted)]">{children}</p>;
}

/** A tab's figures: each a sentence-case label over one large mono number. */
function Figures({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <dl className="mt-6 grid gap-x-12 gap-y-4 sm:grid-cols-3" style={{ maxWidth: WIDE }}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-[13px] text-[var(--text-muted)]">{item.label}</dt>
          <dd className="mt-1 font-mono text-[28px] font-semibold leading-tight tracking-[-0.01em] tabular-nums text-[var(--text-strong)]">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A chart under its section heading, with no frame round it. */
function Chart({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section aria-label={heading} className="min-w-0">
      <SectionHeading maxWidth={WIDE}>{heading}</SectionHeading>
      {children}
    </section>
  );
}

/** Two charts side by side on a wide screen, the first given the room. */
function ChartPair({ wide, narrow }: { wide: ReactNode; narrow: ReactNode }) {
  return (
    <div className="grid gap-x-12 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
      {wide}
      {narrow}
    </div>
  );
}

/** The sales behind a tab's figures, searchable, fifty at a time. */
function SalesList({ sales }: { sales: SaleRow[] }) {
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(PAGE);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return sales;
    return sales.filter((sale) =>
      [sale.saleNo, sale.cashierName ?? "", sale.customerName ?? ""].some((value) =>
        value.toLowerCase().includes(needle),
      ),
    );
  }, [sales, search]);

  return (
    <section aria-labelledby="insights-sales" className="space-y-3">
      <SectionHeading
        count={rows.length}
        maxWidth={WIDE}
        action={
          <ListSearch
            narrow
            value={search}
            onChange={(next) => {
              setSearch(next);
              setShown(PAGE);
            }}
            placeholder="Search by sale, cashier or customer"
            noun="sales"
          />
        }
      >
        <span id="insights-sales">Sales</span>
      </SectionHeading>
      <ColumnList
        label="Sales"
        maxWidth={WIDE}
        empty={search.trim() ? "No sales match that search." : "No sales yet."}
        columns={[
          { id: "sale", label: "Sale" },
          { id: "state", label: "Status", hideBelow: "sm" },
          { id: "cashier", label: "Cashier", hideBelow: "md" },
          { id: "items", label: "Items", align: "end", hideBelow: "sm" },
          { id: "total", label: "Total", align: "end" },
        ]}
        rows={rows.slice(0, shown).map((sale) => {
          const exception = saleExceptionLabel(sale);
          return {
            id: sale.id,
            cells: {
              sale: (
                <ColumnName
                  code={sale.saleNo}
                  name={sale.customerName ?? "Walk-in"}
                  meta={formatRetailDateTime(sale.postedAt)}
                  href={`/retail/sales/${sale.id}`}
                />
              ),
              state: exception ? (
                <StatusDot tone={sale.saleType === "VOID" ? "warn" : "neutral"} label={exception} />
              ) : null,
              cashier: <ColumnText>{sale.cashierName ?? "Not on file"}</ColumnText>,
              items: <ColumnFigure tone="muted">{sale.itemCount}</ColumnFigure>,
              total: <ColumnFigure>{formatSignedMoney(sale.totalAmount)}</ColumnFigure>,
            },
          };
        })}
      />
      {rows.length > shown ? (
        <Button variant="secondary" size="sm" onClick={() => setShown((current) => current + PAGE)}>
          Show more
        </Button>
      ) : null}
    </section>
  );
}

/** Every shift behind the tab, each a link to its own page. */
function ShiftsList({ shifts }: { shifts: ShiftRow[] }) {
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(PAGE);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return shifts;
    return shifts.filter((shift) =>
      [shift.shiftNo, shift.registerName, shift.cashierName].some((value) =>
        value.toLowerCase().includes(needle),
      ),
    );
  }, [shifts, search]);

  return (
    <section aria-labelledby="insights-shifts" className="space-y-3">
      <SectionHeading
        count={rows.length}
        maxWidth={WIDE}
        action={
          <ListSearch
            narrow
            value={search}
            onChange={(next) => {
              setSearch(next);
              setShown(PAGE);
            }}
            placeholder="Search by shift, till or cashier"
            noun="shifts"
          />
        }
      >
        <span id="insights-shifts">Shifts</span>
      </SectionHeading>
      <ColumnList
        label="Shifts"
        maxWidth={WIDE}
        empty={search.trim() ? "No shifts match that search." : "No shifts yet."}
        columns={[
          { id: "shift", label: "Shift" },
          { id: "state", label: "Status", hideBelow: "sm" },
          { id: "cashier", label: "Cashier", hideBelow: "md" },
          { id: "takings", label: "Takings", align: "end" },
          { id: "variance", label: "Variance", align: "end", hideBelow: "sm" },
        ]}
        rows={rows.slice(0, shown).map((shift) => ({
          id: shift.id,
          cells: {
            shift: (
              <ColumnName
                code={shift.shiftNo}
                name={shift.registerName}
                meta={[shift.site?.name, formatRetailDateTime(shift.openedAt)].filter(Boolean).join(" · ")}
                href={`/retail/shifts/${shift.id}`}
              />
            ),
            // Open is worth a word; a closed drawer that balanced is not.
            state:
              shift.status === "OPEN" ? (
                <StatusDot tone="success" label={shiftStatusLabel(shift.status)} />
              ) : shift.variance ? (
                <StatusDot tone="warn" label={shift.variance < 0 ? "Short" : "Over"} />
              ) : null,
            cashier: <ColumnText>{shift.cashierName}</ColumnText>,
            takings: <ColumnFigure>{formatSignedMoney(shift.salesValue)}</ColumnFigure>,
            variance:
              shift.variance === null ? (
                <ColumnFigure tone="muted">—</ColumnFigure>
              ) : (
                <ColumnFigure tone={shift.variance ? "warn" : "muted"}>
                  {formatSignedMoney(shift.variance)}
                </ColumnFigure>
              ),
          },
        }))}
      />
      {rows.length > shown ? (
        <Button variant="secondary" size="sm" onClick={() => setShown((current) => current + PAGE)}>
          Show more
        </Button>
      ) : null}
    </section>
  );
}
