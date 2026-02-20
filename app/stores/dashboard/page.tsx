"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { StoresShell } from "@/components/stores/stores-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusState } from "@/components/shared/status-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchInventoryItems, fetchStockMovements } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  AlertTriangle,
  Fuel,
  Minus,
  Plus,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "@/lib/icons";

type MetricTone = "neutral" | "success" | "warning" | "danger";

const metricToneClass: Record<MetricTone, string> = {
  neutral: "bg-[var(--surface-subtle)] text-foreground",
  success: "bg-emerald-50/80 text-emerald-900",
  warning: "bg-amber-50/80 text-amber-900",
  danger: "bg-rose-50/80 text-rose-900",
};

function MetricTile({
  label,
  value,
  detail,
  icon: Icon,
  tone = "neutral",
  loading = false,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: LucideIcon;
  tone?: MetricTone;
  loading?: boolean;
}) {
  return (
    <div className={`surface-framed rounded-lg p-3 ${metricToneClass[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-24" />
      ) : (
        <>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{value}</p>
          {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
        </>
      )}
    </div>
  );
}

export default function StoresDashboardPage() {
  const {
    data: inventoryData,
    isLoading: inventoryLoading,
    error: inventoryError,
  } = useQuery({
    queryKey: ["inventory-items", "stores-dashboard"],
    queryFn: () => fetchInventoryItems({ limit: 500 }),
  });

  const {
    data: movementsData,
    isLoading: movementsLoading,
    error: movementsError,
  } = useQuery({
    queryKey: ["stock-movements", "stores-dashboard"],
    queryFn: () => fetchStockMovements({ limit: 8 }),
  });

  const inventoryItems = inventoryData?.data ?? [];
  const recentMovements = movementsData?.data ?? [];

  const lowStockItems = inventoryItems.filter(
    (item) =>
      item.minStock !== null &&
      item.minStock !== undefined &&
      item.currentStock <= item.minStock,
  );
  const criticalItems = inventoryItems.filter((item) => item.currentStock <= 0);
  const totalValue = inventoryItems.reduce(
    (sum, item) => sum + (item.unitCost ?? 0) * item.currentStock,
    0,
  );

  const fuelItems = inventoryItems.filter((item) => item.category === "FUEL");
  const fuelStock = fuelItems.reduce((sum, item) => sum + item.currentStock, 0);
  const fuelMin = fuelItems.reduce((sum, item) => sum + (item.minStock ?? 0), 0);
  const fuelVariance = fuelStock - fuelMin;
  const fuelBelowMin = fuelMin > 0 && fuelStock < fuelMin;
  const fuelUnit =
    fuelItems.length > 0
      ? fuelItems.every((item) => item.unit === fuelItems[0].unit)
        ? fuelItems[0].unit
        : "units"
      : "units";

  const topValueItems = [...inventoryItems]
    .sort((a, b) => (b.unitCost ?? 0) * b.currentStock - (a.unitCost ?? 0) * a.currentStock)
    .slice(0, 6);

  const lowStockPercent =
    inventoryItems.length > 0
      ? Math.round((lowStockItems.length / inventoryItems.length) * 100)
      : 0;
  const fuelCoveragePercent =
    fuelMin > 0
      ? Math.max(0, Math.min(100, Math.round((fuelStock / fuelMin) * 100)))
      : 100;
  const coverageDaysLabel =
    fuelItems.length === 0
      ? "No fuel items"
      : fuelVariance < 0
        ? `${Math.abs(fuelVariance).toFixed(1)} ${fuelUnit} below minimum`
        : `${fuelVariance.toFixed(1)} ${fuelUnit} above minimum`;

  const pageError = inventoryError || movementsError;

  return (
    <StoresShell
      activeTab="dashboard"
      actions={
        <>
          <Button size="sm" asChild>
            <Link href="/stores/issue">
              <Minus className="h-4 w-4" />
              Issue Stock
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/stores/movements">
              <TrendingUp className="h-4 w-4" />
              Movements
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/stores/receive">
              <Plus className="h-4 w-4" />
              Receive Stock
            </Link>
          </Button>
        </>
      }
    >
      {pageError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load inventory data</AlertTitle>
          <AlertDescription>{getApiErrorMessage(pageError)}</AlertDescription>
        </Alert>
      ) : null}

      {!inventoryLoading && inventoryItems.length === 0 ? (
        <StatusState
          variant="empty"
          title="No inventory items yet"
          description="Add inventory items to start tracking stock, fuel, and movements."
        />
      ) : null}

      {!inventoryLoading && inventoryItems.length > 0 && lowStockItems.length === 0 ? (
        <Alert variant="success">
          <AlertTitle>Stock levels healthy</AlertTitle>
          <AlertDescription>No items are currently below their minimum thresholds.</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-5">
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border/60">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-[1.1rem]">Stock Command Center</CardTitle>
                <CardDescription>
                  Inventory risk, valuation, fuel posture, and movement pulse across stores.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="info">Tracked: {inventoryItems.length}</Badge>
                <Badge variant={criticalItems.length > 0 ? "danger" : "success"}>
                  Stock Outs: {criticalItems.length}
                </Badge>
                <Badge variant={fuelBelowMin ? "warning" : "success"}>
                  Fuel: {fuelBelowMin ? "Watch" : "Healthy"}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricTile
                label="Inventory Value"
                value={`$${totalValue.toLocaleString()}`}
                icon={TrendingUp}
                loading={inventoryLoading}
              />
              <MetricTile
                label="Low Stock Exposure"
                value={`${lowStockItems.length}`}
                detail={`${lowStockPercent}% of catalog below threshold`}
                icon={TrendingDown}
                tone={lowStockItems.length > 0 ? "warning" : "success"}
                loading={inventoryLoading}
              />
              <MetricTile
                label="Critical Items"
                value={`${criticalItems.length}`}
                detail={criticalItems.length > 0 ? "Requires immediate replenishment" : "No stock-outs"}
                icon={AlertTriangle}
                tone={criticalItems.length > 0 ? "danger" : "success"}
                loading={inventoryLoading}
              />
              <MetricTile
                label="Fuel Balance"
                value={`${fuelStock.toLocaleString()} ${fuelUnit}`}
                detail={coverageDaysLabel}
                icon={Fuel}
                tone={fuelBelowMin ? "warning" : "success"}
                loading={inventoryLoading}
              />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-5 xl:grid-cols-12">
          <Card className="overflow-hidden xl:col-span-7">
            <CardHeader className="border-b border-border/60">
              <CardTitle className="text-base">Reorder Radar</CardTitle>
              <CardDescription>Items breaching minimum stock, ranked by replenishment pressure.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-2">
                {inventoryLoading ? (
                  <>
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                  </>
                ) : lowStockItems.length === 0 ? (
                  <div className="surface-framed rounded-lg bg-[var(--surface-subtle)] p-3 text-sm text-muted-foreground">
                    No low stock items.
                  </div>
                ) : (
                  lowStockItems.map((item) => {
                    const minStock = item.minStock ?? 0;
                    const shortage = Math.max(0, minStock - item.currentStock);
                    const pressurePercent =
                      minStock > 0
                        ? Math.min(100, Math.round((shortage / minStock) * 100))
                        : item.currentStock <= 0
                          ? 100
                          : 0;

                    return (
                      <div key={item.id} className="surface-framed rounded-lg bg-[var(--surface-subtle)] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{item.name}</p>
                            <p className="text-xs text-muted-foreground">
                              Current: <span className="font-mono tabular-nums">{item.currentStock} {item.unit}</span>
                              {" | "}
                              Min: <span className="font-mono tabular-nums">{minStock} {item.unit}</span>
                            </p>
                          </div>
                          <Badge variant={item.currentStock <= 0 ? "danger" : "warning"}>
                            {item.currentStock <= 0 ? "Stock Out" : "Low"}
                          </Badge>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-background">
                          <div
                            className={item.currentStock <= 0 ? "h-1.5 rounded-full bg-rose-500" : "h-1.5 rounded-full bg-amber-500"}
                            style={{ width: `${pressurePercent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden xl:col-span-5">
            <CardHeader className="border-b border-border/60">
              <CardTitle className="text-base">Movement Feed</CardTitle>
              <CardDescription>Latest receives and issues with quantity deltas.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-2">
                {movementsLoading ? (
                  <>
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                  </>
                ) : recentMovements.length === 0 ? (
                  <div className="surface-framed rounded-lg bg-[var(--surface-subtle)] p-3 text-sm text-muted-foreground">
                    No recent movements.
                  </div>
                ) : (
                  recentMovements.map((movement) => {
                    const movementType = movement.movementType;
                    const isIssue = movementType === "ISSUE";
                    const isReceipt = movementType === "RECEIPT";
                    const quantityPrefix = isReceipt
                      ? "+"
                      : isIssue
                        ? "-"
                        : movement.quantity < 0
                          ? ""
                          : "+";

                    return (
                      <div key={movement.id} className="surface-framed flex items-start justify-between gap-3 rounded-lg bg-[var(--surface-subtle)] p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{movement.item.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {isIssue ? "Issued to" : "Received at"} {movement.issuedTo ?? movement.item.location?.name ?? "-"}
                          </p>
                          <p className="text-xs text-muted-foreground">{new Date(movement.createdAt).toLocaleString()}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Badge variant={isIssue ? "danger" : isReceipt ? "success" : "info"}>
                            {isIssue ? "Issue" : isReceipt ? "Receipt" : movementType}
                          </Badge>
                          <span className="font-mono text-xs font-semibold tabular-nums">
                            {quantityPrefix}{movement.quantity} {movement.unit}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-5 xl:grid-cols-12">
          <Card className="overflow-hidden xl:col-span-4">
            <CardHeader className="border-b border-border/60">
              <CardTitle className="text-base">Fuel Control</CardTitle>
              <CardDescription>Fuel inventory posture against minimum reserve levels.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {inventoryLoading ? (
                <Skeleton className="h-28 w-full" />
              ) : (
                <div className="surface-framed space-y-3 rounded-lg bg-[var(--surface-subtle)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current Fuel</p>
                      <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">
                        {fuelStock.toLocaleString()} {fuelUnit}
                      </p>
                    </div>
                    <Badge variant={fuelBelowMin ? "warning" : "success"}>
                      {fuelBelowMin ? "Below Minimum" : "Within Target"}
                    </Badge>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Coverage</span>
                      <span className="font-mono tabular-nums">{fuelCoveragePercent}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-background">
                      <div
                        className={fuelBelowMin ? "h-2 rounded-full bg-amber-500" : "h-2 rounded-full bg-emerald-500"}
                        style={{ width: `${fuelCoveragePercent}%` }}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Minimum target: <span className="font-mono tabular-nums">{fuelMin.toLocaleString()} {fuelUnit}</span>
                    {" | "}
                    Variance: <span className="font-mono tabular-nums">{fuelVariance >= 0 ? "+" : ""}{fuelVariance.toLocaleString()} {fuelUnit}</span>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden xl:col-span-8">
            <CardHeader className="border-b border-border/60">
              <CardTitle className="text-base">Top Value Inventory</CardTitle>
              <CardDescription>Highest on-hand value items requiring tighter oversight.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {inventoryLoading ? (
                <>
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="mt-2 h-12 w-full" />
                  <Skeleton className="mt-2 h-12 w-full" />
                </>
              ) : topValueItems.length === 0 ? (
                <div className="surface-framed rounded-lg bg-[var(--surface-subtle)] p-3 text-sm text-muted-foreground">
                  No valued stock records available.
                </div>
              ) : (
                <div className="space-y-2">
                  {topValueItems.map((item, index) => {
                    const itemValue = (item.unitCost ?? 0) * item.currentStock;
                    const itemShare = totalValue > 0 ? Math.round((itemValue / totalValue) * 100) : 0;

                    return (
                      <div key={item.id} className="surface-framed flex items-center justify-between gap-3 rounded-lg bg-[var(--surface-subtle)] p-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-background text-xs font-semibold text-muted-foreground">
                            {index + 1}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{item.name}</p>
                            <p className="text-xs text-muted-foreground">
                              Qty: <span className="font-mono tabular-nums">{item.currentStock} {item.unit}</span>
                              {" | "}
                              Unit: <span className="font-mono tabular-nums">${(item.unitCost ?? 0).toLocaleString()}</span>
                            </p>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-mono text-sm font-semibold tabular-nums">${itemValue.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">{itemShare}% of value</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </StoresShell>
  );
}
