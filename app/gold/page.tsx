"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { GoldShell } from "@/components/gold/gold-shell";
import { FrappeStatCard } from "@/components/charts/frappe-stat-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { goldRoutes } from "@/app/gold/routes";
import { canViewHrefWithEnabledFeatures } from "@/lib/platform/gating/nav-filter";

type GoldSummary = {
  generatedAt: string;
  weekStart: string;
  kpis: {
    cashThisWeekUsd: number;
    cashPriorWeekUsd: number;
    producedThisWeekGrams: number;
    producedPriorWeekGrams: number;
    awaitingSaleGrams: number;
    awaitingSaleUsd: number;
    owedToWorkersUsd: number;
    spotUsdPerGram: number | null;
    onHandGrams: number;
    onHandUsd: number | null;
  };
  dailyProductionSeries: Array<{ date: string; grams: number; usd: number }>;
  productionBySite: Array<{ id: string; name: string; code: string; grams: number }>;
  recentSales: Array<{
    id: string;
    receiptNumber: string;
    receiptDate: string;
    paidUsd: number;
    paymentMethod: string;
    batchCode: string;
    siteName: string;
  }>;
  topEarners: Array<{
    employeeId: string;
    name: string;
    code: string | null;
    valueUsd: number;
    weightGrams: number;
  }>;
};

