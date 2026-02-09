"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { StoresShell } from "@/components/stores/stores-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Package,
  Plus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

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
    queryFn: () => fetchStockMovements({ limit: 4 }),
  });

  const inventoryItems = inventoryData?.data ?? [];
  const recentMovements = movementsData?.data ?? [];

  const lowStockItems = inventoryItems.filter(
    (item) =>
      item.minStock !== null &&
      item.minStock !== undefined &&
      item.currentStock <= item.minStock,
  );
  const criticalItems = inventoryItems.filter(
    (item) => item.currentStock <= 0,
  );
  const totalValue = inventoryItems.reduce(
    (sum, item) => sum + (item.unitCost ?? 0) * item.currentStock,
    0,
  );

  const fuelItems = inventoryItems.filter((item) => item.category === "FUEL");
  const fuelStock = fuelItems.reduce((sum, item) => sum + item.currentStock, 0);
  const fuelMin = fuelItems.reduce(
    (sum, item) => sum + (item.minStock ?? 0),
    0,
  );
  const fuelVariance = fuelStock - fuelMin;
  const fuelBelowMin = fuelMin > 0 && fuelStock < fuelMin;
  const fuelUnit =
    fuelItems.length > 0
      ? fuelItems.every((item) => item.unit === fuelItems[0].unit)
        ? fuelItems[0].unit
        : "units"
      : "units";

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
      {pageError && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load inventory data</AlertTitle>
          <AlertDescription>{getApiErrorMessage(pageError)}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Card className="py-4 gap-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                Inventory Snapshot
              </CardTitle>
              <CardDescription className="text-xs">
                Quick totals across stores
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {inventoryLoading ? (
                <Skeleton className="h-8 w-full" />
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-0 min-w-0 h-8 w-full justify-between px-2"
                >
                  <div className="flex items-center gap-2 text-left">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs">Total Items</span>
                  </div>
                  <span className="text-sm font-semibold">
                    {inventoryItems.length}
                  </span>
                </Button>
              )}
              {inventoryLoading ? (
                <Skeleton className="h-8 w-full" />
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-0 min-w-0 h-8 w-full justify-between px-2"
                >
                  <div className="flex items-center gap-2 text-left">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs">Inventory Value</span>
                  </div>
                  <span className="text-sm font-semibold">
                    ${totalValue.toLocaleString()}
                  </span>
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className="py-4 gap-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                Stock Alerts
              </CardTitle>
              <CardDescription className="text-xs">
                Items below minimums
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {inventoryLoading ? (
                <Skeleton className="h-8 w-full" />
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-0 min-w-0 h-8 w-full justify-between px-2"
                >
                  <div className="flex items-center gap-2 text-left">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs">Low or Critical</span>
                  </div>
                  <span className="text-sm font-semibold text-destructive">
                    {lowStockItems.length}
                  </span>
                </Button>
              )}
              {inventoryLoading ? (
                <Skeleton className="h-8 w-full" />
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-0 min-w-0 h-8 w-full justify-between px-2"
                >
                  <div className="flex items-center gap-2 text-left">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs">Stock Outs</span>
                  </div>
                  <span className="text-sm font-semibold text-destructive">
                    {criticalItems.length}
                  </span>
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className="py-4 gap-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                Fuel Snapshot
              </CardTitle>
              <CardDescription className="text-xs">
                Fuel stock health
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {inventoryLoading ? (
                <Skeleton className="h-12 w-full" />
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-0 min-w-0 h-auto w-full items-start justify-between gap-3 px-2 py-1.5"
                >
                  <div className="flex items-center gap-2 text-left">
                    <Fuel className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs">Fuel Stock</span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm font-semibold">
                      {fuelStock} {fuelUnit}
                    </span>
                    <Badge variant={fuelBelowMin ? "destructive" : "secondary"}>
                      {fuelItems.length === 0
                        ? "No fuel items"
                        : fuelBelowMin
                          ? "Below Min"
                          : "On Target"}
                    </Badge>
                  </div>
                </Button>
              )}
              {inventoryLoading ? (
                <Skeleton className="h-8 w-full" />
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-0 min-w-0 h-8 w-full justify-between px-2"
                >
                  <div className="flex items-center gap-2 text-left">
                    <Minus className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs">Variance to Min</span>
                  </div>
                  <span
                    className={`text-sm font-semibold ${
                      fuelVariance < 0 ? "text-destructive" : ""
                    }`}
                  >
                    {fuelVariance >= 0 ? "+" : ""}
                    {fuelVariance} {fuelUnit}
                  </span>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="py-4 gap-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                Reorder Alerts
              </CardTitle>
              <CardDescription className="text-xs">
                Items below minimum stock
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {inventoryLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : lowStockItems.length === 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-0 min-w-0 h-8 w-full justify-between px-2"
                  disabled
                >
                  No low stock items
                </Button>
              ) : (
                lowStockItems.map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-0 min-w-0 h-auto w-full items-start justify-between gap-3 whitespace-normal px-2 py-1.5"
                  >
                    <div className="flex flex-col items-start text-left">
                      <span className="text-sm font-semibold">{item.name}</span>
                      <span className="text-xs text-muted-foreground">
                        Current: {item.currentStock} {item.unit} | Min: {""}
                        {item.minStock ?? "-"} {item.unit}
                      </span>
                    </div>
                    <Badge variant="destructive">Low</Badge>
                  </Button>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="py-4 gap-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                Recent Movements
              </CardTitle>
              <CardDescription className="text-xs">
                Last 4 transactions
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {movementsLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : recentMovements.length === 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-0 min-w-0 h-8 w-full justify-between px-2"
                  disabled
                >
                  No recent movements
                </Button>
              ) : (
                recentMovements.map((movement) => {
                  const movementType = movement.movementType;
                  const isIssue = movementType === "ISSUE";
                  const isReceipt = movementType === "RECEIPT";
                  const label = isIssue
                    ? "Issue"
                    : isReceipt
                      ? "Receipt"
                      : movementType.toLowerCase();
                  const quantityPrefix = isReceipt
                    ? "+"
                    : isIssue
                      ? "-"
                      : movement.quantity < 0
                        ? ""
                        : "+";
                  return (
                    <Button
                      key={movement.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-0 min-w-0 h-auto w-full items-start justify-between gap-3 whitespace-normal px-2 py-1.5"
                    >
                      <div className="flex items-start gap-2 text-left">
                        {isIssue ? (
                          <TrendingDown className="h-4 w-4 text-destructive" />
                        ) : (
                          <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold">
                            {movement.item.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {isIssue ? "Issued to" : "Received to"}: {""}
                            {movement.issuedTo ?? movement.item.location?.name ?? "-"} | {""}
                            {movement.requestedBy ?? movement.issuedBy?.name ?? "-"}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant={isIssue ? "destructive" : "secondary"}>
                          {label}
                        </Badge>
                        <span
                          className={`text-xs font-semibold ${
                            isIssue ? "text-destructive" : ""
                          }`}
                        >
                          {quantityPrefix}
                          {movement.quantity} {movement.unit}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(movement.createdAt).toLocaleString()}
                        </span>
                      </div>
                    </Button>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </StoresShell>
  );
}
