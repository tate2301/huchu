"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { AdminTrendChart, type AdminChartSeries } from "@/components/charts/admin-headless-charts";
import { ScrapShell } from "@/components/scrap-metal/scrap-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SplitButton } from "@/components/ui/split-button";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  ArrowRight,
  ChevronDownIcon,
  Coins,
  Package,
  Payments,
  ReceiptLong,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "@/lib/icons";

type DashboardPayload = {
  summary: {
    purchasesThisMonthValue: number;
    purchasesThisMonthWeight: number;
    salesThisMonthValue: number;
    salesThisMonthWeight: number;
    estimatedMarginThisMonth: number;
    readyBatchCount: number;
    collectingBatchCount: number;
    pendingSalesCount: number;
    approvedSalesCount: number;
    activeMaterialsCount: number;
    materialsCount: number;
    operatorBalanceExposure: number;
    overdueSettlementAmount: number;
    yardStockWeight: number;
    yardStockValue: number;
    amountOwedToCompany: number;
    amountCompanyOwes: number;
    balanceCount: number;
  };
  yardStock: {
    totalWeight: number;
    totalValue: number;
    trendSeries: string[];
    trend: Array<{
      label: string;
      tooltipLabel?: string;
      [key: string]: string | number | undefined;
    }>;
    materials: Array<{
      id: string;
      label: string;
      category: string;
      weight: number;
      value: number;
    }>;
  };
  balances: {
    amountOwedToCompany: number;
    amountCompanyOwes: number;
    operators: Array<{
      id: string;
      balance: number;
      deliveredValue: number;
      deliveredWeight: number;
      deliveryCount: number;
      employee: { id: string; name: string; employeeId: string };
    }>;
  };
  queues: {
    readyBatches: Array<{ id: string; batchNumber: string; totalWeight: number; status: string; category: string }>;
    settlementBatches: Array<{
      id: string;
      label: string;
      dueDate: string;
      workflowStatus: string;
      totalAmount: number;
    }>;
  };
};

const STORAGE_COLORS = [
  "var(--primary-500)",
  "var(--accent-500)",
  "var(--success-500)",
  "var(--warning-500)",
  "var(--info-500)",
  "var(--danger-500)",
];

function formatCurrency(value: number) {
  return `USD ${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatCompactCurrency(value: number) {
  if (Math.abs(value) >= 1_000_000) {
    return `USD ${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `USD ${(value / 1_000).toFixed(1)}K`;
  }
  return formatCurrency(value);
}