const usd = (n: number) =>
  `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const usd2 = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const grams = (n: number) =>
  `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} g`;

function pctDelta(current: number, prior: number) {
  if (!prior) return current > 0 ? 100 : 0;
  return ((current - prior) / prior) * 100;
}

function ProductionTrend({
  data,
}: {
  data: Array<{ date: string; grams: number }>;
}) {
  const W = 800;
  const H = 160;
  const padding = 8;
  const max = Math.max(1, ...data.map((d) => d.grams));
  const stepX = data.length > 1 ? (W - padding * 2) / (data.length - 1) : 0;
  const points = data.map((d, i) => {
    const x = padding + i * stepX;
    const y = H - padding - (d.grams / max) * (H - padding * 2);
    return { x, y };
  });
  const path = points.length
    ? points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")
    : "";
  const areaPath = points.length
    ? `${path} L${points[points.length - 1].x.toFixed(2)},${H - padding} L${padding},${H - padding} Z`
    : "";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-40" preserveAspectRatio="none">
      <defs>
        <linearGradient id="gold-trend" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(202 138 4)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="rgb(202 138 4)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {areaPath ? <path d={areaPath} fill="url(#gold-trend)" /> : null}
      {path ? (
        <path
          d={path}
          fill="none"
          stroke="rgb(202 138 4)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  );
}

function SiteBreakdown({
  data,
}: {
  data: Array<{ id: string; name: string; code: string; grams: number }>;
}) {
  const total = data.reduce((sum, row) => sum + row.grams, 0);
  if (!total) {
    return (
      <p className="text-sm text-muted-foreground">No production logged in the last 30 days.</p>
    );
  }
  return (
    <div className="space-y-3">
      {data.map((row) => {
        const pct = (row.grams / total) * 100;
        return (
          <div key={row.id} className="space-y-1">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-semibold truncate">{row.name}</span>
              <span className="text-muted-foreground">
                {grams(row.grams)} · {pct.toFixed(0)}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-500"
                style={{ width: `${pct.toFixed(2)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function GoldPage() {
  const { data: session } = useSession();
  const enabledFeatures = useMemo(
    () =>
      (session?.user as { enabledFeatures?: string[] } | undefined)
        ?.enabledFeatures,
    [session],
  );
  const canRecordBatch = canViewHrefWithEnabledFeatures(
    goldRoutes.intake.pours,
    enabledFeatures,
  );
  const canRecordDispatch = canViewHrefWithEnabledFeatures(
    goldRoutes.transit.dispatches,
    enabledFeatures,
  );
  const canRecordSale = canViewHrefWithEnabledFeatures(
    goldRoutes.settlement.receipts,
    enabledFeatures,
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["gold-summary"],
    queryFn: () => fetchJson<GoldSummary>("/api/gold/summary"),
  });

  const kpis = data?.kpis;
  const cashDelta = kpis ? pctDelta(kpis.cashThisWeekUsd, kpis.cashPriorWeekUsd) : 0;
  const producedDelta = kpis ? pctDelta(kpis.producedThisWeekGrams, kpis.producedPriorWeekGrams) : 0;

  return (
    <GoldShell
      activeTab="home"
      title="Overview"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/shift-report">Record Shift Output</Link>
          </Button>
          {canRecordBatch ? (
            <Button asChild size="sm" variant="outline">
              <Link href={goldRoutes.intake.create}>Record Batch</Link>
            </Button>
          ) : null}
          {canRecordDispatch ? (
            <Button asChild size="sm" variant="outline">
              <Link href={goldRoutes.transit.create}>Record Dispatch</Link>
            </Button>
          ) : null}
          {canRecordSale ? (
            <Button asChild size="sm" variant="outline">
              <Link href={goldRoutes.settlement.create}>Record Sale</Link>
            </Button>
          ) : null}
          <Button asChild size="sm" variant="outline">
            <Link href="/gold/import">Import Ledger</Link>
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Could not load overview</AlertTitle>
            <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
          </Alert>
        ) : null}

        <section>
          <header className="mb-3">
            <h2 className="text-xl font-bold tracking-tight">This week at a glance</h2>
            <p className="text-sm text-muted-foreground">
              {kpis?.spotUsdPerGram
                ? `Today's gold price: ${usd2(kpis.spotUsdPerGram)} per gram`
                : "Set a gold price to see live valuations."}
            </p>
          </header>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
            <FrappeStatCard
              label="Gold on hand"
              value={kpis?.onHandGrams ?? 0}
              valueLabel={kpis ? grams(kpis.onHandGrams) : undefined}
              detail={
                kpis?.onHandUsd != null
                  ? `~ ${usd(kpis.onHandUsd)} at today's price`
                  : "Set a gold price to see USD value"
              }
              tone="neutral"
              loading={isLoading}
            />
            <FrappeStatCard
              label="Cash received this week"
              value={kpis?.cashThisWeekUsd ?? 0}
              valueLabel={kpis ? usd(kpis.cashThisWeekUsd) : undefined}
              detail={kpis ? `Last week: ${usd(kpis.cashPriorWeekUsd)}` : undefined}
              delta={kpis ? cashDelta : undefined}
              tone="success"
              loading={isLoading}
            />
            <FrappeStatCard
              label="Owed to workers"
              value={kpis?.owedToWorkersUsd ?? 0}
              valueLabel={kpis ? usd(kpis.owedToWorkersUsd) : undefined}
              detail="Approved shifts not yet paid"
              negativeIsBetter
              tone={kpis && kpis.owedToWorkersUsd > 0 ? "warning" : "neutral"}
              loading={isLoading}
            />
            <FrappeStatCard
              label="Awaiting sale"
              value={kpis?.awaitingSaleUsd ?? 0}
              valueLabel={kpis ? usd(kpis.awaitingSaleUsd) : undefined}
              detail={kpis ? `${grams(kpis.awaitingSaleGrams)} in storage / transit` : undefined}
              tone="neutral"
              loading={isLoading}
            />
            <FrappeStatCard
              label="Gold produced this week"
              value={kpis?.producedThisWeekGrams ?? 0}
              valueLabel={kpis ? grams(kpis.producedThisWeekGrams) : undefined}
              detail={kpis ? `Last week: ${grams(kpis.producedPriorWeekGrams)}` : undefined}
              delta={kpis ? producedDelta : undefined}
              tone="neutral"
              loading={isLoading}
            />
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-lg border bg-card p-4">
            <header className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Last 30 days production</h3>
                <p className="text-xs text-muted-foreground">Grams of gold per day</p>
              </div>
              <span className="text-xs text-muted-foreground">
                {data?.dailyProductionSeries.length
                  ? `${grams(
                      data.dailyProductionSeries.reduce((sum, d) => sum + d.grams, 0),
                    )} total`
                  : null}
              </span>
            </header>
            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <ProductionTrend data={data?.dailyProductionSeries ?? []} />
            )}
          </div>
          <div className="rounded-lg border bg-card p-4">
            <header className="mb-3">
              <h3 className="font-semibold">By site (last 30 days)</h3>
              <p className="text-xs text-muted-foreground">Where the gold came from</p>
            </header>
            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <SiteBreakdown data={data?.productionBySite ?? []} />
            )}
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border bg-card">
            <header className="px-4 py-3 border-b flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Recent sales</h3>
                <p className="text-xs text-muted-foreground">Latest 5 buyer payments</p>
              </div>
              <Button asChild size="sm" variant="ghost">
                <Link href={goldRoutes.settlement.receipts}>See all</Link>
              </Button>
            </header>
            {isLoading ? (
              <div className="p-4">
                <Skeleton className="h-24 w-full" />
              </div>
            ) : data?.recentSales.length ? (
              <ul className="divide-y">
                {data.recentSales.map((sale) => (
                  <li
                    key={sale.id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold truncate">
                        {sale.batchCode}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {sale.siteName} · {sale.paymentMethod.replace(/_/g, " ").toLowerCase()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{usd2(sale.paidUsd)}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(sale.receiptDate).toLocaleDateString()}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-4 text-sm text-muted-foreground">No sales yet.</p>
            )}
          </div>

          <div className="rounded-lg border bg-card">
            <header className="px-4 py-3 border-b">
              <h3 className="font-semibold">Top earners (last 30 days)</h3>
              <p className="text-xs text-muted-foreground">Workers with the highest share</p>
            </header>
            {isLoading ? (
              <div className="p-4">
                <Skeleton className="h-24 w-full" />
              </div>
            ) : data?.topEarners.length ? (
              <ul className="divide-y">
                {data.topEarners.map((earner) => (
                  <li
                    key={earner.employeeId}
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{earner.name}</p>
                      {earner.code ? (
                        <p className="text-xs text-muted-foreground">{earner.code}</p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{usd2(earner.valueUsd)}</p>
                      <p className="text-xs text-muted-foreground">
                        {grams(earner.weightGrams)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-4 text-sm text-muted-foreground">No worker shares yet.</p>
            )}
          </div>
        </section>
      </div>

    </GoldShell>
  );
}
