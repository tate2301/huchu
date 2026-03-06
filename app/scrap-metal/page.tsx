"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { PageIntro } from "@/components/shared/page-intro";
import { StatusState } from "@/components/shared/status-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Coins, Package, Payments, ReceiptLong, Recycle } from "@/lib/icons";

type DashboardMetrics = {
  totalPurchases: number;
  totalPurchaseAmount: number;
  totalBatches: number;
  batchesCollecting: number;
  batchesReady: number;
  totalSales: number;
  totalSalesAmount: number;
  salesPending: number;
};

async function fetchDashboardMetrics(): Promise<DashboardMetrics> {
  const [purchases, batches, sales] = await Promise.all([
    fetchJson<{ data: unknown[]; total: number }>("/api/scrap-metal/purchases?limit=1000"),
    fetchJson<{ data: unknown[]; total: number }>("/api/scrap-metal/batches?limit=1000"),
    fetchJson<{ data: unknown[]; total: number }>("/api/scrap-metal/sales?limit=1000"),
  ]);

  const purchasesData = purchases.data as Array<{ totalAmount: number }>;
  const batchesData = batches.data as Array<{ status: string }>;
  const salesData = sales.data as Array<{ totalAmount: number; status: string }>;

  return {
    totalPurchases: purchases.total,
    totalPurchaseAmount: purchasesData.reduce((sum, p) => sum + p.totalAmount, 0),
    totalBatches: batches.total,
    batchesCollecting: batchesData.filter((b) => b.status === "COLLECTING").length,
    batchesReady: batchesData.filter((b) => b.status === "READY").length,
    totalSales: sales.total,
    totalSalesAmount: salesData.reduce((sum, s) => sum + s.totalAmount, 0),
    salesPending: salesData.filter((s) => s.status === "PENDING_APPROVAL").length,
  };
}

export default function ScrapMetalPage() {
  const {
    data: metrics,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["scrap-metal-dashboard"],
    queryFn: fetchDashboardMetrics,
  });

  return (
    <div className="space-y-6">
      <PageIntro
        purpose=""
        title="Scrap Metal Operations"
      />

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link href="/scrap-metal/purchases">
            <Payments className="mr-2 h-4 w-4" />
            View Purchases
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/scrap-metal/batches">
            <Package className="mr-2 h-4 w-4" />
            View Batches
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/scrap-metal/sales">
            <ReceiptLong className="mr-2 h-4 w-4" />
            View Sales
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/scrap-metal/pricing">
            <Coins className="mr-2 h-4 w-4" />
            Manage Pricing
          </Link>
        </Button>
      </div>

      {error ? (
        <StatusState
          variant="error"
          title="Unable to load dashboard"
        />
      ) : isLoading ? (
        <StatusState variant="loading" title="Loading metrics..." />
      ) : metrics ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Purchases
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalPurchases}</div>
              <p className="text-xs text-muted-foreground mt-1">
                <span className="font-mono">${metrics.totalPurchaseAmount.toFixed(2)}</span> total
                amount
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Batches
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalBatches}</div>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge variant="secondary">{metrics.batchesCollecting} collecting</Badge>
                <Badge variant="secondary">{metrics.batchesReady} ready</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Sales
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalSales}</div>
              <p className="text-xs text-muted-foreground mt-1">
                <span className="font-mono">${metrics.totalSalesAmount.toFixed(2)}</span> total
                amount
              </p>
              {metrics.salesPending > 0 ? (
                <Badge variant="destructive" className="mt-2">
                  {metrics.salesPending} pending approval
                </Badge>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