function formatWeight(value: number) {
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} kg`;
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  detail,
}: {
  label: string;
  value: string;
  icon: typeof Payments;
  tone?: "default" | "warning" | "danger" | "success";
  detail?: string;
}) {
  const accentClass =
    tone === "danger"
      ? "text-[var(--danger-600)]"
      : tone === "warning"
        ? "text-[var(--warning-600)]"
        : tone === "success"
          ? "text-[var(--success-600)]"
          : "text-[var(--primary-600)]";

  return (
    <div className="rounded-2xl border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-4">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">
        <Icon className={`h-4 w-4 ${accentClass}`} />
        <span>{label}</span>
      </div>
      <div className={`mt-3 text-2xl font-semibold tracking-[-0.02em] ${accentClass}`}>{value}</div>
      {detail ? <div className="mt-1 text-xs text-[var(--text-muted)]">{detail}</div> : null}
    </div>
  );
}

function MaterialStockRow({
  label,
  weight,
  value,
  maxWeight,
}: {
  label: string;
  weight: number;
  value: number;
  maxWeight: number;
}) {
  const width = maxWeight > 0 ? Math.max((weight / maxWeight) * 100, 6) : 0;

  return (
    <div className="space-y-2 rounded-2xl border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--text-strong)]">{label}</p>
          <p className="text-xs text-[var(--text-muted)]">{formatWeight(weight)}</p>
        </div>
        <p className="shrink-0 font-mono text-xs text-[var(--text-strong)]">{formatCompactCurrency(value)}</p>
      </div>
      <div className="h-2 rounded-full bg-[var(--surface-subtle)]">
        <div
          className="h-2 rounded-full bg-[var(--primary-500)]"
          style={{ width: `${Math.min(width, 100)}%` }}
        />
      </div>
    </div>
  );
}

function BalanceRow({
  name,
  employeeId,
  deliveredValue,
  deliveredWeight,
  balance,
  maxDeliveredValue,
  maxBalanceValue,
}: {
  name: string;
  employeeId: string;
  deliveredValue: number;
  deliveredWeight: number;
  balance: number;
  maxDeliveredValue: number;
  maxBalanceValue: number;
}) {
  const balanceLabel = balance > 0 ? "They owe us" : "We owe them";
  const balanceTone = balance > 0 ? "warning" : "success";
  const deliveredWidth = maxDeliveredValue > 0 ? Math.max((deliveredValue / maxDeliveredValue) * 100, 6) : 0;
  const balanceWidth = maxBalanceValue > 0 ? Math.max((Math.abs(balance) / maxBalanceValue) * 100, 6) : 0;

  return (
    <div className="rounded-2xl border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--text-strong)]">{name}</p>
          <p className="font-mono text-xs text-[var(--text-muted)]">{employeeId}</p>
        </div>
        <Badge variant={balanceTone === "warning" ? "outline" : "secondary"}>{balanceLabel}</Badge>
      </div>

      <div className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
            <span>Delivered</span>
            <span className="font-mono text-[var(--text-strong)]">
              {formatCompactCurrency(deliveredValue)} · {formatWeight(deliveredWeight)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-[var(--surface-subtle)]">
            <div
              className="h-2 rounded-full bg-[var(--primary-500)]"
              style={{ width: `${Math.min(deliveredWidth, 100)}%` }}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
            <span>Open balance</span>
            <span className="font-mono text-[var(--text-strong)]">{formatCompactCurrency(Math.abs(balance))}</span>
          </div>
          <div className="h-2 rounded-full bg-[var(--surface-subtle)]">
            <div
              className={`h-2 rounded-full ${balance > 0 ? "bg-[var(--warning-500)]" : "bg-[var(--success-500)]"}`}
              style={{ width: `${Math.min(balanceWidth, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ScrapMetalPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["scrap-metal-dashboard-v2"],
    queryFn: () => fetchJson<DashboardPayload>("/api/scrap-metal/dashboard"),
  });

  const storageSeries = useMemo<AdminChartSeries[]>(
    () =>
      (data?.yardStock.trendSeries ?? []).map((seriesKey, index) => ({
        key: seriesKey,
        label: seriesKey,
        kind: "line",
        color: STORAGE_COLORS[index % STORAGE_COLORS.length],
        strokeWidth: 2.2,
      })),
    [data?.yardStock.trendSeries],
  );
  const maxStoredWeight = useMemo(
    () => Math.max(...(data?.yardStock.materials ?? []).map((row) => row.weight), 0),
    [data?.yardStock.materials],
  );
  const maxDeliveredValue = useMemo(
    () => Math.max(...(data?.balances.operators ?? []).map((row) => row.deliveredValue), 0),
    [data?.balances.operators],
  );
  const maxBalanceValue = useMemo(
    () => Math.max(...(data?.balances.operators ?? []).map((row) => Math.abs(row.balance)), 0),
    [data?.balances.operators],
  );

  return (
    <ScrapShell
      title="Overview"
      actions={
        <div className="flex flex-wrap gap-2">
          <SplitButton
            size="sm"
            menuContent={
              <>
                <DropdownMenuItem asChild>
                  <Link href="/scrap-metal/yard/batches">Open lot</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/scrap-metal/trading/sales">Record sale</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/scrap-metal/settlements">View settlements</Link>
                </DropdownMenuItem>
              </>
            }
          >
            <Link href="/scrap-metal/buying/purchases" className="inline-flex items-center gap-2">
              <Payments className="h-4 w-4" />
              Record Purchase
            </Link>
          </SplitButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                More
                <ChevronDownIcon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href="/scrap-metal/reports">Reports</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/management/master-data/operations/scrap-materials">Materials</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/management/master-data/operations/scrap-sellers">Sellers</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load overview</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="In yard"
          value={formatWeight(data?.summary.yardStockWeight ?? 0)}
          icon={Package}
          detail={`${data?.summary.collectingBatchCount ?? 0} collecting · ${data?.summary.readyBatchCount ?? 0} ready`}
        />
        <SummaryCard
          label="Yard value"
          value={formatCompactCurrency(data?.summary.yardStockValue ?? 0)}
          icon={Coins}
          detail={`${data?.yardStock.materials.length ?? 0} scrap types`}
        />
        <SummaryCard
          label="They owe us"
          value={formatCompactCurrency(data?.summary.amountOwedToCompany ?? 0)}
          icon={TrendingUp}
          tone="warning"
          detail={`${data?.summary.balanceCount ?? 0} open balances`}
        />
        <SummaryCard
          label="We owe them"
          value={formatCompactCurrency(data?.summary.amountCompanyOwes ?? 0)}
          icon={TrendingDown}
          tone="success"
          detail={formatCompactCurrency(data?.summary.overdueSettlementAmount ?? 0)}
        />
      </div>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,0.9fr)]">
        <div className="rounded-3xl border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold tracking-[-0.02em] text-[var(--text-strong)]">
                Storage over time
              </h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{formatWeight(data?.yardStock.totalWeight ?? 0)}</p>
            </div>
            <Badge variant="outline">{data?.yardStock.trendSeries.length ?? 0}</Badge>
          </div>
          <AdminTrendChart
            rows={data?.yardStock.trend ?? []}
            series={storageSeries}
            height={310}
            emptyLabel={isLoading ? "Loading storage..." : "No storage trend yet"}
            yTickFormatter={(value) => `${Math.round(value)} kg`}
            valueFormatter={(value) => `${value.toFixed(2)} kg`}
          />
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold tracking-[-0.02em] text-[var(--text-strong)]">
                In yard now
              </h2>
              <Badge variant="outline">{data?.yardStock.materials.length ?? 0}</Badge>
            </div>
            <div className="space-y-3">
              {(data?.yardStock.materials ?? []).slice(0, 6).map((row) => (
                <MaterialStockRow
                  key={row.id}
                  label={row.label}
                  weight={row.weight}
                  value={row.value}
                  maxWeight={maxStoredWeight}
                />
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold tracking-[-0.02em] text-[var(--text-strong)]">
                Critical
              </h2>
              <Badge variant="outline">{data?.queues.settlementBatches.length ?? 0}</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryCard
                label="Bought this month"
                value={formatCompactCurrency(data?.summary.purchasesThisMonthValue ?? 0)}
                icon={Payments}
                detail={formatWeight(data?.summary.purchasesThisMonthWeight ?? 0)}
              />
              <SummaryCard
                label="Sold this month"
                value={formatCompactCurrency(data?.summary.salesThisMonthValue ?? 0)}
                icon={ReceiptLong}
                detail={formatWeight(data?.summary.salesThisMonthWeight ?? 0)}
              />
              <SummaryCard
                label="Margin"
                value={formatCompactCurrency(data?.summary.estimatedMarginThisMonth ?? 0)}
                icon={Coins}
                tone={data && data.summary.estimatedMarginThisMonth < 0 ? "danger" : "default"}
                detail={`${data?.summary.activeMaterialsCount ?? 0} of ${data?.summary.materialsCount ?? 0} active`}
              />
              <SummaryCard
                label="Due settlements"
                value={formatCompactCurrency(data?.summary.overdueSettlementAmount ?? 0)}
                icon={Wallet}
                tone="warning"
                detail={`${data?.queues.settlementBatches.length ?? 0} batches`}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-[-0.02em] text-[var(--text-strong)]">
              Buyer balances
            </h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Only non-zero balances</p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/scrap-metal/settlements">
              Open settlements
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {(data?.balances.operators ?? []).slice(0, 8).map((row) => (
            <BalanceRow
              key={row.id}
              name={row.employee.name}
              employeeId={row.employee.employeeId}
              deliveredValue={row.deliveredValue}
              deliveredWeight={row.deliveredWeight}
              balance={row.balance}
              maxDeliveredValue={maxDeliveredValue}
              maxBalanceValue={maxBalanceValue}
            />
          ))}
        </div>
      </section>
    </ScrapShell>
  );
}
